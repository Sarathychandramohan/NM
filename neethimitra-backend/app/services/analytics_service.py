"""
Advanced Analytics and Practice Management Metrics Service
==========================================================
Computes processing performance and business intelligence metrics
directly from the database for legal dashboards and compliance audits.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import User, Document, Session as ChatSession, Complaint

logger = logging.getLogger(__name__)


class AnalyticsService:
    """
    Computes key performance indicators (KPIs) and document statistics.
    """
    def __init__(self, db: Session):
        self.db = db

    async def get_practice_metrics(self) -> Dict[str, Any]:
        """
        Aggregate overall usage and system metrics.
        """
        total_docs = self.db.query(func.count(Document.id)).scalar() or 0
        completed_docs = self.db.query(func.count(Document.id)).filter(Document.analysis_status == "completed").scalar() or 0
        failed_docs = self.db.query(func.count(Document.id)).filter(Document.analysis_status == "failed").scalar() or 0
        
        # Calculate success rate
        success_rate = (completed_docs / total_docs) if total_docs > 0 else 1.0

        total_users = self.db.query(func.count(User.id)).filter(User.is_anonymous.is_(False)).scalar() or 0
        guest_users = self.db.query(func.count(User.id)).filter(User.is_anonymous.is_(True)).scalar() or 0
        total_sessions = self.db.query(func.count(ChatSession.id)).scalar() or 0
        total_complaints = self.db.query(func.count(Complaint.id)).scalar() or 0

        # Top document categories
        top_categories_query = (
            self.db.query(ChatSession.category, func.count(ChatSession.id))
            .group_by(ChatSession.category)
            .order_by(func.count(ChatSession.id).desc())
            .limit(5)
            .all()
        )
        top_categories = [{"category": row[0], "count": row[1]} for row in top_categories_query]

        return {
            "summary": {
                "total_documents_processed": total_docs,
                "completed_documents": completed_docs,
                "failed_documents": failed_docs,
                "success_rate": round(success_rate, 4),
                "registered_users": total_users,
                "guest_users": guest_users,
                "active_chat_sessions": total_sessions,
                "complaints_drafted": total_complaints,
                "top_categories": top_categories,
            }
        }

    async def generate_performance_report(self, start_date: datetime, end_date: datetime) -> Dict[str, Any]:
        """
        Generates document processing stats broken down by MIME type.
        """
        docs = (
            self.db.query(Document)
            .filter(Document.created_at >= start_date, Document.created_at <= end_date)
            .all()
        )

        by_type = {}
        for doc in docs:
            mtype = doc.mime_type or "application/octet-stream"
            if mtype not in by_type:
                by_type[mtype] = {"total": 0, "completed": 0, "failed": 0, "sizes_kb": []}
            
            by_type[mtype]["total"] += 1
            if doc.analysis_status == "completed":
                by_type[mtype]["completed"] += 1
            elif doc.analysis_status == "failed":
                by_type[mtype]["failed"] += 1
            
            if doc.file_size_kb:
                by_type[mtype]["sizes_kb"].append(doc.file_size_kb)

        report = {}
        for mtype, stats in by_type.items():
            completed = stats["completed"]
            total = stats["total"]
            sizes = stats["sizes_kb"]

            report[mtype] = {
                "total_documents": total,
                "completed": completed,
                "failed": stats["failed"],
                "success_rate": round(completed / total, 4) if total > 0 else 1.0,
                "avg_file_size_kb": round(sum(sizes) / len(sizes), 2) if sizes else 0.0,
            }

        return report
