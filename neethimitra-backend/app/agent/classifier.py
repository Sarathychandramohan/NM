import re
from typing import Optional


# ── Keyword map ───────────────────────────────────────────────────────────────
# Each entry: list of (keyword, weight) tuples.
# Weight 2.0 = high-signal word that strongly implies the category.
# Weight 1.0 = supporting word.

KEYWORD_MAP: dict[str, list[tuple[str, float]]] = {
    "consumer": [
        ("refund", 1.0), ("defect", 1.0), ("warranty", 2.0), ("product", 1.0),
        ("amazon", 1.0), ("flipkart", 1.0), ("consumer", 2.0), ("bill", 1.0),
        ("purchase", 1.0), ("seller", 1.0), ("ecommerce", 1.0), ("complaint", 1.0),
        ("return", 1.0),
    ],
    "cybercrime": [
        ("otp", 2.0), ("upi", 2.0), ("fraud", 2.0), ("cyber", 2.0), ("scam", 2.0),
        ("phishing", 2.0), ("hack", 2.0), ("account stolen", 2.0), ("online fraud", 2.0),
        ("whatsapp", 1.0), ("lottery", 1.0), ("qr code", 1.0), ("bank transfer", 1.0),
        ("fake job", 2.0),
    ],
    "land": [
        ("land", 2.0), ("property", 1.0), ("patta", 2.0), ("encroachment", 2.0),
        ("survey", 1.0), ("inheritance", 1.0), ("partition", 1.0), ("plot", 1.0),
        ("deed", 1.0), ("tahsildar", 2.0), ("registry", 2.0), ("tenant", 1.0),
        ("boundary", 1.0), ("mutation", 2.0),
    ],
    "labor": [
        ("salary", 2.0), ("wage", 2.0), ("employer", 1.0), ("job", 1.0),
        ("termination", 2.0), ("labour", 2.0), ("payslip", 1.0), ("dismissed", 2.0),
        ("workplace", 1.0), ("overtime", 1.0), ("pf", 2.0), ("epf", 2.0),
        ("contract", 1.0),
    ],
    "women_dv": [
        ("husband", 1.0), ("violence", 2.0), ("abuse", 2.0), ("dowry", 2.0),
        ("maintenance", 2.0), ("harassment", 2.0), ("domestic", 2.0), ("wife", 1.0),
        ("assault", 2.0), ("threat", 1.0), ("fir", 1.0), ("shelter", 1.0),
        ("helpline", 1.0),
    ],
    "senior": [
        ("senior", 2.0), ("elder", 2.0), ("pension", 2.0), ("parents", 1.0),
        ("property fraud", 2.0), ("aged", 1.0), ("neglect", 1.0), ("caretaker", 1.0),
        ("old age", 2.0), ("abandonment", 2.0), ("tribunal", 1.0), ("maintenance", 1.0),
    ],
    "police": [
        ("police", 2.0), ("fir", 2.0), ("arrest", 2.0), ("station", 1.0),
        ("investigation", 1.0), ("rights", 1.0), ("custody", 2.0), ("bail", 2.0),
        ("complaint", 1.0), ("crime", 1.0), ("officer", 1.0), ("charge sheet", 2.0),
        ("witness", 1.0),
    ],
    "health": [
        ("hospital", 2.0), ("negligence", 2.0), ("doctor", 1.0), ("medical", 1.0),
        ("insurance", 2.0), ("bills", 1.0), ("treatment", 1.0), ("patient", 1.0),
        ("discharge", 1.0), ("surgery", 1.0), ("prescription", 1.0), ("ayushman", 2.0),
    ],
    "rti": [
        ("rti", 2.0), ("government", 1.0), ("pm-kisan", 2.0), ("ration", 1.0),
        ("bureaucracy", 1.0), ("scheme", 1.0), ("public authority", 2.0),
        ("information", 1.0), ("pio", 2.0), ("appeal", 1.0), ("cic", 2.0),
    ],
}

# Minimum total weighted score in any category to trust a text-driven override
RECLASSIFY_THRESHOLD = 4.0

# Fallback category when nothing matches
DEFAULT_CATEGORY = "consumer"


def classify_with_confidence(text: str) -> tuple[str, float]:
    """
    Score every category against the user's English query and return the best
    category together with a normalised confidence value in [0.0, 1.0].

    Scoring:
      - Whole-word regex match for each keyword (prevents 'land' matching 'island').
      - Weighted: high-signal keywords contribute 2× to the score.
      - Score is normalised by the max possible score for that category to make
        confidence values comparable across categories with different keyword counts.
    """
    query = (text or "").lower()
    scores: dict[str, float] = {}

    for category, kw_list in KEYWORD_MAP.items():
        raw_score = 0.0
        for keyword, weight in kw_list:
            pattern = r"\b" + re.escape(keyword) + r"\b"
            hits = len(re.findall(pattern, query))
            raw_score += hits * weight

        if raw_score > 0:
            max_possible = sum(w for _, w in kw_list)
            scores[category] = raw_score / max_possible  # normalise to 0-1

    if not scores:
        return DEFAULT_CATEGORY, 0.0

    best = max(scores, key=lambda c: scores[c])
    # Clamp to 1.0 in case a single message hits multiple keywords in the same category
    confidence = min(scores[best], 1.0)
    return best, confidence


def classify_category(text: str, requested_category: Optional[str] = None) -> str:
    """
    Backward-compatible wrapper used by get_legal_response().

    Logic:
    - If no requested_category, always classify from text keywords.
    - If a requested_category is provided, only override it when the text shows
      strong evidence (>= RECLASSIFY_THRESHOLD raw score) for a different category.
      This stops a \"consumer\" session from locking in when the user later describes
      a cybercrime or land issue in the same conversation.
    """
    query = (text or "").lower()

    # Raw (un-normalised) weighted scores for the reclassify threshold check
    raw_scores: dict[str, float] = {}
    for category, kw_list in KEYWORD_MAP.items():
        total = 0.0
        for keyword, weight in kw_list:
            pattern = r"\b" + re.escape(keyword) + r"\b"
            total += len(re.findall(pattern, query)) * weight
        if total > 0:
            raw_scores[category] = total

    if not raw_scores:
        return requested_category or DEFAULT_CATEGORY

    best_category = max(raw_scores, key=lambda c: raw_scores[c])
    best_raw = raw_scores[best_category]

    if not requested_category:
        return best_category if best_raw > 0 else DEFAULT_CATEGORY

    # Keep the requested category unless there is strong counter-evidence
    if best_raw >= RECLASSIFY_THRESHOLD and best_category != requested_category:
        return best_category

    return requested_category
