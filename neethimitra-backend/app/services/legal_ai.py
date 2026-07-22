from app.agent.classifier import classify_category
from app.agent.prompts import CATEGORY_SYSTEM_PROMPTS
from app.config import settings
import httpx
import logging
import time
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from app.utils.rate_limiter import llm_limiter, stt_limiter

logger = logging.getLogger(__name__)

SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"

# ── Sarvam 11-language set ────────────────────────────────────────────────────
SARVAM_11_LANG_SET = frozenset({
    "hi-IN", "bn-IN", "ta-IN", "te-IN", "gu-IN",
    "en-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "od-IN",
})


def normalise_to_11_lang(lang_code: str) -> str:
    if lang_code in SARVAM_11_LANG_SET:
        return lang_code
    logger.warning(
        "Language '%s' is outside Sarvam's 11-language set — falling back to en-IN. "
        "Supported codes: %s",
        lang_code, sorted(SARVAM_11_LANG_SET),
    )
    return "en-IN"


# ── Domain-aware reasoning_effort map ───────────────────────────────────────────
# Source: Sarvam AI documentation answer to Q2:
#   "Reserve higher reasoning_effort for genuinely complex eligibility reasoning,
#    since reasoning tokens bill as completion tokens and add latency."
#
# reasoning_effort=None   → FASTEST, zero reasoning token overhead, ideal for
#                           direct factual Q&A (RTI deadlines, helpline numbers).
# reasoning_effort="low"  → minimal chain-of-thought, best for legal analysis
#                           that benefits from lightweight structured reasoning
#                           (property disputes, FIR procedure, multi-step law).
DOMAIN_REASONING_EFFORT: dict[str, str | None] = {
    # Simple / direct Q&A domains — fastest path, no reasoning overhead
    "rti":      None,   # RTI Act 2005 deadlines & process are factual
    "consumer": None,   # Consumer forum steps are procedural & well-documented
    "senior":   None,   # Senior citizen maintenance procedures are straightforward
    "labor":    None,   # Labour law processes are procedural
    # Complex / multi-step reasoning domains — minimal reasoning for accuracy
    "land":     "low",  # Property law requires cross-referencing multiple acts
    "police":   "low",  # FIR process + criminal procedure requires precise steps
    "cybercrime": "low", # Evidence preservation + cybercrime law is nuanced
    "health":   "low",  # Medical negligence requires structured legal analysis
    "women_dv": "low",  # DV Act + family law has multi-step remedies
    "complaint": "low", # Complaint drafting requires structured legal writing
}


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    reraise=True,
)
async def _call_sarvam_llm(
    system_prompt: str,
    user_message: str,
    document_context: str,
    conversation_history: list[dict] | None = None,
    reasoning_effort: str | None = None,
) -> str:
    """
    Calls Sarvam AI's chat completions endpoint using Sarvam-30B with automatic retry logic.
    reasoning_effort: None for simple Q&A (fastest), 'low' for complex legal analysis.
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

    if conversation_history:
        for turn in conversation_history[-10:]:
            role = turn.get("role", "user")
            content = (turn.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_message})

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "model": "sarvam-30b",
        "messages": messages,
        "max_tokens": 2000,
        "temperature": 0.3,
        "reasoning_effort": reasoning_effort,  # None=fastest Q&A, 'low'=complex legal analysis
    }

    start_time = time.time()
    # Respect Sarvam Starter plan LLM rate limit (40 req/min; using 38 with buffer)
    await llm_limiter.acquire()
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
        response.raise_for_status()

    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("Sarvam LLM returned no choices in response")

    finish_reason = choices[0].get("finish_reason")
    content = choices[0].get("message", {}).get("content")
    if content is None:
        logger.error(
            "Sarvam LLM returned null content. finish_reason=%s full_response=%s",
            finish_reason, data,
        )
        raise RuntimeError("Sarvam LLM returned no content (model exhausted token budget).")

    content_str = content.strip()
    if finish_reason == "length":
        logger.warning("Sarvam LLM response was truncated due to max_tokens limit.")
        content_str += "\n\n[Note: Response truncated due to length limits. Please ask if you need further details.]"

    return content_str


async def get_legal_response(
    english_query: str,
    category: str,
    extracted_document_text: str = "",
    session_language: str = "en-IN",
    conversation_history: list[dict] | None = None,
) -> tuple[str, str]:
    """
    Main entry point for legal AI reasoning.

    Args:
        english_query: User's question already translated to English.
        category: Chat session category hint (classifier may override).
        extracted_document_text: OCR-extracted document text injected as context.
        session_language: BCP-47 code — used for validation logging only;
            actual translation to the user's language happens in _process_and_respond.
        conversation_history: Last N user/assistant turns (English) for context.
            Each item: {"role": "user"|"assistant", "content": str}.

    Returns:
        Tuple of (resolved_category, english_response_text).
    """
    resolved_category = classify_category(english_query, category)
    system_prompt = CATEGORY_SYSTEM_PROMPTS.get(
        resolved_category,
        CATEGORY_SYSTEM_PROMPTS.get("consumer", ""),
    )
    # Select domain-aware reasoning_effort:
    # None = fastest (zero reasoning overhead) for simple factual domains
    # "low" = minimal reasoning for complex multi-step legal analysis
    reasoning_effort = DOMAIN_REASONING_EFFORT.get(resolved_category, "low")
    logger.info(
        "get_legal_response: category=%s reasoning_effort=%s",
        resolved_category, reasoning_effort,
    )

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
        conversation_history=conversation_history,
        reasoning_effort=reasoning_effort,
    )
    return resolved_category, response_text
