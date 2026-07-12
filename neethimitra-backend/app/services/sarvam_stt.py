import logging

import httpx
import time

from app.config import settings

logger = logging.getLogger(__name__)

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"

# Map audio file extensions to their correct MIME types for the multipart upload
_AUDIO_MIME_TYPES: dict[str, str] = {
    "wav":  "audio/wav",
    "mp3":  "audio/mpeg",
    "m4a":  "audio/mp4",
    "webm": "audio/webm",
    "weba": "audio/webm",
    "ogg":  "audio/ogg",
    "caf":  "audio/x-caf",
    "3gp":  "audio/3gpp",
    "aac":  "audio/aac",
}


def _get_audio_mime_type(filename: str) -> str:
    """Derive the correct MIME type from the audio file's extension."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime = _AUDIO_MIME_TYPES.get(ext, "audio/wav")  # safe fallback to wav
    if mime == "audio/wav" and ext and ext != "wav":
        logger.warning("Unknown audio extension '.%s' — defaulting to audio/wav MIME type", ext)
    return mime


async def transcribe_audio(file_bytes: bytes, filename: str, language_code: str = "en-IN") -> str:
    """
    Transcribes audio using Sarvam AI Saaras v3 in 'transcribe' mode.

    mode='transcribe' keeps the output in the original spoken language (e.g., Tamil speech → Tamil text).
    The caller (send_voice_message) then passes the original-language text through translate_text() to
    convert it to English for the LLM, and back to the session language for the response.

    Correctly maps audio file extensions to their MIME types — previously hardcoded
    to 'audio/wav' which caused API errors for MP3/M4A/WebM files.
    """
    if not settings.SARVAM_API_KEY or "your_sarvam_api_key" in settings.SARVAM_API_KEY.lower() or "paste_your" in settings.SARVAM_API_KEY.lower() or settings.SARVAM_API_KEY == "":
        raise ValueError("SARVAM_API_KEY is not configured on the server.")

    mime_type = _get_audio_mime_type(filename)
    headers = {"api-subscription-key": settings.SARVAM_API_KEY}
    files = {"file": (filename, file_bytes, mime_type)}
    data = {
        "model": "saaras:v3",
        "language_code": language_code,
        "mode": "transcribe",
    }

    start_time = time.time()
    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_STT_URL, headers=headers, files=files, data=data, timeout=30.0
        )
        logger.info(f"transcribe_audio took {time.time()-start_time:.2f}s")
        if response.status_code != 200:
            logger.error("Sarvam STT error %s: %s", response.status_code, response.text)
            raise RuntimeError(
                f"Sarvam STT Error ({response.status_code}): {response.text}"
            )
        return response.json().get("transcript", "")
