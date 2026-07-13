from app.agent.classifier import classify_category
from app.agent.prompts import CATEGORY_SYSTEM_PROMPTS
from app.config import settings
import httpx
import logging
import time

logger = logging.getLogger(__name__)

SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"

# ── Sarvam 11-language set ────────────────────────────────────────────────────
# Sarvam-30B, Sarvam-105B, Mayura (translate), and Bulbul v3 (TTS) ALL support
# exactly these 11 languages. Any language outside this set must be normalised
# to "en-IN" before reaching these APIs to avoid a 400 Invalid Request error.
#
# Saaras v3 (STT) and Sarvam Vision (OCR) support a wider 23-language set but
# our frontend selector already restricts to these 11, so no mismatch occurs.
SARVAM_11_LANG_SET = frozenset({
    "hi-IN",  # Hindi
    "bn-IN",  # Bengali
    "ta-IN",  # Tamil
    "te-IN",  # Telugu
    "gu-IN",  # Gujarati
    "en-IN",  # English
    "kn-IN",  # Kannada
    "ml-IN",  # Malayalam
    "mr-IN",  # Marathi
    "pa-IN",  # Punjabi
    "od-IN",  # Odia
})


def normalise_to_11_lang(lang_code: str) -> str:
    """
    Belt-and-suspenders guard: if a language code is outside Sarvam's 11-language
    set (supported by Sarvam-30B / Mayura / Bulbul v3), fall back to English.

    The frontend selector already only offers these 11 codes (confirmed in
    languages.ts), so this guard fires only if a future code path passes an
    unsupported code, preventing a hard 400 from Sarvam.
    """
    if lang_code in SARVAM_11_LANG_SET:
        return lang_code
    logger.warning(
        "Language '%s' is outside Sarvam's 11-language set — falling back to en-IN. "
        "Supported codes: %s",
        lang_code, sorted(SARVAM_11_LANG_SET),
    )
    return "en-IN"


async def _call_sarvam_llm(system_prompt: str, user_message: str, document_context: str) -> str:
    """
    Calls Sarvam AI's chat completions endpoint using Sarvam-30B.

    Model history (important):
      - "sarvam-m"   → DEPRECATED — Sarvam returns HTTP 400 as of 2026-07.
                        Do not use.
      - "sarvam-30b" → Current recommended model. Confirmed working 2026-07-13.
      - "sarvam-105b"→ Larger alternative (same API shape, higher cost).

    The LLM always receives English input and returns English output.
    Translation to/from the user's regional language is handled separately
    via translate_text() in the chat pipeline (_process_and_respond in chat.py).
    """
    messages = [{"role": "system", "content": system_prompt}]

    if document_context.strip():
        messages.append({
            "role": "user",
            "content": f"Here is relevant document context the user has uploaded:\n\n{document_context[:12000]}"
        })
        messages.append({
            "role": "assistant",
            "content": "Thank you. I have reviewed the document. Please ask your question."
        })

    messages.append({"role": "user", "content": user_message})

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "model": "sarvam-30b",   # sarvam-m is deprecated; sarvam-30b confirmed working 2026-07-13
        "messages": messages,
        "max_tokens": 2000,      # Raised from 1024: sarvam-30b uses internal reasoning tokens;
                                 # 1024 was too low and caused reasoning to exhaust the budget
                                 # before producing a final answer (content=null in response).
        "temperature": 0.3,
    }

    start_time = time.time()
    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_CHAT_URL,
            headers=headers,
            json=payload,
            timeout=120.0,
        )
    logger.info("get_legal_response LLM call (sarvam-30b) took %.2fs", time.time() - start_time)

    if response.status_code != 200:
        logger.error("Sarvam LLM error %s: %s", response.status_code, response.text)
        raise RuntimeError(f"Sarvam LLM returned {response.status_code}: {response.text}")

    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("Sarvam LLM returned no choices in response")

    response_json = data
    content = choices[0].get("message", {}).get("content")
    if content is None:
        # sarvam-30b can return content=null when internal reasoning consumes
        # the full max_tokens budget before producing a final answer.
        # Log the entire raw response so we can inspect finish_reason and
        # any reasoning_content field that might be populated instead.
        logger.error(
            "Sarvam LLM returned null content (reasoning-only response?). "
            "finish_reason=%s full_response=%s",
            choices[0].get("finish_reason", "unknown"),
            response_json,
        )
        raise RuntimeError(
            "Sarvam LLM returned no content "
            "(model exhausted token budget on reasoning — try rephrasing your question)"
        )
    return content.strip()


async def get_legal_response(
    english_query: str,
    category: str,
    extracted_document_text: str = "",
    session_language: str = "en-IN",
) -> tuple[str, str]:
    """
    Main entry point for legal AI reasoning.

    Args:
        english_query: User's question already translated to English.
        category: Chat session category hint (classifier may override).
        extracted_document_text: OCR-extracted document text injected as context.
        session_language: BCP-47 code — used for validation logging only;
            actual translation to the user's language happens in _process_and_respond.

    Returns:
        Tuple of (resolved_category, english_response_text).
    """
    resolved_category = classify_category(english_query, category)
    system_prompt = CATEGORY_SYSTEM_PROMPTS.get(resolved_category, CATEGORY_SYSTEM_PROMPTS["consumer"])

    if (
        not settings.SARVAM_API_KEY
        or "your_sarvam_api_key" in settings.SARVAM_API_KEY.lower()
        or "paste_your" in settings.SARVAM_API_KEY.lower()
        or settings.SARVAM_API_KEY == ""
    ):
        raise ValueError("SARVAM_API_KEY is not configured on the server.")

    # Validate session language against the 11-language set (informational)
    normalise_to_11_lang(session_language)

    response_text = await _call_sarvam_llm(
        system_prompt=system_prompt,
        user_message=english_query,
        document_context=extracted_document_text,
    )
    return resolved_category, response_text
