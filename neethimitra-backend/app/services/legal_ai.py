from app.agent.classifier import classify_category
from app.agent.prompts import CATEGORY_SYSTEM_PROMPTS
from app.config import settings
import httpx
import logging
import re
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
    "general":  None,   # General legal queries — keep fast
    # Complex / multi-step reasoning domains — minimal reasoning for accuracy
    "land":     "low",  # Property law requires cross-referencing multiple acts
    "police":   "low",  # FIR process + criminal procedure requires precise steps
    "cybercrime": "low", # Evidence preservation + cybercrime law is nuanced
    "health":   "low",  # Medical negligence requires structured legal analysis
    "women_dv": "low",  # DV Act + family law has multi-step remedies
    "complaint": "low", # Complaint drafting requires structured legal writing
}

# Domain-specific token limits — reasoning domains receive expanded token budgets
DOMAIN_MAX_TOKENS: dict[str, int] = {
    "land":       700,
    "police":     650,
    "cybercrime": 650,
    "women_dv":   700,
    "complaint":  800,
    "rti":        450,
    "health":     450,
    "consumer":   500,
    "senior":     450,
    "labor":      500,
    "general":    500,
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
    max_tokens: int = 1500,
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
        "max_tokens": max_tokens,
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
    max_tokens = DOMAIN_MAX_TOKENS.get(resolved_category, 500)
    logger.info(
        "get_legal_response: category=%s reasoning_effort=%s max_tokens=%d",
        resolved_category, reasoning_effort, max_tokens,
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
        max_tokens=max_tokens,
    )
    return resolved_category, response_text


def extract_legal_insights(english_response: str) -> dict:
    """
    Lightweight post-processor: extract structured legal insights from an English LLM response.

    Runs AFTER the LLM call, on the raw English text before it is translated.
    Returns a dict matching the LegalInsights Pydantic schema (schemas.py).

    Design principles:
    - Never fabricates data: returns None for a field if no match found.
    - Fast: pure regex, no API calls, runs in < 1ms.
    - Conservative: only extracts high-confidence patterns (e.g. "Section X of Y Act").
      Better to return fewer accurate results than many noisy ones.
    """
    # ── Next Steps ────────────────────────────────────────────────────────────
    # Extracts numbered list items that typically follow "Steps:", "You should:",
    # "What to do:", "Procedure:", or a plain numbered list anywhere in the response.
    next_steps: list[str] | None = None
    step_patterns = [
        # Numbered list: "1. File an FIR" / "1) Visit the court"
        r'^\s*(?:\d+[.)\-]|[a-zA-Z][.)\-])\s+(.{10,120})$',
        # "Step N:" label
        r'(?:Step\s+\d+|STEP\s+\d+)\s*[:\-]\s*(.{10,120})',
        # Bullet list inside a "Next Steps" / "What to do" section
        r'(?:next steps?|what (?:you can|to) do|recommended action|procedure)[:\s]*\n(?:[\s\S]*?)((?:[-•*]\s+.+\n?)+)',
    ]
    step_items: list[str] = []
    # Primary: numbered list items
    for line in english_response.splitlines():
        m = re.match(r'^\s*(?:\d+[.)\-])\s+(.{10,150})$', line.strip())
        if m:
            step_text = m.group(1).strip().rstrip('.')
            if step_text and step_text not in step_items:
                step_items.append(step_text)
    if step_items:
        # Cap at 6 steps — avoid returning an entire numbered essay
        next_steps = step_items[:6]

    # ── Relevant Laws ────────────────────────────────────────────────────────
    # Matches common Indian legal citation patterns:
    # - "Section 498A of IPC"
    # - "Article 21 of the Constitution"
    # - "Section 12 of the Consumer Protection Act 2019"
    # - "IPC Section 302" / "CrPC Section 154" (inverted order)
    # - Short law name references: "IT Act", "RTI Act", "Protection of Women Act"
    relevant_laws: list[str] | None = None
    law_patterns = [
        # "Section X of [the] Y [Act/Code/Law]"
        r'(?:Section|Sec\.|Article|Rule|Clause)\s+[\w()A-Z/-]+\s+of\s+(?:the\s+)?[A-Z][A-Za-z\s&,()]{2,50}(?:Act|Code|Law|Rules?|Amendment|Ordinance)(?:\s+\d{4})?',
        # Inverted: "IPC Section X" / "CrPC Section X"
        r'(?:IPC|CrPC|CPC|CRPC|IT Act|RTI Act|POCSO|NDPS)\s+(?:Section|Sec\.)\s+[\w()A-Z/-]+',
        # Short references: "the Consumer Protection Act" / "Domestic Violence Act 2005"
        r'(?:the\s+)?[A-Z][A-Za-z\s&,()]{2,50}(?:Act|Code|Law|Rules?|Amendment)(?:\s+\d{4})?',
    ]
    found_laws: list[str] = []
    for pattern in law_patterns:
        for m in re.finditer(pattern, english_response):
            law = m.group(0).strip()
            # Filter noise: must be at least 6 chars and not already found
            if len(law) >= 6 and law not in found_laws:
                found_laws.append(law)
    if found_laws:
        # Deduplicate by checking if shorter match is substring of a longer one
        deduped: list[str] = []
        for law in found_laws:
            if not any(law in longer for longer in found_laws if longer != law and len(longer) > len(law)):
                deduped.append(law)
        relevant_laws = deduped[:8]  # cap at 8 law references

    # ── Legal Basis ──────────────────────────────────────────────────────────
    # Extracts the first sentence that starts a legal reasoning statement.
    legal_basis: str | None = None
    basis_patterns = [
        r'(?:Under|As per|According to|Pursuant to|In accordance with)\s+[A-Z].{20,200}?(?:[.!?])',
        r'(?:The law|Indian law|The right|Your right|The court)\s+(?:states?|provides?|holds?|affirms?).{20,200}?(?:[.!?])',
    ]
    for pattern in basis_patterns:
        m = re.search(pattern, english_response, re.IGNORECASE)
        if m:
            legal_basis = m.group(0).strip()
            break

    return {
        "next_steps": next_steps,
        "relevant_laws": relevant_laws,
        "legal_basis": legal_basis,
    }
