import httpx
from fastapi import HTTPException
from app.config import settings

SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"

async def translate_text(
    text: str,
    source_language_code: str,
    target_language_code: str,
    mode: str = "formal",
    output_script: str = "native"
) -> str:
    """
    Translates text using Sarvam AI Mayura model.
    If source == target, returns text unchanged (no API call).
    Falls back to passthrough if API key is not set.
    """
    if not text or not text.strip():
        return text

    # No translation needed
    if source_language_code == target_language_code:
        return text

    if not settings.SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not configured.")

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "input": text,
        "source_language_code": source_language_code,
        "target_language_code": target_language_code,
        "mode": mode,
        "output_script": output_script
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_TRANSLATE_URL, headers=headers, json=payload, timeout=20.0
        )
        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Sarvam Translate Error ({response.status_code}): {response.text}"
            )
        return response.json().get("translated_text", text)
