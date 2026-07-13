import httpx
import re
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


# Sarvam /translate safe per-request character limit.
# Mayura's documented limit is 1000 chars; we use 900 to leave headroom.
_TRANSLATE_CHUNK_LIMIT = 900


def strip_markdown_for_translation(text: str) -> str:
    """
    Convert markdown-formatted LLM output into clean plain prose before sending
    to Sarvam Mayura translation.  Keeps the meaning intact while removing
    formatting symbols that Mayura passes through verbatim (##, **, -, etc.),
    which produce garbled mixed-script output in the translated text.

    Transformations (in order):
      1. ## / ### headings  → sentence followed by a colon
      2. **bold** / *italic* → unwrapped plain text
      3. Bullet lines (- / * / • at start) → inline with '; ' separator
      4. Numbered list lines (1. 2. ...) → kept as "1) 2) ..."
      5. Excess blank lines / trailing whitespace collapsed
    """
    # 1. ATX headings: "### Heading" → "Heading:"
    text = re.sub(r'^#{1,6}\s+(.+)$', r'\1:', text, flags=re.MULTILINE)

    # 2. Bold (**text** or __text__) and italic (*text* or _text_)
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__',     r'\1', text)
    text = re.sub(r'\*(.+?)\*',    r'\1', text)
    text = re.sub(r'_([^_]+)_',    r'\1', text)

    # 3. Bullet list lines  (- item / * item / • item)
    text = re.sub(r'^[\-\*•]\s+', '', text, flags=re.MULTILINE)

    # 4. Numbered list lines (1. item / 1) item)
    text = re.sub(r'^(\d+)[.)\-]\s+', r'\1) ', text, flags=re.MULTILINE)

    # 5. Collapse 3+ blank lines to a single blank line; strip trailing whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = '\n'.join(line.rstrip() for line in text.splitlines())

    return text.strip()


def _split_for_translation(text: str, max_chars: int = _TRANSLATE_CHUNK_LIMIT) -> list[str]:
    """
    Split text into chunks of at most max_chars, preferring paragraph and
    sentence boundaries so Mayura receives complete semantic units.
    """
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    # Try splitting on double-newlines (paragraph breaks) first
    paragraphs = text.split('\n\n')
    current = ""
    for para in paragraphs:
        candidate = (current + "\n\n" + para).lstrip() if current else para
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                chunks.append(current.strip())
            # If a single paragraph exceeds the limit, split on sentence boundaries
            if len(para) > max_chars:
                sentences = re.split(r'(?<=[.!?\u0964])\s+', para)
                buf = ""
                for sent in sentences:
                    test = (buf + " " + sent).strip() if buf else sent
                    if len(test) <= max_chars:
                        buf = test
                    else:
                        if buf:
                            chunks.append(buf)
                        # Hard-split a sentence longer than the limit
                        while len(sent) > max_chars:
                            chunks.append(sent[:max_chars])
                            sent = sent[max_chars:]
                        buf = sent
                if buf:
                    chunks.append(buf)
                current = ""
            else:
                current = para
    if current:
        chunks.append(current.strip())
    return [c for c in chunks if c]


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
        logger.warning(
            "translate_text: source '%s' unsupported by Mayura → normalised to '%s'",
            source_language_code, safe_source,
        )
    if safe_target != target_language_code:
        logger.warning(
            "translate_text: target '%s' unsupported by Mayura → normalised to '%s'",
            target_language_code, safe_target,
        )

    # No translation needed — skip the API call entirely
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
        "Content-Type": "application/json",
    }

    # Strip markdown symbols before translation to avoid garbled output
    # (## / ** pass through Mayura verbatim and appear in the native script)
    if safe_target != "en-IN":
        text = strip_markdown_for_translation(text)

    # Split into chunks that fit within Mayura's per-request limit
    chunks = _split_for_translation(text)
    if len(chunks) > 1:
        logger.info(
            "translate_text (%s→%s): splitting %d-char text into %d chunks",
            safe_source, safe_target, len(text), len(chunks),
        )

    translated_parts: list[str] = []
    for chunk_idx, chunk in enumerate(chunks):
        payload = {
            "input": chunk,
            "source_language_code": safe_source,
            "target_language_code": safe_target,
            "mode": mode if mode in ("formal", "modern-colloquial", "code-mixed", "email") else "formal",
        }

        print(
            f"[translate_text] chunk {chunk_idx+1}/{len(chunks)} "
            f"{safe_source}→{safe_target} mode={payload['mode']} len={len(chunk)}",
            flush=True,
        )

        start_time = time.time()
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    SARVAM_TRANSLATE_URL, headers=headers, json=payload, timeout=30.0
                )
            elapsed = time.time() - start_time

            logger.info(
                "translate_text (%s→%s) chunk %d/%d status=%d elapsed=%.2fs",
                safe_source, safe_target, chunk_idx + 1, len(chunks),
                response.status_code, elapsed,
            )

            if response.status_code != 200:
                err_detail = f"Sarvam Translate returned {response.status_code}: {response.text}"
                logger.error("translate_text: API error on chunk %d — %s", chunk_idx + 1, err_detail)
                print(f"[translate_text] ERROR chunk {chunk_idx+1}: {err_detail}", flush=True)
                raise RuntimeError(err_detail)

            translated_parts.append(response.json().get("translated_text", chunk))

        except httpx.TimeoutException as exc:
            elapsed = time.time() - start_time
            msg = f"translate_text: chunk {chunk_idx+1} timed out after {elapsed:.1f}s"
            print(f"[translate_text] TIMEOUT: {msg}", flush=True)
            logger.error(msg)
            raise RuntimeError(msg) from exc

        except httpx.RequestError as exc:
            elapsed = time.time() - start_time
            msg = f"translate_text: network error on chunk {chunk_idx+1} after {elapsed:.1f}s — {exc}"
            print(f"[translate_text] NETWORK ERROR: {msg}", flush=True)
            logger.error(msg)
            raise RuntimeError(msg) from exc

    result = " ".join(translated_parts)
    logger.info(
        "translate_text (%s→%s) OK — %d chunk(s) input_len=%d output_len=%d",
        safe_source, safe_target, len(chunks), len(text), len(result),
    )
    return result
