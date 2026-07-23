"""
Legal Templates and Workflows API Router
========================================
Provides endpoints to fetch legal forms, generate documents from templates,
and execute multi-stage workflow actions with role validation.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, require_real_user
from app.models import User
from app.services.template_service import TemplateService
from app.services.workflow_service import WorkflowService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflows", tags=["Document Templates & Workflows"])

# Singleton services
template_service = TemplateService()
workflow_service = WorkflowService()


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/templates")
def list_templates(current_user: User = Depends(get_current_user)):
    """List all available legal document templates."""
    return template_service.get_all_templates()


@router.post("/templates/{template_name}/fill")
async def fill_template(
    template_name: str,
    data: dict,
    current_user: User = Depends(require_real_user),
):
    """
    Generate a formatted legal document from a template.
    Validates required fields.
    """
    try:
        doc = await template_service.create_document_from_template(template_name, data)
        return doc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/definitions")
def list_workflow_definitions(current_user: User = Depends(get_current_user)):
    """List all configured legal case workflows and their steps."""
    return workflow_service.get_all_workflows()


@router.post("/execute/{workflow_name}/{step_name}")
async def execute_step(
    workflow_name: str,
    step_name: str,
    data: dict,
    current_user: User = Depends(require_real_user),
):
    """
    Execute a workflow step. Checks role access limits.
    For example: 'eligibility_check' requires 'paralegal' or 'admin'.
    """
    try:
        user_role = getattr(current_user, "role", "user") or "user"
        result = await workflow_service.execute_workflow_step(
            workflow_name=workflow_name,
            step_name=step_name,
            data=data,
            user_role=user_role,
        )
        return {
            "success": True,
            "workflow_name": workflow_name,
            "step_name": step_name,
            "result": result,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
