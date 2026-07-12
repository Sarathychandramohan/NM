import logging
import httpx
import time
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

    if not settings.SARVAM_API_KEY or "your_sarvam_api_key" in settings.SARVAM_API_KEY.lower() or "paste_your" in settings.SARVAM_API_KEY.lower() or settings.SARVAM_API_KEY == "":
        raise ValueError("SARVAM_API_KEY is not configured on the server.")

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {"input": text[:500]}  # LID only needs a short sample

    start_time = time.time()
    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_LID_URL, headers=headers, json=payload, timeout=30.0
        )
    logger.info(f"detect_language took {time.time()-start_time:.2f}s")

    if response.status_code != 200:
        logger.error("Sarvam LID error %s: %s", response.status_code, response.text)
        raise RuntimeError(f"Sarvam LID call returned {response.status_code}: {response.text}")

    data = response.json()
    lang_code = data.get("language_code") or data.get("detected_language")
    if not lang_code:
        raise RuntimeError(f"Sarvam LID returned no language code: {data}")

    return lang_code
