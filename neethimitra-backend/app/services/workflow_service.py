"""
Legal Case Workflow Orchestration Engine
========================================
Tracks multi-stage workflows (Legal Aid qualification, Court Notice response preparation)
with role-based access permissions, audit logs, and approval states.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class WorkflowService:
    def __init__(self):
        self.workflows = self._load_workflows()

    def _load_workflows(self) -> Dict[str, Dict[str, Any]]:
        """
        Configure workflows with steps, roles, and automated transitions.
        """
        return {
            "legal_aid_processing": {
                "name": "Legal Aid Qualification & Assignment",
                "steps": [
                    {
                        "step_index": 0,
                        "name": "document_upload",
                        "description": "Upload filled application form and income declaration.",
                        "required_fields": ["application_form", "income_proof"],
                        "requires_manual_role": None,
                        "auto_transition": True
                    },
                    {
                        "step_index": 1,
                        "name": "eligibility_check",
                        "description": "Verify income meets the criteria under Section 12 salsa rules.",
                        "required_fields": ["annual_income"],
                        "requires_manual_role": "paralegal",
                        "auto_transition": False
                    },
                    {
                        "step_index": 2,
                        "name": "legal_review",
                        "description": "Evaluate case merits and assign panel lawyer.",
                        "required_fields": ["assigned_lawyer_id", "review_notes"],
                        "requires_manual_role": "lawyer",
                        "auto_transition": False
                    },
                    {
                        "step_index": 3,
                        "name": "final_approval",
                        "description": "Authorized grant of legal aid representation.",
                        "required_fields": ["approval_ref"],
                        "requires_manual_role": "admin",
                        "auto_transition": False
                    }
                ]
            },
            "court_notice_processing": {
                "name": "Court Summons Response Pipeline",
                "steps": [
                    {
                        "step_index": 0,
                        "name": "notice_verification",
                        "description": "Extract case number, court, and notice dates.",
                        "required_fields": ["case_number", "court_name", "returnable_date"],
                        "requires_manual_role": None,
                        "auto_transition": True
                    },
                    {
                        "step_index": 1,
                        "name": "deadline_calculation",
                        "description": "Set system calendar alerts and legal limitation boundaries.",
                        "required_fields": ["limitation_days_left"],
                        "requires_manual_role": "paralegal",
                        "auto_transition": False
                    },
                    {
                        "step_index": 2,
                        "name": "response_drafting",
                        "description": "Draft formal response/written statement.",
                        "required_fields": ["written_statement_draft"],
                        "requires_manual_role": "lawyer",
                        "auto_transition": False
                    }
                ]
            }
        }

    def get_all_workflows(self) -> Dict[str, Dict[str, Any]]:
        """List all available workflows."""
        return self.workflows

    async def execute_workflow_step(
        self,
        workflow_name: str,
        step_name: str,
        data: dict,
        user_role: str,
    ) -> Dict[str, Any]:
        """
        Executes a workflow step if the user has the required role.
        Validates the step fields and returns updated state.
        """
        if workflow_name not in self.workflows:
            raise ValueError(f"Workflow '{workflow_name}' not found.")

        workflow = self.workflows[workflow_name]
        step = next((s for s in workflow["steps"] if s["name"] == step_name), None)
        if not step:
            raise ValueError(f"Step '{step_name}' not found in workflow '{workflow_name}'.")

        # Normalize role for validation
        normalized_role = "client" if user_role == "user" else user_role

        # Check role restriction
        required_role = step["requires_manual_role"]
        if required_role and normalized_role != required_role and normalized_role != "admin":
            logger.warning("Role validation failed: required '%s', user has '%s'", required_role, normalized_role)
            raise PermissionError(f"Step '{step_name}' requires '{required_role}' role (User has '{normalized_role}')")

        # Validate fields
        missing = [f for f in step["required_fields"] if f not in data or str(data[f]).strip() == ""]
        if missing:
            raise ValueError(f"Missing required data fields for step '{step_name}': {missing}")

        return {
            "step_name": step_name,
            "executed_at": datetime.now(timezone.utc).isoformat(),
            "status": "completed",
            "executed_by_role": normalized_role,
            "data": {k: data[k] for k in step["required_fields"]},
        }
