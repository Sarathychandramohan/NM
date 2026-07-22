import datetime
import os
import uuid

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.config import settings

# NOTE: os.makedirs is intentionally NOT called here at import time.
# Directory creation is handled once at app startup via ensure_storage_dirs()
# in config.py, which is called inside app/main.py lifespan.


def generate_pdf_file(filepath: str, category: str, content: str) -> None:
    doc = SimpleDocTemplate(filepath, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "MainTitle",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0B5D1E"),
        alignment=1,
        spaceAfter=12,
    )
    meta_style = ParagraphStyle("MetaText", parent=styles["Normal"], fontSize=10, alignment=1, spaceAfter=18)
    body_style = ParagraphStyle("BodyTextCustom", parent=styles["Normal"], fontSize=11, leading=16, spaceAfter=10)

    story = [
        Paragraph("NEETHIMITRA AI - LEGAL COMPLAINT DRAFT", title_style),
        Paragraph(
            f"Category: {category} | Date Generated: {datetime.date.today().strftime('%B %d, %Y')}",
            meta_style,
        ),
        Spacer(1, 10),
        Paragraph("<b>To,</b>", body_style),
        Paragraph("<b>The Concerned Authority / Officer In-Charge,</b>", body_style),
        Paragraph("Local Jurisdiction Office / Appropriate Forum", body_style),
        Spacer(1, 8),
        Paragraph(f"<b>Subject: Complaint regarding {category}</b>", body_style),
        Spacer(1, 12),
        Paragraph("Respected Sir/Madam,", body_style),
    ]

    for paragraph in content.split("\n\n"):
        paragraph = paragraph.strip()
        if paragraph:
            story.append(Paragraph(paragraph.replace("\n", "<br/>"), body_style))
            story.append(Spacer(1, 6))

    story.extend(
        [
            Spacer(1, 16),
            Paragraph("Respectfully submitted,", body_style),
            Spacer(1, 12),
            Paragraph("___________________________", body_style),
            Paragraph("<b>Complainant Signature / Verification</b>", body_style),
        ]
    )

    verification_table = Table(
        [["Assisted By", "Verification Hash", "Status"], ["NeethiMitra AI", uuid.uuid4().hex[:12].upper(), "DRAFT"]],
        colWidths=[150, 180, 120],
    )
    verification_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F2F2F2")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
            ]
        )
    )
    story.append(Spacer(1, 24))
    story.append(verification_table)
    doc.build(story)


async def create_complaint_pdf(
    session_id: str,
    category: str,
    user_messages: list[str],
    document_texts: list[str],
    version: int = 1,
) -> tuple[str, str]:
    """
    Generates a versioned formal complaint PDF.
    Uses sarvam-30b to draft a formal Indian legal complaint letter based on session facts,
    falling back to structured local assembly if the AI call fails.
    """
    safe_session_id = os.path.basename(session_id)
    draft_filename = f"complaint_{safe_session_id}_v{version}.pdf"
    dest_path = os.path.join(settings.PDF_DIR, draft_filename)

    # Attempt AI-powered formal legal drafting
    summary_text = None
    if settings.SARVAM_API_KEY and user_messages:
        try:
            import httpx
            from app.services.legal_ai import SARVAM_CHAT_URL

            messages_prompt = "\n".join([f"- {m}" for m in user_messages])
            doc_prompt = "\n".join([f"Document Excerpt: {d[:500]}" for d in document_texts]) if document_texts else "None"

            prompt = (
                f"You are a formal legal drafting assistant for India.\n"
                f"Draft a formal, structured legal complaint letter regarding a '{category}' incident.\n\n"
                f"User Messages / Facts:\n{messages_prompt}\n\n"
                f"Document Context:\n{doc_prompt}\n\n"
                f"Instructions:\n"
                f"1. Write in formal legal English.\n"
                f"2. Include 3 distinct sections: FACTS OF THE CASE, RELEVANT LEGAL PROVISIONS, and RELIEF SOUGHT.\n"
                f"3. Use numbered paragraphs for facts.\n"
                f"4. Do NOT include markdown styling like **bold** or # headers — use plain uppercase headings."
            )

            async with httpx.AsyncClient() as client:
                res = await client.post(
                    SARVAM_CHAT_URL,
                    headers={"api-subscription-key": settings.SARVAM_API_KEY, "Content-Type": "application/json"},
                    json={
                        "model": "sarvam-30b",
                        "messages": [{"role": "system", "content": "You draft formal legal complaints for Indian authorities."}, {"role": "user", "content": prompt}],
                        "max_tokens": 1200,
                        "temperature": 0.2,
                        "reasoning_effort": "low",
                    },
                    timeout=40.0,
                )
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices and choices[0].get("message", {}).get("content"):
                        summary_text = choices[0]["message"]["content"].strip()
        except Exception:
            summary_text = None  # Fallback to local assembly below

    # Fallback to local assembly if AI drafting wasn't used or failed
    if not summary_text:
        summary_parts = [
            "This is a formal complaint drafted with assistance from NeethiMitra AI.",
            f"The applicant reports an incident under category: {category}.",
            "",
            "FACTS OF THE CASE:",
        ]
        if user_messages:
            summary_parts.extend(f"{index}. {text}" for index, text in enumerate(user_messages, start=1))
        else:
            summary_parts.append("The applicant has requested formal drafting assistance based on the session record.")

        if document_texts:
            summary_parts.extend(["", "SUPPORTING EVIDENCE:"])
            summary_parts.extend(
                f"Exhibit {index}: {text[:300].replace(chr(10), ' ')}"
                for index, text in enumerate(document_texts, start=1)
            )

        summary_parts.extend(
            [
                "",
                "RELIEF SOUGHT:",
                "The applicant requests appropriate inquiry, protection, refund, recovery, or other lawful relief from the competent authority.",
            ]
        )
        summary_text = "\n".join(summary_parts)

    generate_pdf_file(filepath=dest_path, category=category, content=summary_text)
    return f"/static/complaints/{draft_filename}", summary_text
