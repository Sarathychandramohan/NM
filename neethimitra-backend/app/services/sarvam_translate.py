import httpx
import time
import logging
import sys
from app.config import settings
from app.services.legal_ai import normalise_to_11_lang

logger = logging.getLogger(__name__)

SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"

# Mayura (Sarvam's translation model) supports the same 11-language set as
# Sarvam-30B and Bulbul v3. Any unsupported language code is normalised to
# en-IN before the API call to prevent a 400/422 error from the API.
#
# IMPORTANT — Sarvam /translate API valid parameters:
#   - input: str
#   - source_language_code: BCP-47 code (must be in 11-lang set)
#   - target_language_code: BCP-47 code (must be in 11-lang set)
#   - mode: "formal" | "modern-colloquial" | "code-mixed" | "email"
#
#   NOTE: "output_script" is NOT a valid parameter for the /translate endpoint.
#   Including unknown parameters may cause a 422 Unprocessable Entity response.
#   It has been removed from all payloads.


async def translate_text(
    text: str,
    source_language_code: str,
    target_language_code: str,
    mode: str = "formal",
    output_script: str = "native",  # kept in signature for call-site compat; NOT sent to API
) -> str:
    """
    Translates text using Sarvam AI Mayura (/translate endpoint).

    Supported languages: the 11-language set (hi-IN, bn-IN, ta-IN, te-IN, gu-IN,
    en-IN, kn-IN, ml-IN, mr-IN, pa-IN, od-IN).

    - Any unsupported language code is silently normalised to en-IN.
    - If source == target after normalisation, returns text unchanged (no API call).
    - On API failure: raises RuntimeError with full detail (NOT HTTPException, so
      the caller's try/except can catch it and log the actual Sarvam error body).
    - output_script parameter is accepted for call-site compatibility but intentionally
      NOT sent to the API (it is not a documented /translate parameter and causes 422).
    """
    if not text or not text.strip():
        return text

    # Normalise both codes to Mayura's supported 11-language set
    safe_source = normalise_to_11_lang(source_language_code)
    safe_target = normalise_to_11_lang(target_language_code)

    if safe_source != source_language_code:
        print(
            f"[translate_text] WARN: source '{source_language_code}' unsupported → normalised to '{safe_source}'",
            flush=True,
        )
        logger.warning(
            "translate_text: source '%s' unsupported by Mayura → normalised to '%s'",
            source_language_code, safe_source,
        )
    if safe_target != target_language_code:
        print(
            f"[translate_text] WARN: target '{target_language_code}' unsupported → normalised to '{safe_target}'",
            flush=True,
        )
        logger.warning(
            "translate_text: target '%s' unsupported by Mayura → normalised to '%s'",
            target_language_code, safe_target,
        )

    # No translation needed — skip the API call entirely
    if safe_source == safe_target:
        print(f"[translate_text] source==target={safe_source} — skipping API call", flush=True)
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
        "Content-Type": "application/json",
    }

    # ONLY include documented /translate parameters.
    # output_script is NOT a valid parameter and must NOT be sent.
    payload = {
        "input": text[:1000],             # Sarvam translate has a per-request char limit
        "source_language_code": safe_source,
        "target_language_code": safe_target,
        "mode": mode if mode in ("formal", "modern-colloquial", "code-mixed", "email") else "formal",
    }

    print(
        f"[translate_text] START {safe_source}→{safe_target} mode={payload['mode']} text_len={len(text)}",
        flush=True,
    )
    logger.info(
        "translate_text: START %s→%s mode=%s text_len=%d",
        safe_source, safe_target, payload["mode"], len(text),
    )

    start_time = time.time()
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                SARVAM_TRANSLATE_URL, headers=headers, json=payload, timeout=30.0
            )
        elapsed = time.time() - start_time

        print(
            f"[translate_text] RESPONSE {safe_source}→{safe_target} status={response.status_code} elapsed={elapsed:.2f}s body={response.text[:300]}",
            flush=True,
        )
        logger.info(
            "translate_text (%s→%s) status=%d elapsed=%.2fs",
            safe_source, safe_target, response.status_code, elapsed,
        )

        if response.status_code != 200:
            # Raise RuntimeError (not HTTPException 502) so the caller's try/except
            # can catch it, log it, and decide what to do. An HTTP 502 from OUR API
            # implies WE are the broken gateway — misleading when the actual issue
            # is Sarvam's Mayura API returning an error.
            err_detail = f"Sarvam Translate returned {response.status_code}: {response.text}"
            logger.error("translate_text: API error — %s", err_detail)
            print(f"[translate_text] ERROR: {err_detail}", flush=True)
            raise RuntimeError(err_detail)

        translated = response.json().get("translated_text", text)
        logger.info(
            "translate_text (%s→%s) OK — output_len=%d",
            safe_source, safe_target, len(translated),
        )
        return translated

    except httpx.TimeoutException as exc:
        elapsed = time.time() - start_time
        msg = f"translate_text: Sarvam Translate timed out after {elapsed:.1f}s"
        print(f"[translate_text] TIMEOUT: {msg}", flush=True)
        logger.error(msg)
        raise RuntimeError(msg) from exc

    except httpx.RequestError as exc:
        elapsed = time.time() - start_time
        msg = f"translate_text: network error reaching Sarvam Translate after {elapsed:.1f}s — {exc}"
        print(f"[translate_text] NETWORK ERROR: {msg}", flush=True)
        logger.error(msg)
        raise RuntimeError(msg) from exc
