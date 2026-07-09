from typing import Optional


KEYWORD_MAP = {
    "consumer": ["refund", "defect", "warranty", "product", "amazon", "flipkart", "consumer", "bill"],
    "cybercrime": ["otp", "upi", "fraud", "cyber", "scam", "bank", "phishing", "transaction"],
    "land": ["land", "property", "patta", "encroachment", "survey", "inheritance", "partition"],
    "labor": ["salary", "wage", "employer", "job", "termination", "labour", "payslip"],
    "women_dv": ["husband", "violence", "abuse", "dowry", "maintenance", "harassment", "domestic"],
    "senior": ["senior", "elder", "pension", "children", "parents", "property fraud", "aged"],
}


def classify_category(text: str, requested_category: Optional[str] = None) -> str:
    if requested_category:
        return requested_category

    query = (text or "").lower()
    for category, keywords in KEYWORD_MAP.items():
        if any(keyword in query for keyword in keywords):
            return category
    return "consumer"
