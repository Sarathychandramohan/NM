from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_real_user
from app.database import get_db
from app.models import Complaint, Message, Session as DBSession, User
from app.schemas import ComplaintResponse
from app.services.pdf_generator import create_complaint_pdf
from app.services.session_support import build_session_event, mark_session_active

router = APIRouter(prefix="/api/sessions", tags=["complaints"])


@router.post("/{session_id}/complaint", response_model=ComplaintResponse)
async def generate_complaint(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_real_user),   # guests blocked here
):
    db_session = db.query(DBSession).filter(DBSession.id == session_id, DBSession.user_id == current_user.id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found or not owned by user")

    user_messages = [message.text_content for message in db_session.messages if message.role == "user"]
    doc_texts = [document.extracted_text for document in db_session.documents if document.extracted_text]
    pdf_url, summary_text = await create_complaint_pdf(
        session_id=session_id,
        category=db_session.category,
        user_messages=user_messages,
        document_texts=doc_texts,
    )
    next_version = db.query(Complaint).filter(Complaint.session_id == session_id).count() + 1

    db_complaint = Complaint(
        session_id=session_id,
        pdf_path=pdf_url,
        draft_text=summary_text,
        category=db_session.category,
        language_code=db_session.language_code,
        status="generated",
        version=next_version,
    )
    mark_session_active(db_session, "complaint_ready")
    db.add(db_complaint)
    db.add(
        Message(
            session_id=session_id,
            role="assistant",
            text_content=f"I have generated a formal complaint draft PDF for your {db_session.category} issue. You can download and file it after review.",
            original_language=db_session.language_code,
            input_type="text",
            audio_url=None,
            category=db_session.category,
            processing_status="completed",
            meta_json=f'{{"complaint_version":{next_version}}}',
        )
    )
    db.add(
        build_session_event(
            session_id=session_id,
            user_id=current_user.id,
            event_type="complaint_generated",
            payload={"version": next_version, "category": db_session.category},
        )
    )
    db.commit()
    db.refresh(db_complaint)
    return db_complaint


@router.get("/{session_id}/complaint", response_model=ComplaintResponse)
def get_complaint(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_session = db.query(DBSession).filter(DBSession.id == session_id, DBSession.user_id == current_user.id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    complaint = db.query(Complaint).filter(Complaint.session_id == session_id).order_by(Complaint.id.desc()).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="No complaint found for this session")
    return complaint
