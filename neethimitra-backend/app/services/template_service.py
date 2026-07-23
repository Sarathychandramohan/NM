"""
Legal Document Template Service
===============================
Provides standardization for common legal forms (Legal Aid application,
Court Summons tracking, Cybercrime incident filings) to ensure consistency and compliance.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class TemplateService:
    def __init__(self):
        self.templates = self._load_default_templates()

    def _load_default_templates(self) -> Dict[str, Dict[str, Any]]:
        """
        Loads pre-configured template structures containing required fields,
        sections, and default labels.
        """
        return {
            "legal_aid_form": {
                "name": "Legal Aid Application Form (Section 12 Legal Services Authorities Act)",
                "required_fields": [
                    "full_name", "address", "phone", "annual_income", "case_description"
                ],
                "sections": [
                    "Applicant Personal Details",
                    "Financial Declaration",
                    "Case Particulars",
                    "Supporting Proofs"
                ],
                "description": "Standard form to apply for free legal representation for eligible categories."
            },
            "court_notice": {
                "name": "Court Notice Summons Verification",
                "required_fields": [
                    "case_number", "court_name", "notice_date", "returnable_date", "sections_cited"
                ],
                "sections": [
                    "Judicial Details",
                    "Timeline and Deadlines",
                    "Penal / Civil Code Citations",
                    "Required Appearance Info"
                ],
                "description": "Notice verification workflow to track court deadlines and penal citations."
            },
            "domestic_violence_petition": {
                "name": "Domestic Violence Protection Application (Section 12 DV Act)",
                "required_fields": [
                    "complainant_name", "respondent_name", "incidents_summary", "reliefs_sought"
                ],
                "sections": [
                    "Parties to Petition",
                    "History of Domestic Abuse",
                    "Reliefs Sought (Maintenance, Residence, Protection)",
                    "Evidence Checklist"
                ],
                "description": "Standard template for filing a protection or residence order under DV Act 2005."
            },
            "cybercrime_complaint": {
                "name": "Cyber Crime Incident Report (Section 66 IT Act)",
                "required_fields": [
                    "victim_name", "transaction_id", "platform_name", "incident_date", "loss_amount"
                ],
                "sections": [
                    "Incident Timeline",
                    "Financial Transaction Details",
                    "Technical Evidence (IP logs, URLs)",
                    "Police Information Copy"
                ],
                "description": "Filing template for online scams, netbanking hacks, or identity theft."
            }
        }

    def get_all_templates(self) -> Dict[str, Dict[str, Any]]:
        """List all available templates."""
        return self.templates

    async def create_document_from_template(self, template_name: str, data: dict) -> dict:
        """
        Validates input against template definitions and returns a validated,
        structured legal document ready for workflow routing.
        """
        if template_name not in self.templates:
            raise ValueError(f"Template '{template_name}' not found. Available: {list(self.templates.keys())}")

        template = self.templates[template_name]
        
        # Validate that all required fields are present and not empty
        missing_fields = [
            field for field in template["required_fields"]
            if field not in data or str(data[field]).strip() == ""
        ]
        
        if missing_fields:
            raise ValueError(f"Missing required fields for {template_name}: {missing_fields}")

        # Assemble the formatted legal document
        document = {
            "template_id": template_name,
            "template_name": template["name"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "data": {k: str(v).strip() for k, v in data.items() if k in template["required_fields"]},
            "sections": template["sections"],
            "status": "draft"
        }
        
        return document
