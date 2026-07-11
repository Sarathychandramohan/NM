import os
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
    """
    Raises 403 if the guest user has used all their free queries.
    Called BEFORE any processing begins to prevent wasted API calls.
    """
    if current_user.is_anonymous and (current_user.guest_queries_used or 0) >= settings.GUEST_QUERY_LIMIT:
        raise HTTPException(
            status_code=403,
            detail="Guest query limit reached. Please sign in to continue.",
        )


async def _process_and_respond(
    session_id: str,
    original_text: str,
    session_language: str,       # The confirmed language for this session (from session or STT input lang)
    detected_language: str,      # Language actually detected from the typed text (for text input)
    input_type: str,
    db_session: DBSession,
    db: Session,
    current_user: User,
) -> dict:
    """
    Core pipeline: translate to English → legal AI → translate response back → TTS (voice only).

    For VOICE input:  session_language is used for the response because STT already
                      translated the speech to English — LID on English output is meaningless.
    For TEXT input:   detected_language (from LID on the typed text) is used.
    """
    # Translate user message to English for the LLM
    english_query = await translate_text(original_text, session_language, "en-IN", mode="formal")

    # Pull extracted document context from the session (newest documents first)
    # Bug fix: key uses .timestamp() (float) to avoid TypeError when created_at is None.
    # Sorting raw datetime objects raises "< not supported between NoneType and datetime".
    extracted_context = "\n\n".join(
        doc.extracted_text
        for doc in sorted(
            db_session.documents,
            key=lambda item: item.created_at.timestamp() if item.created_at else 0.0,
            reverse=True,
        )
        if doc.analysis_status == "completed" and doc.extracted_text
    )

    # Legal AI response (English in, English out)
    resolved_category, english_response = await get_legal_response(
        english_query=english_query,
        category=db_session.category,
        extracted_document_text=extracted_context,
    )

    # Update session metadata
    db_session.category = resolved_category
    db_session.language_code = session_language
    mark_session_active(db_session, "active")

    # Persist user message
    user_msg = Message(
        session_id=session_id,
        role="user",
        text_content=original_text,
        original_language=session_language,
        english_translation=english_query,
        input_type=input_type,
        category=resolved_category,
        processing_status="completed",
        meta_json='{"message_stage":"user_input_saved"}',
    )
    db.add(user_msg)

    # Translate English response back to the user's language
    regional_response = await translate_text(
        english_response,
        "en-IN",
        session_language,
        mode="modern-colloquial",
        output_script="native",
    )

    # Synthesize speech automatically ONLY if the input was voice
    if input_type == "voice":
        audio_url = await synthesize_speech(regional_response, session_language)
    else:
        audio_url = None

    # Persist assistant message
    ai_msg = Message(
        session_id=session_id,
        role="assistant",
        text_content=regional_response,
        original_language=session_language,
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

    # Increment guest query counter atomically with the message save
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

    # Bug 3 fix: enforce guest limit BEFORE any processing
    _enforce_guest_limit(current_user)

    db_session = (
        db.query(DBSession)
        .filter(DBSession.id == session_id, DBSession.user_id == current_user.id)
        .first()
    )
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found or not owned by user")

    # For text messages: run LID on the typed text to detect the language
    original_text = payload.text_content.strip()
    requested_language = db_session.language_code or current_user.preferred_language or "en-IN"
    detected_language = await detect_language(original_text) or requested_language

    return await _process_and_respond(
        session_id=session_id,
        original_text=original_text,
        session_language=detected_language,   # Use LID result for typed text
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
    # Bug 3 fix: enforce guest limit BEFORE reading/processing audio
    _enforce_guest_limit(current_user)

    db_session = (
        db.query(DBSession)
        .filter(DBSession.id == session_id, DBSession.user_id == current_user.id)
        .first()
    )
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found or not owned by user")

    # The session language is the authoritative language for voice — set when session was created
    requested_language = db_session.language_code or current_user.preferred_language or "en-IN"

    clean_audio_filename = os.path.basename(audio_file.filename or "audio.wav")
    ext = os.path.splitext(clean_audio_filename)[1].lower().lstrip(".")
    if ext not in {"wav", "mp3", "m4a", "webm", "ogg", "caf", "3gp"}:
        raise HTTPException(status_code=400, detail="Only audio files (.wav, .mp3, .m4a, .webm, .ogg) are supported.")

    audio_bytes = await audio_file.read()

    # STT with mode="translate" → Saaras v3 outputs English text directly
    # Bug 2 fix: we do NOT run LID on this English output — it would detect "en-IN"
    # and overwrite session_language, causing the response to be in English not the user's language.
    # We use requested_language (the session's language) as the confirmed session_language.
    original_text = await transcribe_audio(audio_bytes, clean_audio_filename, requested_language)
    if not original_text or not original_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Audio transcription returned empty text. Please speak clearly and try again."
        )

    return await _process_and_respond(
        session_id=session_id,
        original_text=original_text,
        session_language=requested_language,  # Bug 2 fix: use session language, NOT LID on English output
        detected_language=requested_language,
        input_type="voice",
        db_session=db_session,
        db=db,
        current_user=current_user,
    )


@router.post("/{session_id}/messages/{message_id}/speak")
async def speak_message(
    session_id: str,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate TTS audio for an existing text message on demand."""
    db_session = (
        db.query(DBSession)
        .filter(DBSession.id == session_id, DBSession.user_id == current_user.id)
        .first()
    )
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found or not owned by user")

    message = (
        db.query(Message)
        .filter(Message.id == message_id, Message.session_id == session_id, Message.role == "assistant")
        .first()
    )
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    if not message.audio_url:
        lang = message.original_language or db_session.language_code or "en-IN"
        audio_url = await synthesize_speech(message.text_content, lang)
        message.audio_url = audio_url
        db.commit()
        db.refresh(message)

    return message
