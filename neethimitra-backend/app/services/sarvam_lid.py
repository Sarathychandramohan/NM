import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

SARVAM_LID_URL = "https://api.sarvam.ai/text-lid"


async def detect_language(text: str) -> str:
    """
    Detect the language of the given text using Sarvam AI LID.
    Returns a BCP-47 language code like 'ta-IN', 'hi-IN', 'en-IN', etc.
    """
    if not text or not text.strip():
        return "en-IN"

    if not settings.SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not configured.")

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {"input": text[:500]}  # LID only needs a short sample

    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_LID_URL, headers=headers, json=payload, timeout=10.0
        )

    if response.status_code != 200:
        logger.error("Sarvam LID error %s: %s", response.status_code, response.text)
        raise RuntimeError(f"Sarvam LID call returned {response.status_code}: {response.text}")

    data = response.json()
    lang_code = data.get("language_code") or data.get("detected_language")
    if not lang_code:
        raise RuntimeError(f"Sarvam LID returned no language code: {data}")

    return lang_code
