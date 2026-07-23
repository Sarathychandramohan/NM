"""
Report Generation and Export Service
====================================
Formats practice performance reports and converts database metrics
into downloadable CSV formats for compliance audits.
"""

import csv
import io
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.services.analytics_service import AnalyticsService

logger = logging.getLogger(__name__)


class ReportService:
    def __init__(self, db: Session):
        self.db = db
        self.analytics = AnalyticsService(db)

    async def generate_monthly_report(self, year: int, month: int) -> dict:
        """
        Generate a comprehensive monthly performance report.
        """
        start_date = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)

        # 1. Fetch performance breakdown by file type
        perf_data = await self.analytics.generate_performance_report(start_date, end_date)
        
        # 2. Fetch overall practice stats
        practice_data = await self.analytics.get_practice_metrics()
        
        return {
            "period": f"{year}-{month:02d}",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "performance_by_mime": perf_data,
            "overall_summary": practice_data["summary"],
        }

    async def export_report_csv(self, report_data: dict) -> str:
        """
        Convert monthly performance data to a formatted CSV string.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Metadata headers
        writer.writerow(["NEETHIMITRA AI PRACTICE PERFORMANCE REPORT"])
        writer.writerow(["Report Period", report_data.get("period", "All Time")])
        writer.writerow(["Generated At (UTC)", report_data.get("generated_at", "")])
        writer.writerow([])

        # Section 1: Overall Summary Metrics
        summary = report_data.get("overall_summary", {})
        writer.writerow(["OVERALL PRACTICE METRICS"])
        writer.writerow(["Metric Name", "Value"])
        writer.writerow(["Total Documents Processed", summary.get("total_documents_processed", 0)])
        writer.writerow(["Document Upload Success Rate", f"{summary.get('success_rate', 1.0) * 100:.2f}%"])
        writer.writerow(["Registered Citizens", summary.get("registered_users", 0)])
        writer.writerow(["Active Case Folders", summary.get("active_chat_sessions", 0)])
        writer.writerow(["Complaints Drafted", summary.get("complaints_drafted", 0)])
        writer.writerow([])

        # Section 2: Detailed MIME type breakdown
        mime_stats = report_data.get("performance_by_mime", {})
        writer.writerow(["MIME TYPE PROCESSING BREAKDOWN"])
        writer.writerow(["MIME Type", "Total Uploaded", "Completed", "Failed", "Success Rate", "Avg File Size (KB)"])
        for mtype, stats in mime_stats.items():
            writer.writerow([
                mtype,
                stats.get("total_documents", 0),
                stats.get("completed", 0),
                stats.get("failed", 0),
                f"{stats.get('success_rate', 1.0) * 100:.2f}%",
                stats.get("avg_file_size_kb", 0.0),
            ])

        return output.getvalue()
