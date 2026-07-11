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
    Generates a versioned complaint PDF.
    Filename includes the version number so repeated calls never overwrite previous drafts.
    e.g., complaint_<session_id>_v1.pdf, complaint_<session_id>_v2.pdf ...
    """
    safe_session_id = os.path.basename(session_id)
    draft_filename = f"complaint_{safe_session_id}_v{version}.pdf"
    dest_path = os.path.join(settings.PDF_DIR, draft_filename)

    summary_parts = [
        "This is a formal complaint drafted with assistance from NeethiMitra AI.",
        f"The applicant reports an incident under category: {category}.",
        "FACTS OF THE CASE:",
    ]

    if user_messages:
        summary_parts.extend(f"{index}. {text}" for index, text in enumerate(user_messages, start=1))
    else:
        summary_parts.append("The applicant has requested formal drafting assistance based on the session record.")

    if document_texts:
        summary_parts.append("")
        summary_parts.append("SUPPORTING EVIDENCE:")
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
