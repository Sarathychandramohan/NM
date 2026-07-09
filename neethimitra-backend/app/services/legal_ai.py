from app.agent.classifier import classify_category
from app.agent.prompts import CATEGORY_SYSTEM_PROMPTS
from app.config import has_sarvam_key, settings
import httpx
import logging

logger = logging.getLogger(__name__)

SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"

CATEGORY_LEGAL_INFO = {
    "consumer": {
        "label": "Consumer Rights",
        "helpline": "1915 (National Consumer Helpline)",
        "law": "Consumer Protection Act 2019",
        "steps": [
            "Preserve the invoice, order ID, warranty card, and any chat or email with the seller.",
            "Ask the seller for refund, replacement, or repair in writing and keep screenshots.",
            "Escalate to National Consumer Helpline 1915 or consumerhelpline.gov.in.",
            "If unresolved, prepare a consumer complaint with the amount claimed and supporting proof.",
        ],
    },
    "cybercrime": {
        "label": "Cyber Fraud",
        "helpline": "1930 (National Cyber Crime Helpline)",
        "law": "IT Act 2000, Sections 66C and 66D",
        "steps": [
            "Call 1930 immediately and report the fraudulent transaction without delay.",
            "Preserve screenshots, transaction IDs, bank messages, and account statements.",
            "Raise a complaint on cybercrime.gov.in and notify your bank or wallet provider.",
            "Prepare a police complaint or FIR draft if money loss or impersonation is involved.",
        ],
    },
    "land": {
        "label": "Land & Property",
        "helpline": "Local Tahsildar / Revenue Office",
        "law": "Transfer of Property Act 1882, CPC Section 80, Registration Act 1908",
        "steps": [
            "Collect title deed, patta, chitta, EC, tax receipts, and survey documents.",
            "Identify whether the issue is encroachment, boundary error, inheritance, or illegal transfer.",
            "Approach the revenue authority first if mutation or land records are disputed.",
            "Use a formal complaint or legal notice before moving to civil litigation where appropriate.",
        ],
    },
    "labor": {
        "label": "Labor & Wages",
        "helpline": "Labour Commissioner / State Labour Helpline",
        "law": "Payment of Wages Act 1936, Industrial Disputes Act 1947, Minimum Wages Act 1948",
        "steps": [
            "Compile salary records, attendance, appointment letter, bank credits, and termination messages.",
            "Send a written demand for wages or reinstatement if your employer has not resolved the issue.",
            "File a complaint with the Labour Officer or Labour Commissioner.",
            "Escalate to the labour court or authority that applies in your state if needed.",
        ],
    },
    "women_dv": {
        "label": "Women & Domestic Violence",
        "helpline": "181 (Women Helpline)",
        "law": "Protection of Women from Domestic Violence Act 2005, Section 498A IPC",
        "steps": [
            "Call 181 or emergency police support first if you are in immediate danger.",
            "Preserve photos, medical records, witness details, threatening messages, and financial records.",
            "Seek a Protection Officer, One Stop Centre, or local police station for immediate support.",
            "Prepare a complaint seeking protection, residence, maintenance, or criminal action as needed.",
        ],
    },
    "senior": {
        "label": "Senior Citizen Protection",
        "helpline": "14567 (Senior Citizen Helpline)",
        "law": "Maintenance and Welfare of Parents and Senior Citizens Act 2007",
        "steps": [
            "Call 14567 if the matter involves neglect, abuse, or urgent support.",
            "Gather age proof, property papers, medical records, and relationship proof.",
            "Prepare a petition for maintenance tribunal or a complaint about coercion or property fraud.",
            "Take parallel revenue or police action if documents or threats are involved.",
        ],
    },
}


def _build_mock_response(category_key: str, english_query: str, extracted_document_text: str) -> str:
    info = CATEGORY_LEGAL_INFO.get(category_key, CATEGORY_LEGAL_INFO["consumer"])
    steps = "\n".join(f"{index}. {step}" for index, step in enumerate(info["steps"], start=1))
    document_note = ""
    if extracted_document_text.strip():
        preview = extracted_document_text.strip().replace("\n", " ")[:240]
        document_note = f"\n\nDocument context considered: {preview}"

    return (
        f"Helpline: {info['helpline']}\n\n"
        f"Based on what you described, this appears to be a {info['label']} issue. "
        f"The key legal framework is {info['law']}.\n\n"
        f"Recommended next steps:\n{steps}\n\n"
        f"I can also help you generate a formal complaint draft for this issue."
        f"{document_note}"
    )


async def _call_sarvam_llm(system_prompt: str, user_message: str, document_context: str) -> str:
    """
    Calls Sarvam AI's chat completions endpoint (Sarvam-m model).
    Returns the assistant's text response.
    """
    messages = [{"role": "system", "content": system_prompt}]

    if document_context.strip():
        messages.append({
            "role": "user",
            "content": f"Here is relevant document context the user has uploaded:\n\n{document_context[:3000]}"
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
        "model": "sarvam-m",
        "messages": messages,
        "max_tokens": 1024,
        "temperature": 0.3,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_CHAT_URL,
            headers=headers,
            json=payload,
            timeout=45.0,
        )

    if response.status_code != 200:
        logger.error("Sarvam LLM error %s: %s", response.status_code, response.text)
        raise RuntimeError(f"Sarvam LLM returned {response.status_code}: {response.text}")

    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("Sarvam LLM returned no choices in response")

    return choices[0].get("message", {}).get("content", "").strip()


async def get_legal_response(
    english_query: str,
    category: str,
    extracted_document_text: str = ""
) -> tuple[str, str]:
    resolved_category = classify_category(english_query, category)
    system_prompt = CATEGORY_SYSTEM_PROMPTS.get(resolved_category, CATEGORY_SYSTEM_PROMPTS["consumer"])

    if not has_sarvam_key():
        # No API key — return mock structured response for development/testing
        return resolved_category, _build_mock_response(resolved_category, english_query, extracted_document_text)

    try:
        response_text = await _call_sarvam_llm(
            system_prompt=system_prompt,
            user_message=english_query,
            document_context=extracted_document_text,
        )
        return resolved_category, response_text
    except Exception as exc:
        # If the live LLM call fails for any reason, gracefully fall back to the
        # structured mock response so the user always gets a useful answer.
        logger.warning("Sarvam LLM call failed, using mock fallback: %s", exc)
        return resolved_category, _build_mock_response(resolved_category, english_query, extracted_document_text)
