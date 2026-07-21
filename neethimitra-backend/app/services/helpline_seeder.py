"""
Helpline seeder for NeethiMitra AI.
Inserts national emergency and legal helpline numbers into the helplines table
if they don't already exist. Called once on app startup.
"""

from sqlalchemy.orm import Session

from app.models import Helpline

NATIONAL_HELPLINES = [
    # ── Emergency ────────────────────────────────────────────────────────────
    {"category": "police",    "name": "Police Emergency",         "number": "100",         "is_national": True,  "priority": 1, "available_hours": "24/7"},
    {"category": "police",    "name": "National Helpline",        "number": "112",         "is_national": True,  "priority": 1, "available_hours": "24/7"},
    {"category": "police",    "name": "Anti-Corruption Hotline",  "number": "1064",        "is_national": True,  "priority": 3, "available_hours": "24/7"},

    # ── Women & Family ───────────────────────────────────────────────────────
    {"category": "women_dv",  "name": "Women Helpline (National)","number": "1091",        "is_national": True,  "priority": 1, "available_hours": "24/7"},
    {"category": "women_dv",  "name": "Domestic Violence Helpline","number": "181",        "is_national": True,  "priority": 2, "available_hours": "24/7"},
    {"category": "women_dv",  "name": "Child Helpline",           "number": "1098",        "is_national": True,  "priority": 2, "available_hours": "24/7"},
    {"category": "women_dv",  "name": "One Stop Centre",          "number": "181",         "is_national": True,  "priority": 3, "available_hours": "24/7"},

    # ── Senior Citizens ──────────────────────────────────────────────────────
    {"category": "senior",    "name": "Senior Citizen Helpline",  "number": "14567",       "is_national": True,  "priority": 1, "available_hours": "24/7"},
    {"category": "senior",    "name": "Elder Abuse Helpline",     "number": "1090",        "is_national": True,  "priority": 2, "available_hours": "9AM-6PM"},

    # ── Cyber Crime ──────────────────────────────────────────────────────────
    {"category": "cybercrime","name": "Cybercrime Helpline",      "number": "1930",        "is_national": True,  "priority": 1, "available_hours": "24/7"},
    {"category": "cybercrime","name": "Cyber Fraud Reporting",    "number": "1800-11-4000","is_national": True,  "priority": 2, "available_hours": "24/7"},

    # ── Health ───────────────────────────────────────────────────────────────
    {"category": "health",    "name": "Health & Medical Helpline","number": "104",         "is_national": True,  "priority": 1, "available_hours": "24/7"},
    {"category": "health",    "name": "Mental Health Helpline",   "number": "iCall 9152987821", "is_national": True, "priority": 2, "available_hours": "8AM-10PM"},
    {"category": "health",    "name": "Ambulance",                "number": "108",         "is_national": True,  "priority": 1, "available_hours": "24/7"},

    # ── Land & Property ──────────────────────────────────────────────────────
    {"category": "land",      "name": "Land Grievance Helpline",  "number": "1800115565",  "is_national": True,  "priority": 1, "available_hours": "9AM-6PM Mon-Sat"},
    {"category": "land",      "name": "PM Kisan Helpline",        "number": "155261",      "is_national": True,  "priority": 2, "available_hours": "6AM-10PM"},

    # ── RTI & Government ─────────────────────────────────────────────────────
    {"category": "rti",       "name": "RTI Helpline",             "number": "1800110001",  "is_national": True,  "priority": 1, "available_hours": "9AM-6PM Mon-Sat"},
    {"category": "rti",       "name": "Grievance Portal Helpline","number": "1800-11-8111","is_national": True,  "priority": 2, "available_hours": "9AM-6PM Mon-Sat"},
    {"category": "rti",       "name": "PM Helpline",              "number": "1800-11-7800","is_national": True,  "priority": 3, "available_hours": "9AM-6PM Mon-Sat"},

    # ── Labour / Consumer ────────────────────────────────────────────────────
    {"category": "labor",     "name": "Labour Helpline",          "number": "1800-11-3090","is_national": True,  "priority": 1, "available_hours": "9AM-6PM Mon-Sat"},
    {"category": "consumer",  "name": "Consumer Helpline",        "number": "1800-11-4000","is_national": True,  "priority": 1, "available_hours": "9:30AM-5:30PM"},
    {"category": "consumer",  "name": "National Consumer Helpline","number": "1915",       "is_national": True,  "priority": 1, "available_hours": "9AM-5PM Mon-Sat"},

    # ── General ──────────────────────────────────────────────────────────────
    {"category": "general",   "name": "Legal Aid Services",       "number": "15100",       "is_national": True,  "priority": 1, "available_hours": "9AM-6PM"},
    {"category": "general",   "name": "Fire Emergency",           "number": "101",         "is_national": True,  "priority": 1, "available_hours": "24/7"},
    {"category": "general",   "name": "Disaster Management",      "number": "108",         "is_national": True,  "priority": 2, "available_hours": "24/7"},
]


def seed_helplines(db: Session) -> None:
    """Insert national helplines if the table is empty."""
    existing_count = db.query(Helpline).count()
    if existing_count > 0:
        return  # Already seeded — skip

    for item in NATIONAL_HELPLINES:
        db.add(Helpline(
            category=item["category"],
            name=item["name"],
            number=item["number"],
            available_hours=item.get("available_hours"),
            is_national=item.get("is_national", True),
            priority=item.get("priority", 5),
            language_code="en-IN",
            state=None,
            district=None,
        ))
    db.commit()
