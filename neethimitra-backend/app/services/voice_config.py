"""
Voice Configuration — Bulbul v3 Speaker Database
================================================
Maps all confirmed Sarvam Bulbul v3 speakers to language preferences,
gender, use-case suitability, and Indian state-to-language defaults.

CRITICAL DESIGN FACT:
  Bulbul v3 does NOT have per-language voice IDs.
  The same named speaker (e.g. "ishita") works across ALL 11 Indian languages.
  Speaker IDs like "bulbul-v3-bengali-female" do NOT exist in Sarvam's API.

The voice_id field = the exact speaker name string passed to Bulbul v3's
"speaker" parameter in the /text-to-speech request body.

Confirmed speaker list (from production API validation, 2026-07-21):
  Female: anushka, manisha, vidya, arya, ritu, priya, neha, pooja, simran,
          kavya, ishita, shreya, roopa, suhani, kavitha, rupali, tanya, shruti, mani
  Male:   abhilash, karun, hitesh, aditya, rahul, rohan, amit, dev, ratan,
          varun, manan, sumit, kabir, aayan, shubh, ashutosh, advait, anand,
          tarun, sunny, gokul, vijay, mohit, rehan, soham
  (Note: "meera" was removed from Sarvam's list after 2026-07-13)
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict


# ── Voice data model ───────────────────────────────────────────────────────────

@dataclass
class VoiceProfile:
    """
    A single Bulbul v3 speaker profile.

    voice_id: exact speaker name for the Bulbul API "speaker" parameter.
    preferred_languages: BCP-47 codes where this speaker sounds most natural.
                         All speakers technically support all 11 languages,
                         but some are tuned for specific scripts/accents.
    use_cases: legal domains where this voice works best.
    quality_score: 0.0–1.0 subjective clarity rating for legal content.
    latency_class: "fast" (≤150ms), "standard" (≤200ms), "rich" (>200ms).
    """
    voice_id: str                       # Exact Bulbul API speaker name
    display_name: str                   # Human-readable name
    gender: str                         # "female" | "male"
    preferred_languages: List[str]      # BCP-47 codes where this speaker excels
    description: str
    use_cases: List[str]
    quality_score: float
    latency_class: str                  # "fast" | "standard" | "rich"
    supports_code_mixing: bool = True   # All Bulbul v3 speakers support code mixing


# ── Confirmed Bulbul v3 speaker database ───────────────────────────────────────

ALL_VOICES: List[VoiceProfile] = [
    # ── Female speakers ────────────────────────────────────────────────────────
    VoiceProfile(
        voice_id="ishita",
        display_name="Ishita",
        gender="female",
        preferred_languages=["en-IN", "hi-IN", "mr-IN", "gu-IN"],
        description="Clear, professional female voice. Sarvam's recommended default for legal content.",
        use_cases=["legal_advice", "rti", "consumer", "general"],
        quality_score=0.96,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="kavya",
        display_name="Kavya",
        gender="female",
        preferred_languages=["ta-IN", "kn-IN", "te-IN", "ml-IN"],
        description="Warm South Indian female voice. Excellent articulation of Dravidian scripts.",
        use_cases=["legal_advice", "women_dv", "consumer", "general"],
        quality_score=0.94,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="anushka",
        display_name="Anushka",
        gender="female",
        preferred_languages=["hi-IN", "bn-IN", "mr-IN", "pa-IN"],
        description="Soft, empathetic female voice. Ideal for sensitive legal topics.",
        use_cases=["women_dv", "senior", "legal_advice"],
        quality_score=0.92,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="kavitha",
        display_name="Kavitha",
        gender="female",
        preferred_languages=["kn-IN", "ta-IN", "te-IN", "ml-IN"],
        description="Strong South Indian female voice with excellent Kannada/Tamil clarity.",
        use_cases=["legal_advice", "land", "consumer"],
        quality_score=0.91,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="priya",
        display_name="Priya",
        gender="female",
        preferred_languages=["hi-IN", "en-IN", "mr-IN"],
        description="Friendly, approachable voice. Great for first-time legal consultations.",
        use_cases=["general", "consumer", "senior", "legal_advice"],
        quality_score=0.90,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="shreya",
        display_name="Shreya",
        gender="female",
        preferred_languages=["bn-IN", "hi-IN", "od-IN"],
        description="Melodic East Indian female voice. Excellent Bengali and Odia pronunciation.",
        use_cases=["legal_advice", "land", "labor"],
        quality_score=0.90,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="roopa",
        display_name="Roopa",
        gender="female",
        preferred_languages=["kn-IN", "te-IN", "ta-IN"],
        description="Authoritative South Indian female voice for formal legal proceedings.",
        use_cases=["legal_advice", "police", "complaint"],
        quality_score=0.89,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="manisha",
        display_name="Manisha",
        gender="female",
        preferred_languages=["hi-IN", "mr-IN", "gu-IN", "pa-IN"],
        description="Clear North/West Indian female voice for procedural guidance.",
        use_cases=["rti", "consumer", "labor", "general"],
        quality_score=0.89,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="vidya",
        display_name="Vidya",
        gender="female",
        preferred_languages=["ml-IN", "ta-IN", "kn-IN"],
        description="Calm Kerala-accent female voice. Excellent for detailed legal explanations.",
        use_cases=["legal_advice", "senior", "health"],
        quality_score=0.88,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="neha",
        display_name="Neha",
        gender="female",
        preferred_languages=["hi-IN", "en-IN", "pa-IN"],
        description="Youthful, energetic voice. Good for cybercrime and RTI topics.",
        use_cases=["cybercrime", "rti", "consumer"],
        quality_score=0.88,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="simran",
        display_name="Simran",
        gender="female",
        preferred_languages=["pa-IN", "hi-IN"],
        description="Warm Punjabi female voice. Best in class for Punjabi legal content.",
        use_cases=["legal_advice", "land", "labor"],
        quality_score=0.87,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="suhani",
        display_name="Suhani",
        gender="female",
        preferred_languages=["hi-IN", "gu-IN", "mr-IN"],
        description="Gentle voice suited for senior citizen and health-related legal queries.",
        use_cases=["senior", "health", "consumer"],
        quality_score=0.87,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="arya",
        display_name="Arya",
        gender="female",
        preferred_languages=["ml-IN", "ta-IN", "en-IN"],
        description="Crisp Kerala female voice with excellent English-Malayalam code mixing.",
        use_cases=["legal_advice", "cybercrime", "general"],
        quality_score=0.87,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="rupali",
        display_name="Rupali",
        gender="female",
        preferred_languages=["mr-IN", "hi-IN", "gu-IN"],
        description="Rich Marathi female voice ideal for Maharashtra-region legal content.",
        use_cases=["legal_advice", "land", "labor"],
        quality_score=0.86,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="ritu",
        display_name="Ritu",
        gender="female",
        preferred_languages=["hi-IN", "pa-IN", "en-IN"],
        description="Confident North Indian female voice for police and FIR guidance.",
        use_cases=["police", "women_dv", "legal_advice"],
        quality_score=0.86,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="pooja",
        display_name="Pooja",
        gender="female",
        preferred_languages=["hi-IN", "gu-IN", "mr-IN"],
        description="Warm Hindi/Gujarati female voice for consumer dispute guidance.",
        use_cases=["consumer", "legal_advice", "general"],
        quality_score=0.85,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="tanya",
        display_name="Tanya",
        gender="female",
        preferred_languages=["en-IN", "hi-IN"],
        description="Polished English-forward voice for code-mixed legal content.",
        use_cases=["cybercrime", "rti", "general"],
        quality_score=0.85,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="shruti",
        display_name="Shruti",
        gender="female",
        preferred_languages=["hi-IN", "mr-IN", "bn-IN"],
        description="Gentle female voice for women's rights and domestic violence topics.",
        use_cases=["women_dv", "senior", "health"],
        quality_score=0.84,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="mani",
        display_name="Mani",
        gender="female",
        preferred_languages=["ta-IN", "ml-IN", "kn-IN"],
        description="Energetic South Indian female voice for RTI and consumer topics.",
        use_cases=["rti", "consumer", "general"],
        quality_score=0.84,
        latency_class="fast",
    ),

    # ── Male speakers ──────────────────────────────────────────────────────────
    VoiceProfile(
        voice_id="karun",
        display_name="Karun",
        gender="male",
        preferred_languages=["ta-IN", "kn-IN", "te-IN", "ml-IN"],
        description="Authoritative South Indian male voice. Ideal for court and police matters.",
        use_cases=["police", "complaint", "legal_advice", "land"],
        quality_score=0.95,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="abhilash",
        display_name="Abhilash",
        gender="male",
        preferred_languages=["ml-IN", "kn-IN", "ta-IN"],
        description="Deep Kerala male voice. Excellent articulation for complex legal language.",
        use_cases=["legal_advice", "land", "complaint"],
        quality_score=0.93,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="aditya",
        display_name="Aditya",
        gender="male",
        preferred_languages=["hi-IN", "en-IN", "mr-IN"],
        description="Clear North Indian male voice for RTI and government procedures.",
        use_cases=["rti", "consumer", "police", "general"],
        quality_score=0.92,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="rahul",
        display_name="Rahul",
        gender="male",
        preferred_languages=["hi-IN", "bn-IN", "pa-IN"],
        description="Confident all-rounder male voice for diverse legal topics.",
        use_cases=["legal_advice", "cybercrime", "labor"],
        quality_score=0.91,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="hitesh",
        display_name="Hitesh",
        gender="male",
        preferred_languages=["gu-IN", "hi-IN", "mr-IN"],
        description="Reliable Gujarat-accent male voice for commercial and property disputes.",
        use_cases=["land", "consumer", "labor"],
        quality_score=0.90,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="rohan",
        display_name="Rohan",
        gender="male",
        preferred_languages=["hi-IN", "en-IN", "mr-IN"],
        description="Youthful, articulate male voice for cybercrime and tech-related legal topics.",
        use_cases=["cybercrime", "rti", "general"],
        quality_score=0.90,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="amit",
        display_name="Amit",
        gender="male",
        preferred_languages=["hi-IN", "pa-IN", "bn-IN"],
        description="Steady North Indian male voice for labour and tenant rights.",
        use_cases=["labor", "land", "police"],
        quality_score=0.89,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="varun",
        display_name="Varun",
        gender="male",
        preferred_languages=["hi-IN", "en-IN", "mr-IN"],
        description="Professional male voice for formal complaint drafting.",
        use_cases=["complaint", "police", "consumer"],
        quality_score=0.89,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="dev",
        display_name="Dev",
        gender="male",
        preferred_languages=["hi-IN", "gu-IN", "pa-IN"],
        description="Deep, trustworthy male voice for senior citizen rights guidance.",
        use_cases=["senior", "health", "legal_advice"],
        quality_score=0.88,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="ratan",
        display_name="Ratan",
        gender="male",
        preferred_languages=["bn-IN", "od-IN", "hi-IN"],
        description="Calm East Indian male voice. Best for Bengali and Odia speakers.",
        use_cases=["legal_advice", "land", "labor"],
        quality_score=0.88,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="manan",
        display_name="Manan",
        gender="male",
        preferred_languages=["gu-IN", "mr-IN", "hi-IN"],
        description="Warm Western India male voice for women's rights and DV topics.",
        use_cases=["women_dv", "consumer", "general"],
        quality_score=0.87,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="kabir",
        display_name="Kabir",
        gender="male",
        preferred_languages=["hi-IN", "pa-IN", "en-IN"],
        description="Resonant Punjabi-inflected voice for property and police matters.",
        use_cases=["land", "police", "complaint"],
        quality_score=0.87,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="sumit",
        display_name="Sumit",
        gender="male",
        preferred_languages=["hi-IN", "bn-IN", "od-IN"],
        description="Steady, measured voice for RTI and government procedure guidance.",
        use_cases=["rti", "consumer", "labor"],
        quality_score=0.86,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="aayan",
        display_name="Aayan",
        gender="male",
        preferred_languages=["en-IN", "hi-IN"],
        description="Modern English-forward voice for cybercrime and tech law topics.",
        use_cases=["cybercrime", "general", "rti"],
        quality_score=0.86,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="advait",
        display_name="Advait",
        gender="male",
        preferred_languages=["mr-IN", "hi-IN", "kn-IN"],
        description="Articulate male voice for complaint drafting and formal documents.",
        use_cases=["complaint", "rti", "legal_advice"],
        quality_score=0.85,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="gokul",
        display_name="Gokul",
        gender="male",
        preferred_languages=["ta-IN", "ml-IN", "kn-IN", "te-IN"],
        description="Energetic South Indian male voice for consumer and RTI topics.",
        use_cases=["consumer", "rti", "general"],
        quality_score=0.85,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="vijay",
        display_name="Vijay",
        gender="male",
        preferred_languages=["ta-IN", "te-IN", "kn-IN"],
        description="Strong Tamil/Telugu male voice ideal for land and police matters.",
        use_cases=["land", "police", "legal_advice"],
        quality_score=0.84,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="mohit",
        display_name="Mohit",
        gender="male",
        preferred_languages=["hi-IN", "mr-IN", "pa-IN"],
        description="Calm Hindi male voice for senior citizen and health guidance.",
        use_cases=["senior", "health", "consumer"],
        quality_score=0.84,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="soham",
        display_name="Soham",
        gender="male",
        preferred_languages=["bn-IN", "hi-IN", "od-IN"],
        description="Gentle Bengali male voice for labor rights and tenant disputes.",
        use_cases=["labor", "land", "general"],
        quality_score=0.83,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="rehan",
        display_name="Rehan",
        gender="male",
        preferred_languages=["en-IN", "hi-IN", "pa-IN"],
        description="Modern, code-mixed-friendly male voice.",
        use_cases=["cybercrime", "general", "rti"],
        quality_score=0.83,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="shubh",
        display_name="Shubh",
        gender="male",
        preferred_languages=["hi-IN", "gu-IN", "mr-IN"],
        description="Warm, reassuring male voice for DV and women's rights topics.",
        use_cases=["women_dv", "senior", "legal_advice"],
        quality_score=0.82,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="ashutosh",
        display_name="Ashutosh",
        gender="male",
        preferred_languages=["hi-IN", "mr-IN"],
        description="Formal male voice for court and formal complaint contexts.",
        use_cases=["complaint", "police", "rti"],
        quality_score=0.82,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="anand",
        display_name="Anand",
        gender="male",
        preferred_languages=["ta-IN", "kn-IN", "ml-IN", "te-IN"],
        description="Balanced South Indian male voice for legal advice.",
        use_cases=["legal_advice", "consumer", "general"],
        quality_score=0.82,
        latency_class="standard",
    ),
    VoiceProfile(
        voice_id="tarun",
        display_name="Tarun",
        gender="male",
        preferred_languages=["hi-IN", "pa-IN", "bn-IN"],
        description="Clear Hindi male voice for RTI and labor rights.",
        use_cases=["rti", "labor", "general"],
        quality_score=0.81,
        latency_class="fast",
    ),
    VoiceProfile(
        voice_id="sunny",
        display_name="Sunny",
        gender="male",
        preferred_languages=["pa-IN", "hi-IN", "en-IN"],
        description="Energetic Punjabi male voice for all-purpose legal guidance.",
        use_cases=["general", "consumer", "rti"],
        quality_score=0.81,
        latency_class="fast",
    ),
]


# ── Language → recommended speakers (curated picks) ────────────────────────────
# These are the 2 best speakers per language per gender, chosen for their
# preferred_languages alignment. All other speakers still work — these are defaults.

LANGUAGE_DEFAULTS: Dict[str, Dict[str, str]] = {
    "hi-IN": {"female": "ishita",  "male": "aditya"},
    "bn-IN": {"female": "shreya",  "male": "ratan"},
    "ta-IN": {"female": "kavya",   "male": "karun"},
    "te-IN": {"female": "kavya",   "male": "vijay"},
    "gu-IN": {"female": "manisha", "male": "hitesh"},
    "en-IN": {"female": "ishita",  "male": "aayan"},
    "kn-IN": {"female": "kavitha", "male": "gokul"},
    "ml-IN": {"female": "vidya",   "male": "abhilash"},
    "mr-IN": {"female": "rupali",  "male": "advait"},
    "pa-IN": {"female": "simran",  "male": "kabir"},
    "od-IN": {"female": "shreya",  "male": "soham"},
}

# ── Indian state → primary language code ───────────────────────────────────────
STATE_LANGUAGE_MAP: Dict[str, str] = {
    # Hindi belt
    "uttar pradesh": "hi-IN", "up": "hi-IN",
    "bihar": "hi-IN", "bh": "hi-IN",
    "madhya pradesh": "hi-IN", "mp": "hi-IN",
    "rajasthan": "hi-IN", "rj": "hi-IN",
    "haryana": "hi-IN", "hr": "hi-IN",
    "himachal pradesh": "hi-IN", "hp": "hi-IN",
    "uttarakhand": "hi-IN", "uk": "hi-IN",
    "jharkhand": "hi-IN", "jh": "hi-IN",
    "chhattisgarh": "hi-IN", "cg": "hi-IN",
    "delhi": "hi-IN", "new delhi": "hi-IN",
    # Regional languages
    "west bengal": "bn-IN", "wb": "bn-IN",
    "tamil nadu": "ta-IN", "tn": "ta-IN",
    "andhra pradesh": "te-IN", "ap": "te-IN",
    "telangana": "te-IN", "tg": "te-IN",
    "gujarat": "gu-IN", "gj": "gu-IN",
    "karnataka": "kn-IN", "ka": "kn-IN",
    "kerala": "ml-IN", "kl": "ml-IN",
    "maharashtra": "mr-IN", "mh": "mr-IN",
    "punjab": "pa-IN", "pb": "pa-IN",
    "odisha": "od-IN", "or": "od-IN",
    # Default → English for NE states and UTs
    "goa": "en-IN",
    "assam": "en-IN", "as": "en-IN",
    "arunachal pradesh": "en-IN",
    "manipur": "en-IN",
    "meghalaya": "en-IN",
    "mizoram": "en-IN",
    "nagaland": "en-IN",
    "sikkim": "en-IN",
    "tripura": "en-IN",
}

# Quick lookup dict for O(1) access
_VOICE_BY_ID: Dict[str, VoiceProfile] = {v.voice_id: v for v in ALL_VOICES}


def get_voice_by_id(voice_id: str) -> Optional[VoiceProfile]:
    """Return a VoiceProfile by its exact Bulbul speaker name, or None."""
    return _VOICE_BY_ID.get(voice_id)


def get_voices_for_language(
    language_code: str,
    gender: Optional[str] = None,
    use_case: Optional[str] = None,
) -> List[VoiceProfile]:
    """
    Return all voices whose preferred_languages includes language_code.
    Optionally filter by gender ("female"/"male") and use_case.
    Results are sorted by quality_score descending.
    """
    results = [
        v for v in ALL_VOICES
        if language_code in v.preferred_languages
    ]
    if gender:
        results = [v for v in results if v.gender == gender]
    if use_case:
        results = [v for v in results if use_case in v.use_cases]
    return sorted(results, key=lambda v: -v.quality_score)


def get_default_voice(language_code: str, gender: str = "female") -> str:
    """
    Return the recommended default speaker name for a language+gender pair.
    Falls back to 'ishita' (female) or 'aditya' (male) if language unknown.
    """
    lang_defaults = LANGUAGE_DEFAULTS.get(language_code, {})
    return lang_defaults.get(gender, "ishita" if gender == "female" else "aditya")


def detect_language_from_state(state: str) -> Optional[str]:
    """Return the primary language BCP-47 code for an Indian state name."""
    return STATE_LANGUAGE_MAP.get(state.lower().strip())
