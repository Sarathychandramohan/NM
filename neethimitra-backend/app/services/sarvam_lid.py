import logging
import httpx
from app.config import settings, has_sarvam_key

logger = logging.getLogger(__name__)

SARVAM_LID_URL = "https://api.sarvam.ai/text-lid"


async def detect_language(text: str) -> str:
    """
    Detect the language of the given text using Sarvam AI LID.
    Falls back to script-based heuristics when API key is not available.
    Returns a BCP-47 language code like 'ta-IN', 'hi-IN', 'en-IN', etc.
    """
    if not text or not text.strip():
        return "en-IN"

    if not has_sarvam_key():
        return _heuristic_detect(text)

    try:
        headers = {
            "api-subscription-key": settings.SARVAM_API_KEY,
            "Content-Type": "application/json",
        }
        payload = {"input": text[:500]}  # LID only needs a short sample

        async with httpx.AsyncClient() as client:
            response = await client.post(
                SARVAM_LID_URL, headers=headers, json=payload, timeout=10.0
            )

        if response.status_code == 200:
            data = response.json()
            # Sarvam LID returns {"language_code": "ta-IN", ...}
            lang_code = data.get("language_code") or data.get("detected_language")
            if lang_code:
                return lang_code

        logger.warning("Sarvam LID returned %s: %s", response.status_code, response.text)
    except Exception as exc:
        logger.warning("Sarvam LID call failed, using heuristic fallback: %s", exc)

    return _heuristic_detect(text)


def _heuristic_detect(text: str) -> str:
    """Script-based heuristic language detection as a fallback."""
    if any(c in text for c in "அஆஇஈஉஊஎஏஐஒஓகங சஞடணதநபமயரலவழளறன"):
        return "ta-IN"
    if any(c in text for c in "అఆఇఈఉఊఎఏఐఒఓకగచజటడతదపబమయరలవశషసహ"):
        return "te-IN"
    if any(c in text for c in "ಅಆಇಈಉಊಎಏಐಒಓಕಗಚಜಟಡತದಪಬಮಯರಲವಶಷಸಹ"):
        return "kn-IN"
    if any(c in text for c in "അആഇഈഉഊഎഏഐഒഓകഗചജടഡതദപബമയരലവശഷസഹ"):
        return "ml-IN"
    if any(c in text for c in "अआइईउऊएऐओऔकखगघचछजझटठडढतथदधपफबभमयरलवशषसह"):
        return "hi-IN"
    if any(c in text for c in "ਅਆਇਈਉਊਏਐਓਔਕਗਚਜਟਡਤਦਪਬਮਯਰਲਵਸ਼ਸਹ"):
        return "pa-IN"
    if any(c in text for c in "અઆઇઈઉઊએઐઓઔકગચજટડતદપબમ"):
        return "gu-IN"
    if any(c in text for c in "ଅଆଇଈଉଊଏଐଓଔକଗଚଜଟଡତଦପବମ"):
        return "od-IN"
    if any(c in text for c in "অআইঈউঊএঐওঔকগচজটডতদপবম"):
        return "bn-IN"
    return "en-IN"
