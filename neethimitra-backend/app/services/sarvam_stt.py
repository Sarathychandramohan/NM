import logging

import httpx

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
    Transcribes audio using Sarvam AI Saaras v3.
    Uses 'translate' mode so regional voice is directly output as English text.
    Correctly maps audio file extensions to their MIME types — previously hardcoded
    to 'audio/wav' which caused API errors for MP3/M4A/WebM files.
    """
    if not settings.SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not configured.")

    mime_type = _get_audio_mime_type(filename)
    headers = {"api-subscription-key": settings.SARVAM_API_KEY}
    files = {"file": (filename, file_bytes, mime_type)}
    data = {
        "model": "saaras:v3",
        "language_code": language_code,
        "mode": "transcribe",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_STT_URL, headers=headers, files=files, data=data, timeout=30.0
        )
        if response.status_code != 200:
            logger.error("Sarvam STT error %s: %s", response.status_code, response.text)
            raise RuntimeError(
                f"Sarvam STT Error ({response.status_code}): {response.text}"
            )
        return response.json().get("transcript", "")
