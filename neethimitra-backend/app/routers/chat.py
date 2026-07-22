import logging
import os
import time

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.middleware.rate_limit_deps import check_llm_limit, check_stt_limit, check_tts_limit
from app.models import Message, Session as DBSession, User

from app.schemas import ChatResponse
from app.services.legal_ai import get_legal_response, normalise_to_11_lang
from app.services.sarvam_lid import detect_language
from app.services.sarvam_stt import transcribe_audio
from app.services.sarvam_translate import translate_text
from app.services.sarvam_tts import synthesize_speech
from app.services.session_support import build_session_event, mark_session_active

logger = logging.getLogger(__name__)

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
    session_language: str,       # The authoritative response language for this session
    detected_language: str,      # Language actually detected from the typed text (informational only)
    input_type: str,
    db_session: DBSession,
    db: Session,
    current_user: User,
) -> dict:
    """
    Core pipeline: translate to English → legal AI → translate response back → TTS (voice only).

    session_language is the AUTHORITATIVE language for the response — always set from the
    session's language_code or user's preferred_language, never from LID on typed text.

    For VOICE input:  session_language is the session's confirmed language (STT already
                      translates speech to English — LID on English output is meaningless).
    For TEXT input:   session_language is still the session's language (NOT detected_language).
                      This ensures Tamil session → Tamil response even if user types in English.
    """
    t_start = time.time()
    logger.info(
        "_process_and_respond START — session_id=%s input_type=%s session_language=%s detected_language=%s",
        session_id, input_type, session_language, detected_language,
    )

    # Normalise session_language to Sarvam's 11-language set ONCE at pipeline entry.
    # Mayura (translate), Sarvam-30B (LLM), and Bulbul v3 (TTS) all share the same
    # 11-language constraint. Normalising here means the individual service functions
    # receive a guaranteed-valid code, so they never hit a 400 Invalid Language error.
    safe_lang = normalise_to_11_lang(session_language)
    if safe_lang != session_language:
        logger.warning(
            "_process_and_respond: session_language '%s' outside 11-lang set — "
            "normalised to '%s' for translate/LLM/TTS steps",
            session_language, safe_lang,
        )

    # Translate user message to English for the LLM
    t0 = time.time()
    english_query = await translate_text(original_text, safe_lang, "en-IN", mode="formal")
    logger.info("translate_text (user→en) took %.2fs", time.time() - t0)

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
    if extracted_context:
        logger.info("Document context injected — %d chars", len(extracted_context))

    # Build conversation history (last 5 pairs) for LLM context.
    # We use english_translation so the LLM always works in English.
    # For user messages we fall back to text_content if no translation stored.
    prior_messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at.desc())
        .limit(10)   # 5 user + 5 assistant
        .all()
    )
    # Reverse so oldest comes first (chronological order for the LLM)
    prior_messages = list(reversed(prior_messages))
    conversation_history = [
        {
            "role": msg.role,
            "content": (
                (msg.english_translation or msg.text_content or "").strip()
                if msg.role == "user"
                else (msg.english_translation or msg.text_content or "").strip()
            ),
        }
        for msg in prior_messages
        if (msg.english_translation or msg.text_content or "").strip()
    ]
    logger.info(
        "_process_and_respond: loaded %d prior messages for context",
        len(conversation_history),
    )

    # Legal AI response (English in, English out)
    t0 = time.time()
    resolved_category, english_response = await get_legal_response(
        english_query=english_query,
        category=db_session.category,
        extracted_document_text=extracted_context,
        session_language=safe_lang,
        conversation_history=conversation_history,
    )
    logger.info("get_legal_response (LLM) took %.2fs — category=%s response_len=%d",
                time.time() - t0, resolved_category, len(english_response))

    # Update session metadata (store the original session_language, not the normalised one,
    # so the UI continues to show the user's original language preference)
    db_session.category = resolved_category
    db_session.language_code = session_language
    mark_session_active(db_session, "active")

    # Auto-title: if the session still has the default generated title (e.g. "Land & Property Case"
    # or "{Category} Case"), replace it with the first 45 chars of the user's English query
    # so the sidebar shows a meaningful preview instead of a generic label.
    default_title_suffixes = ("case", "query", "category")
    current_title_lower = (db_session.title or "").lower().strip()
    is_default_title = (
        not current_title_lower
        or any(current_title_lower.endswith(s) for s in default_title_suffixes)
        or current_title_lower in {c.lower() for c in ["consumer", "cybercrime", "land", "labor", "women_dv", "senior", "police", "health", "rti", "complaint"]}
    )
    if is_default_title and not conversation_history:
        # First exchange — set a descriptive title from the user's query
        title_candidate = english_query.strip()
        db_session.title = (title_candidate[:45] + "…") if len(title_candidate) > 45 else title_candidate
        logger.info("Auto-titled session %s: '%s'", session_id, db_session.title)


    # Persist user message
    # original_language is the DETECTED language of this specific message
    # (may differ from session_language when user types in English during a Tamil session).
    # This is what powers the Translate button — it toggles text_content ↔ english_translation.
    user_msg = Message(
        session_id=session_id,
        role="user",
        text_content=original_text,
        original_language=detected_language,   # actual language of THIS message, not session default
        english_translation=english_query,
        input_type=input_type,
        category=resolved_category,
        processing_status="completed",
        meta_json='{"message_stage":"user_input_saved"}',
    )
    db.add(user_msg)

    # Translate English response back to the safe (normalised) session language
    t0 = time.time()
    regional_response = await translate_text(
        english_response,
        "en-IN",
        safe_lang,
        mode="modern-colloquial",
        output_script="native",
    )
    logger.info("translate_text (en→%s) took %.2fs", safe_lang, time.time() - t0)

    # Audio is generated ON-DEMAND only when the user taps "Speak" (POST /speak endpoint).
    # Auto-generating TTS here wasted 2-5s of latency and Sarvam API quota on every voice
    # message, even when the user never listened to the audio.
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

    logger.info(
        "_process_and_respond COMPLETE — total=%.2fs session_id=%s",
        time.time() - t_start, session_id,
    )
    return {"user_message": user_msg, "assistant_message": ai_msg}


@router.post("/{session_id}/messages", response_model=ChatResponse, dependencies=[Depends(check_llm_limit)])
async def send_text_message(
    session_id: str,
    payload: TextMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # DIAGNOSTIC: print() goes straight to stdout unbuffered, proving the route handler was reached
    # even if the logging system is misconfigured. Remove after issue is confirmed resolved.
    print(f"[send_text_message] ENTRY session_id={session_id} user_id={current_user.id}", flush=True)

    t_entry = time.time()
    logger.info(
        "send_text_message ENTRY — session_id=%s user_id=%s text_len=%d",
        session_id, current_user.id, len(payload.text_content or ""),
    )

    try:
        if not payload.text_content or not payload.text_content.strip():
            raise HTTPException(status_code=400, detail="text_content must not be empty")

        # Enforce guest limit BEFORE any processing
        _enforce_guest_limit(current_user)

        try:
            db_session = (
                db.query(DBSession)
                .filter(DBSession.id == session_id, DBSession.user_id == current_user.id)
                .first()
            )
        except Exception as exc:
            logger.exception(
                "send_text_message: DB error fetching session_id=%s user_id=%s: %s",
                session_id, current_user.id, exc,
            )
            print(f"[send_text_message] DB ERROR: {exc}", flush=True)
            raise HTTPException(status_code=500, detail="Database error while loading session. Please try again.")

        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found or not owned by user")

        logger.info("send_text_message: session found in %.3fs", time.time() - t_entry)
        print(f"[send_text_message] session found, language={db_session.language_code}", flush=True)

        original_text = payload.text_content.strip()

        # The session's language_code is the AUTHORITATIVE response language.
        requested_language = db_session.language_code or current_user.preferred_language or "en-IN"

        try:
            detected_language = await detect_language(original_text)
        except Exception as exc:
            logger.warning("detect_language failed (non-fatal, using session language): %s", exc)
            detected_language = requested_language

        logger.info(
            "send_text_message: session_language=%s detected_language=%s",
            requested_language, detected_language,
        )

        return await _process_and_respond(
            session_id=session_id,
            original_text=original_text,
            session_language=requested_language,
            detected_language=detected_language,
            input_type="text",
            db_session=db_session,
            db=db,
            current_user=current_user,
        )

    except HTTPException:
        raise   # Intentional HTTP errors pass through unchanged
    except RuntimeError as exc:
        exc_str = str(exc)
        print(f"[send_text_message] RUNTIME ERROR: {exc_str}", flush=True)
        logger.exception("send_text_message RuntimeError: %s", exc)
        # Specific user-friendly message for the Sarvam null-content pattern
        if "returned no content" in exc_str or "exhausted token budget" in exc_str:
            raise HTTPException(
                status_code=503,
                detail=(
                    "The AI couldn't complete a response — it may have run out of processing capacity. "
                    "Please try rephrasing your question or try again in a moment."
                ),
            )
        raise HTTPException(status_code=500, detail=f"AI service error: {exc_str}")
    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        print(f"[send_text_message] UNHANDLED EXCEPTION: {type(exc).__name__}: {exc}\n{tb}", flush=True)
        logger.exception("send_text_message UNHANDLED: %s", exc)
        raise HTTPException(status_code=500, detail=f"Unexpected server error: {type(exc).__name__}: {exc}")


@router.post(
    "/{session_id}/messages/voice",
    response_model=ChatResponse,
    dependencies=[Depends(check_stt_limit), Depends(check_llm_limit)],
)
async def send_voice_message(
    session_id: str,
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # DIAGNOSTIC: print() goes straight to stdout unbuffered
    print(f"[send_voice_message] ENTRY session_id={session_id} user_id={current_user.id}", flush=True)

    t_entry = time.time()
    logger.info(
        "send_voice_message ENTRY — session_id=%s user_id=%s filename=%s",
        session_id, current_user.id, audio_file.filename,
    )

    try:
        # Enforce guest limit BEFORE reading/processing audio
        _enforce_guest_limit(current_user)

        try:
            db_session = (
                db.query(DBSession)
                .filter(DBSession.id == session_id, DBSession.user_id == current_user.id)
                .first()
            )
        except Exception as exc:
            logger.exception(
                "send_voice_message: DB error fetching session_id=%s user_id=%s: %s",
                session_id, current_user.id, exc,
            )
            print(f"[send_voice_message] DB ERROR: {exc}", flush=True)
            raise HTTPException(status_code=500, detail="Database error while loading session. Please try again.")

        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found or not owned by user")

        logger.info("send_voice_message: session found in %.3fs", time.time() - t_entry)

        requested_language = db_session.language_code or current_user.preferred_language or "en-IN"

        clean_audio_filename = os.path.basename(audio_file.filename or "audio.wav")
        ext = os.path.splitext(clean_audio_filename)[1].lower().lstrip(".")
        if ext not in {"wav", "mp3", "m4a", "webm", "ogg", "caf", "3gp"}:
            raise HTTPException(status_code=400, detail="Only audio files (.wav, .mp3, .m4a, .webm, .ogg) are supported.")

        audio_bytes = await audio_file.read()

        t0 = time.time()
        original_text = await transcribe_audio(audio_bytes, clean_audio_filename, requested_language)
        logger.info("transcribe_audio took %.2fs", time.time() - t0)

        if not original_text or not original_text.strip():
            raise HTTPException(
                status_code=400,
                detail="Audio transcription returned empty text. Please speak clearly and try again."
            )

        return await _process_and_respond(
            session_id=session_id,
            original_text=original_text,
            session_language=requested_language,
            detected_language=requested_language,
            input_type="voice",
            db_session=db_session,
            db=db,
            current_user=current_user,
        )

    except HTTPException:
        raise   # Intentional HTTP errors pass through unchanged
    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        print(f"[send_voice_message] UNHANDLED EXCEPTION: {type(exc).__name__}: {exc}\n{tb}", flush=True)
        logger.exception("send_voice_message UNHANDLED: %s", exc)
        raise HTTPException(status_code=500, detail=f"Unexpected server error: {type(exc).__name__}: {exc}")


@router.post("/{session_id}/messages/{message_id}/speak")
async def speak_message(
    session_id: str,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate TTS audio for an existing text message on demand.

    This endpoint is called when the user taps the "Speak" button on any
    assistant message — including messages that were originally generated
    from a text (not voice) query. It synthesizes audio in the session's
    native language so the user always hears the response in their chosen
    language, regardless of how they originally submitted the query.

    If audio_url is already set (i.e. the message was a voice-input response
    that had TTS generated automatically), it is returned immediately without
    re-synthesizing.
    """
    logger.info(
        "speak_message ENTRY — session_id=%s message_id=%s user_id=%s",
        session_id, message_id, current_user.id,
    )

    try:
        db_session = (
            db.query(DBSession)
            .filter(DBSession.id == session_id, DBSession.user_id == current_user.id)
            .first()
        )
    except Exception as exc:
        logger.exception("speak_message: DB error fetching session: %s", exc)
        raise HTTPException(status_code=500, detail="Database error. Please try again.")

    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found or not owned by user")

    message = (
        db.query(Message)
        .filter(Message.id == message_id, Message.session_id == session_id, Message.role == "assistant")
        .first()
    )
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    raw_lang = message.original_language or db_session.language_code or "en-IN"
    lang = normalise_to_11_lang(raw_lang)
    logger.info("speak_message: synthesizing TTS for message_id=%d lang=%s (raw=%s)", message_id, lang, raw_lang)
    t0 = time.time()
    # Always re-generate — Render free tier ephemeral disk wipes /static/audio/ on every
    # redeploy, so cached audio_url values become 404s after each deploy.
    # Re-generating on every tap is the only reliable approach on free hosting.
    audio_url = await synthesize_speech(message.text_content, lang)
    logger.info("speak_message: synthesize_speech took %.2fs", time.time() - t0)
    message.audio_url = audio_url
    db.commit()
    db.refresh(message)

    return message
