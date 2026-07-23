"""
Document Classification, Entity Extraction & LLM Legal Analysis Service
========================================================================
Enhances raw OCR output (from Sarvam Vision) with:
  1. DocumentType classification (11 Indian legal categories via regex + keyword rules)
  2. Legal Entity Extraction (Case numbers, court names, rupee amounts, sections, dates, names)
  3. Structured Legal Analysis via Sarvam-30B LLM (key issues, sections, next steps, deadlines)
  4. Document confidence scoring
"""

import logging
import re
import json
from enum import Enum
from dataclasses import dataclass, asdict
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.services.legal_ai import _call_sarvam_llm

logger = logging.getLogger(__name__)


# ── Document Type Classification Enum ──────────────────────────────────────────

class DocumentType(str, Enum):
    LEGAL_AID_FORM = "legal_aid_form"
    COURT_NOTICE = "court_notice"
    PROPERTY_DOCUMENT = "property_document"
    FAMILY_LAW = "family_law"
    CRIMINAL_CASE = "criminal_case"
    CIVIL_DISPUTE = "civil_dispute"
    COMMERCIAL = "commercial"
    LABOR_DISPUTE = "labor_dispute"
    CYBER_CRIME = "cyber_crime"
    DOMESTIC_VIOLENCE = "domestic_violence"
    IMMIGRATION = "immigration"
    GENERAL_LEGAL = "general_legal"


# Document type classification regex patterns
DOCUMENT_PATTERNS: Dict[DocumentType, List[str]] = {
    DocumentType.LEGAL_AID_FORM: [
        r"legal aid.*form", r"application.*legal assistance",
        r"free legal aid", r"section.*12.*legal aid", r"nalsa", r"salsa",
        r"income certificate", r"caste certificate", r"poverty line"
    ],
    DocumentType.COURT_NOTICE: [
        r"court notice", r"summons", r"warrant", r"notice.*section",
        r"court.*case.*number", r"judicial.*magistrate",
        r"order.*date", r"returnable.*date", r"appear before", r"subpoena"
    ],
    DocumentType.PROPERTY_DOCUMENT: [
        r"sale deed", r"title deed", r"property.*document",
        r"registration.*office", r"land.*records", r"patta", r"chitta", r"khata",
        r"encumbrance certificate", r"mutation.*record", r"khasra", r"adangal"
    ],
    DocumentType.FAMILY_LAW: [
        r"divorce petition", r"child custody", r"maintenance",
        r"section.*125", r"child.*welfare", r"guardianship", r"succession",
        r"adoption", r"restitution of conjugal", r"hindu marriage act"
    ],
    DocumentType.CRIMINAL_CASE: [
        r"\bfir\b", r"first information report", r"police report",
        r"criminal case", r"section.*302", r"section.*307", r"section.*376",
        r"bailable", r"non.*bailable", r"cognizable", r"charge sheet", r"bail application"
    ],
    DocumentType.CIVIL_DISPUTE: [
        r"civil suit", r"decree", r"injunction", r"specific performance",
        r"recovery.*suit", r"partition suit", r"money.*suit", r"plaint", r"written statement"
    ],
    DocumentType.COMMERCIAL: [
        r"contract", r"agreement", r"partnership", r"company",
        r"business dispute", r"commercial arbitration", r"msme", r"promissory note", r"invoice"
    ],
    DocumentType.LABOR_DISPUTE: [
        r"labor court", r"labour court", r"industrial dispute", r"workmen",
        r"wages", r"termination", r"service rules", r"strike", r"gratuity", r"pf.*claim"
    ],
    DocumentType.CYBER_CRIME: [
        r"cyber crime", r"it act", r"section.*66", r"data breach",
        r"online fraud", r"digital evidence", r"netbanking", r"phishing", r"unauthorised transaction"
    ],
    DocumentType.DOMESTIC_VIOLENCE: [
        r"domestic violence", r"protection order", r"section.*498a",
        r"cruelty", r"harassment", r"residence order", r"monetary relief", r"dv act"
    ],
    DocumentType.IMMIGRATION: [
        r"visa", r"immigration", r"passport", r"citizenship",
        r"foreigners act", r"deportation", r"work permit", r"frro"
    ]
}


def classify_document_type(filename: str, ocr_text: str = "") -> DocumentType:
    """
    Classify document type using filename and OCR text content.
    Returns the matching DocumentType enum value.
    """
    combined_text = f"{filename} {ocr_text}".lower()

    for doc_type, patterns in DOCUMENT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, combined_text, re.IGNORECASE):
                logger.info("classify_document_type: matched %s via pattern '%s'", doc_type.value, pattern)
                return doc_type

    return DocumentType.GENERAL_LEGAL


# ── Entity Extraction Engine ───────────────────────────────────────────────────

def extract_document_entities(ocr_text: str) -> Dict[str, List[str]]:
    """
    Extract Indian legal entities from OCR text:
      - Case numbers
      - Court names
      - Rupee amounts (₹ / Rs.)
      - Legal sections (IPC, CrPC, BNSS, IT Act, etc.)
      - Dates
      - Party names
      - Addresses
    """
    if not ocr_text:
        return {
            "case_numbers": [], "court_names": [], "amounts": [],
            "section_numbers": [], "dates": [], "names": [], "addresses": []
        }

    entities: Dict[str, List[str]] = {
        "case_numbers": [],
        "court_names": [],
        "amounts": [],
        "section_numbers": [],
        "dates": [],
        "names": [],
        "addresses": []
    }

    # 1. Case numbers (e.g. Case No. 123/2024, FIR No. 45/2023, OS 56/2022)
    case_pattern = r'(?:Case|FIR|O\.?S\.?|C\.?C\.?|W\.?P\.?|Cr\.?M\.?P\.?)\s*(?:No\.?|Number)?\s*[:\-]?\s*(\d+[\w\s\-/]*\d{4})'
    for m in re.finditer(case_pattern, ocr_text, re.IGNORECASE):
        val = m.group(0).strip()
        if len(val) <= 40 and val not in entities["case_numbers"]:
            entities["case_numbers"].append(val)

    # 2. Court names
    court_pattern = r'\b(?:Supreme Court|High Court|District Court|Sessions Court|Family Court|Magistrate Court|Labor Court|Labour Court|Consumer Forum|Tribunal)\b'
    for m in re.finditer(court_pattern, ocr_text, re.IGNORECASE):
        val = m.group(0).strip().title()
        if val not in entities["court_names"]:
            entities["court_names"].append(val)

    # 3. Rupee amounts (e.g., ₹ 1,50,000 / Rs. 50,000 / INR 25,000)
    amount_pattern = r'(?:₹|Rs\.?|INR)\s*\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?'
    for m in re.finditer(amount_pattern, ocr_text, re.IGNORECASE):
        val = m.group(0).strip()
        if val not in entities["amounts"]:
            entities["amounts"].append(val)

    # 4. Legal section numbers (e.g. Section 498A of IPC, Sec 125, Article 21)
    section_pattern = r'(?:Section|Sec\.|Article)\s+[\w()A-Z/-]+(?:\s+of\s+(?:the\s+)?[A-Z][A-Za-z\s]{2,30}(?:Act|Code|Law)?)?'
    for m in re.finditer(section_pattern, ocr_text):
        val = m.group(0).strip()
        if len(val) >= 7 and val not in entities["section_numbers"]:
            entities["section_numbers"].append(val)

    # 5. Dates (e.g. 15/08/2026, 2026-07-23, August 15, 2026)
    date_patterns = [
        r'\b\d{1,2}[/\.\-]\d{1,2}[/\.\-]\d{2,4}\b',
        r'\b\d{4}[/\.\-]\d{1,2}[/\.\-]\d{1,2}\b',
        r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b'
    ]
    for p in date_patterns:
        for m in re.finditer(p, ocr_text, re.IGNORECASE):
            val = m.group(0).strip()
            if val not in entities["dates"]:
                entities["dates"].append(val)

    # 6. Party Names (capitalised legal designations: vs / versus)
    name_pattern = r'\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b'
    for m in re.finditer(name_pattern, ocr_text):
        val = m.group(0).strip()
        # Filter out common legal words that get capitalized
        if val.lower() not in {"high court", "supreme court", "first information", "district court", "legal aid", "police station"} and val not in entities["names"]:
            entities["names"].append(val)
    entities["names"] = entities["names"][:8]  # cap at top 8

    # 7. Addresses (Street/Nagar/Colony/District)
    address_pattern = r'\b\d+\s+[A-Za-z0-9\s,]{5,40}(?:Street|Road|Lane|Colony|Society|Nagar|District|Pradesh)\b'
    for m in re.finditer(address_pattern, ocr_text, re.IGNORECASE):
        val = m.group(0).strip()
        if val not in entities["addresses"]:
            entities["addresses"].append(val)
    entities["addresses"] = entities["addresses"][:4]

    return entities


# ── Structured LLM Legal Document Analysis ─────────────────────────────────────

async def analyze_document_with_llm(
    ocr_markdown: str,
    document_type: DocumentType,
    chat_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Calls sarvam-30b with a JSON prompt to generate structured legal insights
    from extracted OCR document markdown.
    """
    if not ocr_markdown or len(ocr_markdown.strip()) < 20:
        return _fallback_document_analysis(ocr_markdown, "Document text is empty or too short.")

    prompt = f"""You are an expert Indian legal AI assistant. Analyze the following legal document text extracted via OCR.

DOCUMENT TYPE: {document_type.value.upper()}

DOCUMENT TEXT:
{ocr_markdown[:4000]}

Analyze the document and provide a structured JSON response with these exact fields:
{{
  "legal_category": "Short summary category of Indian law",
  "key_issues": ["Issue 1", "Issue 2"],
  "relevant_sections": ["Section X of Act Y"],
  "next_steps": ["Action step 1", "Action step 2"],
  "time_limits": ["Deadline 1 or 'Not specified'"],
  "rights_obligations": {{"rights": ["Right 1"], "obligations": ["Obligation 1"]}},
  "required_documents": ["Document 1 needed"],
  "legal_options": ["Option 1"],
  "confidence_score": 85
}}
Return ONLY valid JSON. No conversational filler."""

    try:
        response_text = await _call_sarvam_llm(
            system_prompt="You are a legal document analyzer. Return valid JSON only.",
            user_message=prompt,
            document_context="",
            reasoning_effort="low",
            max_tokens=700,
        )

        # Extract JSON from response
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            return data
    except Exception as exc:
        logger.warning("analyze_document_with_llm failed: %s — returning fallback analysis", exc)

    return _fallback_document_analysis(ocr_markdown, "Analysis generated via fallback parser.")


def _fallback_document_analysis(ocr_text: str, reason: str) -> Dict[str, Any]:
    return {
        "legal_category": "General Legal Document",
        "key_issues": ["Document content review required"],
        "relevant_sections": [],
        "next_steps": ["Consult a qualified advocate for specific document advice"],
        "time_limits": ["Not specified"],
        "rights_obligations": {"rights": ["Right to legal representation"], "obligations": []},
        "required_documents": [],
        "legal_options": ["Seek legal consultation"],
        "confidence_score": 70,
        "note": reason,
    }


def calculate_document_confidence(ocr_text: str, analysis: Dict[str, Any]) -> Dict[str, float]:
    """
    Calculate confidence metrics for document OCR and analysis.
    """
    text_len = len(ocr_text or "")
    # Longer clear text = higher OCR confidence
    ocr_confidence = min(0.95, max(0.40, text_len / 1000.0)) if text_len > 0 else 0.0

    raw_llm_score = analysis.get("confidence_score", 75)
    chat_confidence = (raw_llm_score / 100.0) if isinstance(raw_llm_score, (int, float)) else 0.75

    overall = round((ocr_confidence * 0.5 + chat_confidence * 0.5), 2)

    return {
        "ocr_confidence": round(ocr_confidence, 2),
        "chat_confidence": round(chat_confidence, 2),
        "overall_confidence": overall,
    }
