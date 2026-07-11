from typing import Optional


KEYWORD_MAP = {
    "consumer": ["refund", "defect", "warranty", "product", "amazon", "flipkart", "consumer", "bill", "purchase", "seller"],
    "cybercrime": ["otp", "upi", "fraud", "cyber", "scam", "bank", "phishing", "transaction", "hack", "account stolen"],
    "land": ["land", "property", "patta", "encroachment", "survey", "inheritance", "partition", "plot", "deed", "tahsildar"],
    "labor": ["salary", "wage", "employer", "job", "termination", "labour", "payslip", "dismissed", "workplace", "overtime"],
    "women_dv": ["husband", "violence", "abuse", "dowry", "maintenance", "harassment", "domestic", "wife", "assault", "threat"],
    "senior": ["senior", "elder", "pension", "children", "parents", "property fraud", "aged", "neglect", "caretaker"],
}

# Minimum confidence to trust the initial category vs. re-classifying from text
KEYWORD_MATCH_THRESHOLD = 3


def classify_category(text: str, requested_category: Optional[str] = None) -> str:
    """
    Classify the legal category from the user's English query.

    Logic:
    - If no category is requested, always classify from text keywords.
    - If a category is requested (initial session category), check if the text
      has stronger keyword evidence for a DIFFERENT category. If the evidence is
      strong (>= KEYWORD_MATCH_THRESHOLD matches in another category), reclassify.
      Otherwise, trust the requested category.

    This prevents a "Consumer" session from locking in when the user later
    describes a cybercrime or land issue in the same conversation.
    """
    query = (text or "").lower()

    # Count keyword matches for every category
    scores: dict[str, int] = {}
    for category, keywords in KEYWORD_MAP.items():
        scores[category] = sum(1 for keyword in keywords if keyword in query)

    best_category = max(scores, key=lambda c: scores[c]) if scores else "consumer"
    best_score = scores.get(best_category, 0)

    if not requested_category:
        # No initial category: use best keyword match (or default to consumer)
        return best_category if best_score > 0 else "consumer"

    # There is an initial category: reclassify only if strong evidence for a different category
    if best_score >= KEYWORD_MATCH_THRESHOLD and best_category != requested_category:
        return best_category

    # Keep the initially requested category — the text doesn't strongly contradict it
    return requested_category
