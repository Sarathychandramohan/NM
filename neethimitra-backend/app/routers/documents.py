import os
import uuid
import logging
import traceback
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_current_user, require_real_user
from app.database import SessionLocal, get_db
from app.models import Document, Message, Session as DBSession, User
from app.schemas import DocumentResponse
from app.services.sarvam_vision import extract_text_from_document
from app.services.document_analysis import (
    classify_document_type,
    extract_document_entities,
    analyze_document_with_llm,
    calculate_document_confidence,
    DocumentType,
)
from app.services.document_monitor import doc_monitor
from app.services.session_support import build_session_event, mark_session_active, summarize_text, utcnow
from app.core.security import sign_file_url

logger = logging.getLogger(__name__)
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

    # Standardise MIME type for client requests sending generic or missing headers (e.g. from mobile file pickers)
    if not file.content_type or file.content_type in ("application/octet-stream", "application/x-download", "unknown"):
        if ext == "pdf":
            file.content_type = "application/pdf"
        elif ext in ("jpg", "jpeg"):
            file.content_type = "image/jpeg"
        elif ext == "png":
            file.content_type = "image/png"

    if file.content_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Only PDF, PNG, and JPEG uploads are supported. Detected: {file.content_type}")

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
    start_time = time.time()
    job_id = f"doc_{document_id}_{uuid.uuid4().hex[:6]}"

    try:
        db_doc = db.query(Document).filter(Document.id == document_id).first()
        if not db_doc:
            return

        # Track telemetry job start
        doc_monitor.track_job_start(
            job_id=job_id,
            user_id=str(db_doc.user_id),
            metadata={"document_type": "pending", "file_size": len(file_content)},
        )
        doc_monitor.track_job_start_processing(job_id)

        db_doc.analysis_status = "processing"
        db_doc.analysis_provider = "sarvam_vision"
        db.commit()

        entities: dict = {}
        analysis: dict = {}
        doc_type: DocumentType = DocumentType.GENERAL_LEGAL

        try:
            # Step 1: Sarvam Vision OCR Extraction
            extracted_markdown = await extract_text_from_document(
                file_bytes=file_content,
                filename=original_filename,
                mime_type=mime_type or "application/pdf",
            )

            # Step 2: Intelligent Classification & Entity Extraction
            doc_type = classify_document_type(original_filename, extracted_markdown)
            entities = extract_document_entities(extracted_markdown)

            # Step 3: Sarvam-30B Structured Legal Analysis
            analysis = await analyze_document_with_llm(extracted_markdown, doc_type)
            conf = calculate_document_confidence(extracted_markdown, analysis)

            db_doc.analysis_status = "completed"
            db_doc.extracted_text = extracted_markdown
            db_doc.extracted_summary = summarize_text(extracted_markdown)
            db_doc.analysis_error = None

            # Store entities + analysis in meta_json
            import json as _json
            db_doc.meta_json = _json.dumps({
                "document_type": doc_type.value,
                "entities": entities,
                "analysis": analysis,
                "confidence": conf,
            })

            elapsed = time.time() - start_time
            doc_monitor.track_job_complete(job_id, elapsed)

        except Exception as exc:
            tb = traceback.format_exc()
            logger.exception("Document processing failed for ID %s (%s): %s", document_id, original_filename, str(exc))
            db_doc.analysis_status = "failed"
            db_doc.analysis_error = f"{str(exc)}\n{tb}"
            doc_monitor.track_job_failed(job_id, str(exc))

        db_doc.processed_at = utcnow()

        # Retrieve the upload session
        orig_session = db.query(DBSession).filter(DBSession.id == db_doc.session_id).first()
        target_session = orig_session

        if db_doc.analysis_status == "completed":
            # Map DocumentType to category and action prompt
            category_mapping = {
                DocumentType.CRIMINAL_CASE: ("police", "complaint_draft", "I can help draft a complaint/FIR response or explain legal rights."),
                DocumentType.DOMESTIC_VIOLENCE: ("women_dv", "chat", "I can guide you on domestic violence protection orders and legal remedies."),
                DocumentType.PROPERTY_DOCUMENT: ("land", "chat", "I can review land records, registry rules, or mutation documents."),
                DocumentType.LABOR_DISPUTE: ("labor", "chat", "I can help verify labor rights, gratuity rules, or termination notices."),
                DocumentType.CYBER_CRIME: ("cybercrime", "chat", "I can assist with IT Act reporting and online fraud complaints."),
                DocumentType.FAMILY_LAW: ("general", "chat", "I can guide you through maintenance, custody, or family law rules."),
                DocumentType.COURT_NOTICE: ("general", "chat", "I can analyze this court summons, explain deadlines, and guide next steps."),
                DocumentType.LEGAL_AID_FORM: ("rti", "form_fill", "I can assist in applying for free legal aid under Section 12."),
            }

            cat, s_type, act_text = category_mapping.get(
                doc_type,
                ("general", "chat", "I can help analyze this legal document, clarify jargon, and guide your next steps.")
            )

            session_title = f"{doc_type.value.replace('_', ' ').title()} — {original_filename[:25]}"

            # Create a brand new linked chat session for this document
            new_session_id = str(uuid.uuid4())
            new_session = DBSession(
                id=new_session_id,
                user_id=db_doc.user_id,
                title=session_title,
                category=cat,
                language_code=session_language,
                session_type=s_type,
                source_document_id=db_doc.id,
                source="document",
                is_active=True,
                status="active"
            )
            db.add(new_session)
            db.flush()

            # Re-associate the document with the new session
            db_doc.session_id = new_session.id
            target_session = new_session

            # Soft-archive/deactivate the temporary placeholder upload session
            if orig_session and orig_session.category == "general" and (orig_session.title == "General Legal Query" or orig_session.title.endswith("Case")):
                orig_session.is_active = False

        if target_session:
            mark_session_active(
                target_session,
                "active" if db_doc.analysis_status == "completed" else "document_attention",
            )

            # Auto-generate rich welcome message
            if db_doc.analysis_status == "completed":
                # Build extracted entities display block
                ent_lines = []
                if entities.get("case_numbers"):
                    ent_lines.append(f"• **Case/FIR No:** {', '.join(entities['case_numbers'])}")
                if entities.get("court_names"):
                    ent_lines.append(f"• **Court:** {', '.join(entities['court_names'])}")
                if entities.get("section_numbers"):
                    ent_lines.append(f"• **Legal Sections:** {', '.join(entities['section_numbers'])}")
                if entities.get("amounts"):
                    ent_lines.append(f"• **Amounts Mentioned:** {', '.join(entities['amounts'])}")

                entities_block = "\n".join(ent_lines) if ent_lines else "No specific case numbers or sections detected."

                key_issues_list = analysis.get("key_issues", [])
                next_steps_list = analysis.get("next_steps", [])

                issues_str = "\n".join([f"1. {issue}" for issue in key_issues_list[:3]]) if key_issues_list else db_doc.extracted_summary
                next_steps_str = "\n".join([f"- {step}" for step in next_steps_list[:3]]) if next_steps_list else "Consult a qualified advocate for specific advice."

                welcome_content = (
                    f"📄 **Document Processed Successfully** ({doc_type.value.replace('_', ' ').title()})\n\n"
                    f"**Extracted Legal Entities:**\n"
                    f"{entities_block}\n\n"
                    f"**Key Issues Identified:**\n"
                    f"{issues_str}\n\n"
                    f"**Recommended Next Steps:**\n"
                    f"{next_steps_str}\n\n"
                    f"{act_text}"
                )
            else:
                welcome_content = f"Document '{original_filename}' was uploaded, but OCR processing encountered an issue."

            db.add(
                Message(
                    session_id=target_session.id,
                    role="assistant",
                    text_content=welcome_content,
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
                    session_id=target_session.id,
                    user_id=db_doc.user_id,
                    event_type="document_processed",
                    payload={
                        "document_id": db_doc.id,
                        "filename": original_filename,
                        "analysis_status": db_doc.analysis_status,
                        "document_type": doc_type.value if db_doc.analysis_status == "completed" else "unknown",
                    },
                )
            )
        db.commit()
    finally:
        db.close()


@router.get("/user/all-docs", response_model=List[DocumentResponse])
def get_user_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetches all documents across all sessions for the logged-in user with signed download links."""
    docs = (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    res = []
    for d in docs:
        item = DocumentResponse.model_validate(d)
        item.file_path = sign_file_url(item.file_path, current_user.id)
        res.append(item)
    return res


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

    background_tasks.add_task(
        _process_document_async,
        db_doc.id,
        file.filename,
        file_content,
        file.content_type or "application/pdf",
        db_session.language_code,
    )

    res = DocumentResponse.model_validate(db_doc)
    res.file_path = sign_file_url(res.file_path, current_user.id)
    return res


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

    docs = (
        db.query(Document)
        .filter(Document.session_id == session_id, Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    res = []
    for d in docs:
        item = DocumentResponse.model_validate(d)
        item.file_path = sign_file_url(item.file_path, current_user.id)
        res.append(item)
    return res
