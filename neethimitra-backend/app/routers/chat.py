from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import Message, Session as DBSession, User
from app.schemas import ChatResponse
from app.services.legal_ai import get_legal_response
from app.services.sarvam_lid import detect_language
from app.services.sarvam_stt import transcribe_audio
from app.services.sarvam_translate import translate_text
from app.services.sarvam_tts import synthesize_speech
from app.services.session_support import build_session_event, mark_session_active

router = APIRouter(prefix="/api/sessions", tags=["chat"])


class TextMessageRequest(BaseModel):
    text_content: str
    input_type: str = "text"


def _enforce_guest_limit(current_user: User) -> None:
    if current_user.is_anonymous and (current_user.guest_queries_used or 0) >= settings.GUEST_QUERY_LIMIT:
        raise HTTPException(
            status_code=403,
            detail="Guest query limit reached. Please sign in to continue.",
        )


async def _process_and_respond(
    session_id: str,
    original_text: str,
    detected_language: str,
    input_type: str,
    db_session: DBSession,
    db: Session,
    current_user: User,
) -> dict:
    english_query = await translate_text(original_text, detected_language, "en-IN", mode="formal")

    extracted_context = "\n\n".join(
        doc.extracted_text
        for doc in sorted(db_session.documents, key=lambda item: item.created_at, reverse=True)
        if doc.analysis_status == "completed" and doc.extracted_text
    )

    resolved_category, english_response = await get_legal_response(
        english_query=english_query,
        category=db_session.category,
        extracted_document_text=extracted_context,
    )
    db_session.category = resolved_category
    db_session.language_code = detected_language or db_session.language_code
    mark_session_active(db_session, "active")

    user_msg = Message(
        session_id=session_id,
        role="user",
        text_content=original_text,
        original_language=detected_language,
        english_translation=english_query,
        input_type=input_type,
        category=resolved_category,
        processing_status="completed",
        meta_json='{"message_stage":"user_input_saved"}',
    )
    db.add(user_msg)

    regional_response = await translate_text(
        english_response,
        "en-IN",
        db_session.language_code,
        mode="modern-colloquial",
        output_script="native",
    )
    audio_url = await synthesize_speech(regional_response, db_session.language_code)

    ai_msg = Message(
        session_id=session_id,
        role="assistant",
        text_content=regional_response,
        original_language=db_session.language_code,
        english_translation=english_response,
        audio_url=audio_url,
        input_type="voice" if audio_url else "text",
        category=resolved_category,
        processing_status="completed",
        meta_json=(
            f'{{"audio_generated":{str(bool(audio_url)).lower()},'
            f'"used_document_context":{str(bool(extracted_context)).lower()}}}'
        ),
    )
    db.add(ai_msg)

    if current_user.is_anonymous:
        current_user.guest_queries_used = (current_user.guest_queries_used or 0) + 1

    db.add(
        build_session_event(
            session_id=session_id,
            user_id=current_user.id,
            event_type="message_processed",
            payload={
                "input_type": input_type,
                "category": resolved_category,
                "used_document_context": bool(extracted_context),
            },
        )
    )
    db.commit()
    db.refresh(user_msg)
    db.refresh(ai_msg)
    return {"user_message": user_msg, "assistant_message": ai_msg}


@router.post("/{session_id}/messages", response_model=ChatResponse)
async def send_text_message(
    session_id: str,
    payload: TextMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.text_content or not payload.text_content.strip():
        raise HTTPException(status_code=400, detail="text_content must not be empty")
    _enforce_guest_limit(current_user)

    db_session = (
        db.query(DBSession)
        .filter(DBSession.id == session_id, DBSession.user_id == current_user.id)
        .first()
    )
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found or not owned by user")

    requested_language = db_session.language_code or current_user.preferred_language or "en-IN"
    original_text = payload.text_content.strip()
    detected_language = await detect_language(original_text) or requested_language

    return await _process_and_respond(
        session_id=session_id,
        original_text=original_text,
        detected_language=detected_language,
        input_type="text",
        db_session=db_session,
        db=db,
        current_user=current_user,
    )


@router.post("/{session_id}/messages/voice", response_model=ChatResponse)
async def send_voice_message(
    session_id: str,
    audio_file: UploadFile = File(...),
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
    _enforce_guest_limit(current_user)

    requested_language = db_session.language_code or current_user.preferred_language or "en-IN"
    audio_bytes = await audio_file.read()
    original_text = await transcribe_audio(audio_bytes, audio_file.filename or "audio.wav", requested_language)
    if not original_text or not original_text.strip():
        raise HTTPException(status_code=400, detail="Audio transcription returned empty text. Please speak clearly and try again.")

    detected_language = await detect_language(original_text) or requested_language

    return await _process_and_respond(
        session_id=session_id,
        original_text=original_text,
        detected_language=detected_language,
        input_type="voice",
        db_session=db_session,
        db=db,
        current_user=current_user,
    )
