import httpx
from fastapi import HTTPException
import time
import logging
from app.config import settings
from app.services.legal_ai import SARVAM_11_LANG_SET, normalise_to_11_lang

logger = logging.getLogger(__name__)

SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"

# Mayura (translation model) supports the same 11-language set as Sarvam-30B and Bulbul v3.
# Source or target language outside this set is normalised to en-IN before the API call
# to prevent a 400 Invalid Request error propagating to the user as a broken response.


async def translate_text(
    text: str,
    source_language_code: str,
    target_language_code: str,
    mode: str = "formal",
    output_script: str = "native"
) -> str:
    """
    Translates text using Sarvam AI Mayura (translation model, /translate endpoint).

    Supported languages: the 11-language set (hi-IN, bn-IN, ta-IN, te-IN, gu-IN,
    en-IN, kn-IN, ml-IN, mr-IN, pa-IN, od-IN). Any unsupported code is normalised
    to en-IN with a warning log rather than letting the API return a hard 400.

    If source == target (after normalisation), returns text unchanged — no API call.
    """
    if not text or not text.strip():
        return text

    # Normalise both codes to the 11-language set before sending to Mayura
    safe_source = normalise_to_11_lang(source_language_code)
    safe_target = normalise_to_11_lang(target_language_code)

    if safe_source != source_language_code:
        logger.warning(
            "translate_text: source '%s' unsupported by Mayura, normalised to '%s'",
            source_language_code, safe_source,
        )
    if safe_target != target_language_code:
        logger.warning(
            "translate_text: target '%s' unsupported by Mayura, normalised to '%s'",
            target_language_code, safe_target,
        )

    # No translation needed after normalisation
    if safe_source == safe_target:
        return text

    if (
        not settings.SARVAM_API_KEY
        or "your_sarvam_api_key" in settings.SARVAM_API_KEY.lower()
        or "paste_your" in settings.SARVAM_API_KEY.lower()
        or settings.SARVAM_API_KEY == ""
    ):
        raise ValueError("SARVAM_API_KEY is not configured on the server.")

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "input": text,
        "source_language_code": safe_source,
        "target_language_code": safe_target,
        "mode": mode,
        "output_script": output_script,
    }

    start_time = time.time()
    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_TRANSLATE_URL, headers=headers, json=payload, timeout=30.0
        )
    elapsed = time.time() - start_time
    logger.info("translate_text (%s→%s) took %.2fs", safe_source, safe_target, elapsed)

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Sarvam Translate Error ({response.status_code}): {response.text}"
        )
    return response.json().get("translated_text", text)
