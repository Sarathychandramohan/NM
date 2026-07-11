import os
import uuid
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_current_user, require_real_user
from app.database import SessionLocal, get_db
from app.models import Document, Message, Session as DBSession, User
from app.schemas import DocumentResponse
from app.services.sarvam_vision import extract_text_from_document
from app.services.session_support import build_session_event, mark_session_active, summarize_text, utcnow

router = APIRouter(prefix="/api/sessions", tags=["documents"])

ALLOWED_DOCUMENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
}


def _validate_upload(file: UploadFile, file_size_bytes: int) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename")

    clean_original = os.path.basename(file.filename)
    ext = os.path.splitext(clean_original)[1].lower().lstrip(".")
    if ext not in {"pdf", "png", "jpg", "jpeg"}:
        raise HTTPException(status_code=400, detail="Only PDF, PNG, and JPEG file extensions are allowed.")

    if file.content_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail="Only PDF, PNG, and JPEG uploads are supported")

    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size_bytes > max_size:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB} MB limit")


async def _process_document_async(
    document_id: int,
    original_filename: str,
    file_content: bytes,
    mime_type: str,
    session_language: str,
) -> None:
    """
    Native async background task for document processing.
    Uses its own DB session (the request-scoped one is already closed).
    Raises only standard Python exceptions — never FastAPI HTTPException —
    since this runs outside the HTTP request-response lifecycle.
    """
    db = SessionLocal()
    try:
        db_doc = db.query(Document).filter(Document.id == document_id).first()
        if not db_doc:
            return

        db_doc.analysis_status = "processing"
        db_doc.analysis_provider = "sarvam_vision"
        db.commit()

        try:
            # Native await — no asyncio.run() needed; this function is async def
            extracted_markdown = await extract_text_from_document(
                file_bytes=file_content,
                filename=original_filename,
                mime_type=mime_type or "application/pdf",
            )
            db_doc.analysis_status = "completed"
            db_doc.extracted_text = extracted_markdown
            db_doc.extracted_summary = summarize_text(extracted_markdown)
            db_doc.analysis_error = None
        except Exception as exc:
            db_doc.analysis_status = "failed"
            db_doc.analysis_error = str(exc)

        db_doc.processed_at = utcnow()

        session = db.query(DBSession).filter(DBSession.id == db_doc.session_id).first()
        if session:
            mark_session_active(
                session,
                "active" if db_doc.analysis_status == "completed" else "document_attention",
            )

        db.add(
            Message(
                session_id=db_doc.session_id,
                role="assistant",
                text_content=(
                    f"Document '{original_filename}' processed successfully."
                    if db_doc.analysis_status == "completed"
                    else f"Document '{original_filename}' was uploaded but could not be analysed automatically."
                ),
                original_language=session_language,
                input_type="text",
                audio_url=None,
                category=None,
                processing_status="completed",
                meta_json=f'{{"document_id":{db_doc.id},"analysis_status":"{db_doc.analysis_status}"}}',
            )
        )
        db.add(
            build_session_event(
                session_id=db_doc.session_id,
                user_id=db_doc.user_id,
                event_type="document_processed",
                payload={
                    "document_id": db_doc.id,
                    "filename": original_filename,
                    "analysis_status": db_doc.analysis_status,
                },
            )
        )
        db.commit()
    finally:
        db.close()


# ── Bug fix: /user/all-docs MUST be registered before /{session_id}/documents ──
# FastAPI matches routes in registration order. If this came after the parameterised
# route, the literal string "user" would be treated as a session_id and fail.
@router.get("/user/all-docs", response_model=List[DocumentResponse])
def get_user_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetches all documents across all sessions for the logged-in user."""
    return (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .all()
    )


@router.post("/{session_id}/documents", response_model=DocumentResponse)
async def upload_document(
    session_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_real_user),   # guests blocked here
):
    db_session = (
        db.query(DBSession)
        .filter(DBSession.id == session_id, DBSession.user_id == current_user.id)
        .first()
    )
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found or not owned by user")

    file_content = await file.read()
    file_size_bytes = len(file_content)
    _validate_upload(file, file_size_bytes)

    file_id = uuid.uuid4().hex[:8]
    clean_original = os.path.basename(file.filename)
    ext = os.path.splitext(clean_original)[1].lower() or ".bin"
    safe_filename = f"doc_{file_id}{ext}"

    dest_path = os.path.abspath(os.path.join(settings.UPLOAD_DIR, safe_filename))
    if not dest_path.startswith(os.path.abspath(settings.UPLOAD_DIR)):
        raise HTTPException(status_code=400, detail="Invalid path construction")

    with open(dest_path, "wb") as saved_file:
        saved_file.write(file_content)

    db_doc = Document(
        session_id=session_id,
        user_id=current_user.id,
        filename=clean_original,
        file_path=f"/static/uploads/{safe_filename}",
        mime_type=file.content_type,
        file_size_kb=max(1, file_size_bytes // 1024),
        analysis_status="pending",
        extracted_text=None,
        sarvam_job_id=f"local-{uuid.uuid4().hex[:12]}",
        analysis_provider="sarvam_vision",
    )
    mark_session_active(db_session, "processing_documents")
    db.add(db_doc)
    db.add(
        build_session_event(
            session_id=session_id,
            user_id=current_user.id,
            event_type="document_uploaded",
            payload={
                "filename": file.filename,
                "mime_type": file.content_type,
                "file_size_kb": max(1, file_size_bytes // 1024),
            },
        )
    )
    db.commit()
    db.refresh(db_doc)

    # FastAPI runs async background tasks natively in the event loop — no asyncio.run()
    background_tasks.add_task(
        _process_document_async,
        db_doc.id,
        file.filename,
        file_content,
        file.content_type or "application/pdf",
        db_session.language_code,
    )

    return db_doc


@router.get("/{session_id}/documents", response_model=List[DocumentResponse])
def list_documents(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_session = (
        db.query(DBSession)
        .filter(DBSession.id == session_id, DBSession.user_id == current_user.id)
        .first()
    )
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found or not owned by user")

    return (
        db.query(Document)
        .filter(Document.session_id == session_id, Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .all()
    )
