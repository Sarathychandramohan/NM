"""
Voice Selection API Router
==========================
Endpoints for listing, filtering, previewing, and saving Bulbul v3 speaker preferences.

Routes:
  GET  /api/voices                   → All speakers (optionally filtered)
  GET  /api/voices/by-language       → Speakers ranked for a specific language
  GET  /api/voices/by-state          → Auto-detect language from Indian state, return ranked speakers
  POST /api/tts/test                 → Generate a short preview audio clip for a chosen speaker
  POST /api/voices/preference        → Save user's preferred speaker to their profile
  GET  /api/voices/preference        → Get user's current speaker preference
"""

import logging
import time
import uuid
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.config import settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import User
from app.services.voice_config import (
    ALL_VOICES,
    LANGUAGE_DEFAULTS,
    STATE_LANGUAGE_MAP,
    VoiceProfile,
    detect_language_from_state,
    get_default_voice,
    get_voice_by_id,
    get_voices_for_language,
)
from app.services.sarvam_tts import clean_for_tts, concatenate_wav_files

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["voices"])

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"

# ── Pydantic schemas ──────────────────────────────────────────────────────────

class VoiceOut(BaseModel):
    """Serialized voice profile returned to the client."""
    voice_id: str
    display_name: str
    gender: str
    preferred_languages: list[str]
    description: str
    use_cases: list[str]
    quality_score: float
    latency_class: str
    supports_code_mixing: bool
    is_default_for: list[str]       # Language codes where this is the default

class VoiceListResponse(BaseModel):
    total: int
    voices: list[VoiceOut]
    language_defaults: dict[str, dict[str, str]]

class VoicePreferenceRequest(BaseModel):
    speaker: str            # Exact Bulbul v3 speaker name
    language_code: str      # BCP-47 code this preference applies to

class VoicePreferenceResponse(BaseModel):
    language_code: str
    speaker: str
    display_name: str
    gender: str

class VoiceSavedResponse(BaseModel):
    success: bool
    speaker: str
    language_code: str
    message: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _voice_to_out(v: VoiceProfile) -> VoiceOut:
    """Convert a VoiceProfile dataclass to the API response model."""
    is_default_for = [
        lang for lang, defaults in LANGUAGE_DEFAULTS.items()
        if v.voice_id in defaults.values()
    ]
    return VoiceOut(
        voice_id=v.voice_id,
        display_name=v.display_name,
        gender=v.gender,
        preferred_languages=v.preferred_languages,
        description=v.description,
        use_cases=v.use_cases,
        quality_score=v.quality_score,
        latency_class=v.latency_class,
        supports_code_mixing=v.supports_code_mixing,
        is_default_for=is_default_for,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/voices", response_model=VoiceListResponse)
def list_voices(
    gender: Optional[str] = Query(None, description="Filter by gender: 'female' or 'male'"),
    use_case: Optional[str] = Query(None, description="Filter by use case e.g. 'legal_advice', 'police', 'rti'"),
    latency_class: Optional[str] = Query(None, description="Filter by latency: 'fast', 'standard', 'rich'"),
    current_user: User = Depends(get_current_user),
):
    """
    Return the full Bulbul v3 speaker catalogue with optional filters.
    Does not require a specific language — useful for Settings → Voice screen.
    """
    voices = list(ALL_VOICES)

    if gender:
        g = gender.lower()
        if g not in ("female", "male"):
            raise HTTPException(status_code=400, detail="gender must be 'female' or 'male'")
        voices = [v for v in voices if v.gender == g]

    if use_case:
        voices = [v for v in voices if use_case in v.use_cases]

    if latency_class:
        lc = latency_class.lower()
        if lc not in ("fast", "standard", "rich"):
            raise HTTPException(status_code=400, detail="latency_class must be 'fast', 'standard', or 'rich'")
        voices = [v for v in voices if v.latency_class == lc]

    voices = sorted(voices, key=lambda v: (-v.quality_score, v.voice_id))

    return VoiceListResponse(
        total=len(voices),
        voices=[_voice_to_out(v) for v in voices],
        language_defaults=LANGUAGE_DEFAULTS,
    )


@router.get("/voices/by-language", response_model=VoiceListResponse)
def voices_by_language(
    language_code: str = Query(..., description="BCP-47 code: hi-IN, ta-IN, ml-IN, etc."),
    gender: Optional[str] = Query(None),
    use_case: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """
    Return speakers whose preferred_languages includes language_code.
    Results are sorted by quality_score (best first).
    """
    from app.services.legal_ai import SARVAM_11_LANG_SET
    if language_code not in SARVAM_11_LANG_SET:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language_code '{language_code}'. "
                   f"Supported: {sorted(SARVAM_11_LANG_SET)}",
        )

    voices = get_voices_for_language(language_code, gender=gender, use_case=use_case)

    logger.info(
        "voices_by_language: lang=%s gender=%s use_case=%s → %d results",
        language_code, gender, use_case, len(voices),
    )

    return VoiceListResponse(
        total=len(voices),
        voices=[_voice_to_out(v) for v in voices],
        language_defaults=LANGUAGE_DEFAULTS,
    )


@router.get("/voices/by-state", response_model=VoiceListResponse)
def voices_by_state(
    state: str = Query(..., description="Indian state name e.g. 'Tamil Nadu', 'Punjab', 'Kerala'"),
    gender: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """
    Auto-detect the primary language for an Indian state, then return the
    best-ranked speakers for that language.
    Useful for onboarding when the user enters their state but hasn't chosen a language yet.
    """
    language_code = detect_language_from_state(state)
    if not language_code:
        # Fallback: return English speakers for unrecognised states
        language_code = "en-IN"
        logger.warning("voices_by_state: unknown state '%s' — defaulting to en-IN", state)

    voices = get_voices_for_language(language_code, gender=gender)

    return VoiceListResponse(
        total=len(voices),
        voices=[_voice_to_out(v) for v in voices],
        language_defaults={language_code: LANGUAGE_DEFAULTS.get(language_code, {})},
    )


class TtsTestRequest(BaseModel):
    speaker: str
    language_code: str
    text: Optional[str] = None      # Custom preview text (optional; we pick a good default)


@router.post("/tts/test")
async def tts_test(
    body: TtsTestRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a 5-10 second preview audio clip using the chosen speaker.
    Returns a URL to a static WAV file the frontend can play back.

    Uses a short, legally-relevant sample sentence in the target language
    so the user hears what the speaker actually sounds like on this app's content.
    """
    # Validate speaker exists
    voice = get_voice_by_id(body.speaker)
    if not voice:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown speaker '{body.speaker}'. "
                   f"Call GET /api/voices for the valid list.",
        )

    # Build a sensible preview sentence in the target language
    PREVIEW_TEXTS: dict[str, str] = {
        "hi-IN": "नमस्ते, मैं नीति मित्र हूँ। आपके कानूनी प्रश्नों में मैं आपकी सहायता करूँगा।",
        "bn-IN": "নমস্কার, আমি নীতি মিত্র। আপনার আইনি প্রশ্নে আমি সাহায্য করব।",
        "ta-IN": "வணக்கம், நான் நீதி மித்ரா. உங்கள் சட்ட கேள்விகளுக்கு உதவுகிறேன்.",
        "te-IN": "నమస్కారం, నేను నీతి మిత్ర. మీ చట్టపరమైన సందేహాలకు సహాయం చేస్తాను.",
        "gu-IN": "નમસ્તે, હું નીતિ મિત્ર છું. તમારા કાનૂની પ્રશ્નોમાં મદદ કરીશ.",
        "kn-IN": "ನಮಸ್ಕಾರ, ನಾನು ನೀತಿ ಮಿತ್ರ. ನಿಮ್ಮ ಕಾನೂನು ಪ್ರಶ್ನೆಗಳಿಗೆ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.",
        "ml-IN": "നമസ്കാരം, ഞാൻ നീതി മിത്ര ആണ്. നിങ്ങളുടെ നിയമ ചോദ്യങ്ങൾക്ക് സഹായിക്കാം.",
        "mr-IN": "नमस्कार, मी नीती मित्र आहे. तुमच्या कायदेशीर प्रश्नांमध्ये मदत करेन.",
        "pa-IN": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ਨੀਤੀ ਮਿੱਤਰ ਹਾਂ। ਤੁਹਾਡੇ ਕਾਨੂੰਨੀ ਸਵਾਲਾਂ ਵਿੱਚ ਮਦਦ ਕਰਾਂਗਾ।",
        "od-IN": "ନମସ୍କାର, ମୁଁ ନୀତି ମିତ୍ର। ଆପଣଙ୍କ ଆଇନ ପ୍ରଶ୍ନରେ ସାହାଯ୍ୟ କରିବି।",
        "en-IN": "Hello, I am NeethiMitra. I am here to help you understand your legal rights and guide you through legal procedures.",
    }

    preview_text = body.text or PREVIEW_TEXTS.get(body.language_code, PREVIEW_TEXTS["en-IN"])

    # Strip any markdown just in case caller passes in LLM output
    safe_text = clean_for_tts(preview_text[:300])

    if not settings.SARVAM_API_KEY or settings.SARVAM_API_KEY == "":
        raise HTTPException(status_code=503, detail="SARVAM_API_KEY is not configured")

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "text": safe_text,
        "target_language_code": body.language_code,
        "speaker": body.speaker,
        "model": "bulbul:v3",
        "enable_preprocessing": True,
        "pace": 0.95,
    }

    t_start = time.time()
    logger.info(
        "tts_test: user_id=%s speaker=%s lang=%s text_len=%d",
        current_user.id, body.speaker, body.language_code, len(safe_text),
    )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                SARVAM_TTS_URL, headers=headers, json=payload, timeout=30.0
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Sarvam TTS timed out generating preview")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Network error calling Sarvam TTS: {exc}")

    if response.status_code != 200:
        logger.error(
            "tts_test: Sarvam returned %d for speaker=%s lang=%s body=%s",
            response.status_code, body.speaker, body.language_code, response.text[:200],
        )
        raise HTTPException(
            status_code=502,
            detail=f"Sarvam TTS error ({response.status_code}): {response.text[:200]}",
        )

    audios = response.json().get("audios", [])
    if not audios:
        raise HTTPException(status_code=502, detail="Sarvam TTS returned no audio data")

    import base64
    wav_bytes = base64.b64decode(audios[0])

    # Save to static audio dir (same dir as regular TTS output)
    audio_dir = settings.AUDIO_CACHE_DIR
    os.makedirs(audio_dir, exist_ok=True)
    filename = f"preview_{body.speaker}_{uuid.uuid4().hex[:8]}.wav"
    filepath = os.path.join(audio_dir, filename)
    with open(filepath, "wb") as f:
        f.write(wav_bytes)

    elapsed = time.time() - t_start
    logger.info(
        "tts_test: preview generated speaker=%s lang=%s elapsed=%.2fs → %s",
        body.speaker, body.language_code, elapsed, filename,
    )

    return {
        "success": True,
        "speaker": body.speaker,
        "display_name": voice.display_name,
        "gender": voice.gender,
        "language_code": body.language_code,
        "audio_url": f"/static/audio/{filename}",
        "elapsed_seconds": round(elapsed, 2),
        "preview_text": safe_text,
    }


@router.post("/voices/preference", response_model=VoiceSavedResponse)
def save_voice_preference(
    body: VoicePreferenceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Persist the user's chosen speaker for a given language to their profile.
    The preference is stored as JSON in the User.voice_preferences column
    (format: {"hi-IN": "ishita", "ta-IN": "kavya", ...}).

    This speaker will be used by the TTS pipeline instead of the system default
    when the session language matches.
    """
    # Validate speaker
    voice = get_voice_by_id(body.speaker)
    if not voice:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown speaker '{body.speaker}'. Call GET /api/voices for valid speakers.",
        )

    # Validate language
    from app.services.legal_ai import SARVAM_11_LANG_SET
    if body.language_code not in SARVAM_11_LANG_SET:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language_code '{body.language_code}'.",
        )

    # Load existing preferences from the JSON column (if any)
    import json as _json
    existing_raw = getattr(current_user, "voice_preferences", None) or "{}"
    try:
        prefs: dict = _json.loads(existing_raw)
    except (ValueError, TypeError):
        prefs = {}

    # Update the preference for this language
    prefs[body.language_code] = body.speaker
    current_user.voice_preferences = _json.dumps(prefs)   # type: ignore[assignment]
    db.add(current_user)
    db.commit()

    logger.info(
        "save_voice_preference: user_id=%s lang=%s speaker=%s",
        current_user.id, body.language_code, body.speaker,
    )

    return VoiceSavedResponse(
        success=True,
        speaker=body.speaker,
        language_code=body.language_code,
        message=f"Preference saved: {voice.display_name} will be used for {body.language_code} responses.",
    )


@router.get("/voices/preference", response_model=list[VoicePreferenceResponse])
def get_voice_preferences(
    current_user: User = Depends(get_current_user),
):
    """
    Return all of the user's saved speaker preferences.
    Returns one entry per language where the user has made an explicit choice.
    """
    import json as _json
    existing_raw = getattr(current_user, "voice_preferences", None) or "{}"
    try:
        prefs: dict = _json.loads(existing_raw)
    except (ValueError, TypeError):
        prefs = {}

    result = []
    for lang_code, speaker_id in prefs.items():
        voice = get_voice_by_id(speaker_id)
        if voice:
            result.append(VoicePreferenceResponse(
                language_code=lang_code,
                speaker=speaker_id,
                display_name=voice.display_name,
                gender=voice.gender,
            ))

    return result
