"""
Advanced Analytics and Practice Dashboard Router
================================================
Endpoints for pulling practice dashboard analytics and exporting monthly
compliance reports. Access restricted to legal advocates and admins.
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io

from app.database import get_db
from app.core.dependencies import require_roles, require_real_user
from app.models import User
from app.services.analytics_service import AnalyticsService
from app.services.report_service import ReportService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["Practice Management & Analytics"])


@router.get("/summary")
async def get_practice_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "lawyer", "paralegal"])),
):
    """
    Get high-level practice dashboard KPIs:
      - Total documents processed
      - Document digitization success rates
      - Total registered citizens
      - Case folder breakdowns
    Restricted to lawyers, paralegals, and admins.
    """
    analytics = AnalyticsService(db)
    metrics = await analytics.get_practice_metrics()
    return metrics


@router.get("/report/csv")
async def download_monthly_report_csv(
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "lawyer"])),
):
    """
    Download a formatted monthly practice compliance and performance report (CSV).
    Restricted to lawyers and admins.
    """
    logger.info("User %s (role=%s) downloading compliance CSV report for %d-%02d", current_user.id, current_user.role, year, month)
    
    report_service = ReportService(db)
    report_data = await report_service.generate_monthly_report(year, month)
    csv_string = await report_service.export_report_csv(report_data)

    # Return CSV as streaming file response
    mem_file = io.StringIO(csv_string)
    
    filename = f"neethimitra_report_{year}_{month:02d}.csv"
    headers = {
        "Content-Disposition": f"attachment; filename={filename}"
    }
    
    return StreamingResponse(
        iter([mem_file.getvalue()]),
        media_type="text/csv",
        headers=headers,
    )
