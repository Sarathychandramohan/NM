from app.agent.classifier import classify_category
from app.agent.prompts import CATEGORY_SYSTEM_PROMPTS
from app.config import settings
import httpx
import logging

logger = logging.getLogger(__name__)

SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"




async def _call_sarvam_llm(system_prompt: str, user_message: str, document_context: str) -> str:
    """
    Calls Sarvam AI's chat completions endpoint (Sarvam-m model).
    Returns the assistant's text response.
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

    if not settings.SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not configured.")

    response_text = await _call_sarvam_llm(
        system_prompt=system_prompt,
        user_message=english_query,
        document_context=extracted_document_text,
    )
    return resolved_category, response_text
