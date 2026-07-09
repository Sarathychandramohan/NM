import httpx
from fastapi import HTTPException
from app.config import settings, has_sarvam_key

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"

async def transcribe_audio(file_bytes: bytes, filename: str, language_code: str = "en-IN") -> str:
    """
    Transcribes audio using Sarvam AI Saaras v3.
    Uses 'transcribe' mode so the user's native-language transcript is preserved.
    """
    if not has_sarvam_key():
        return "Amazon gave me a damaged product and is refusing my refund."

    headers = {"api-subscription-key": settings.SARVAM_API_KEY}
    files = {"file": (filename, file_bytes, "audio/wav")}
    data = {
        "model": "saaras:v3",
        "language_code": language_code,
        "mode": "transcribe"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_STT_URL, headers=headers, files=files, data=data, timeout=30.0
        )
        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Sarvam STT Error ({response.status_code}): {response.text}"
            )
        return response.json().get("transcript", "")
