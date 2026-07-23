"""
Document Processing Telemetry & Monitoring Service
==================================================
Tracks active document processing jobs, error counts, performance metrics,
and alert conditions for NeethiMitra AI document pipeline.
"""

import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List
from collections import defaultdict, deque
from dataclasses import dataclass, asdict
from enum import Enum

logger = logging.getLogger("document_processing")

# Global metrics store (in-memory sliding window of last 1000 jobs)
_metrics_store = defaultdict(lambda: deque(maxlen=1000))
_active_jobs: Dict[str, "JobMetrics"] = {}
_error_counts = defaultdict(int)


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class JobMetrics:
    job_id: str
    user_id: str
    document_type: str
    file_size: int
    status: JobStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    processing_time: Optional[float] = None
    error_count: int = 0


@dataclass
class MonitoringConfig:
    enabled: bool = True
    log_level: str = "INFO"
    alert_thresholds: Dict[str, Any] = None
    retention_days: int = 30
    cleanup_interval_hours: int = 24

    def __post_init__(self):
        if self.alert_thresholds is None:
            self.alert_thresholds = {
                "processing_time_seconds": 120,   # alert if job takes > 2 min
                "error_rate_per_hour": 10,
                "concurrent_jobs_limit": 50,
                "file_size_limit_mb": 50
            }


monitoring_config = MonitoringConfig()


class DocumentProcessingMonitor:
    """
    Comprehensive monitoring & tracking service for document OCR and legal analysis.
    """
    def __init__(self):
        self.logger = logger
        self.config = monitoring_config

    def track_job_start(self, job_id: str, user_id: str, metadata: Dict[str, Any]) -> None:
        """Track entry of a document processing job."""
        job_id = str(job_id).strip()
        now = datetime.now(timezone.utc)
        _active_jobs[job_id] = JobMetrics(
            job_id=job_id,
            user_id=str(user_id),
            document_type=str(metadata.get("document_type", "unknown")),
            file_size=int(metadata.get("file_size", 0)),
            status=JobStatus.PENDING,
            created_at=now,
            started_at=None,
            completed_at=None,
            processing_time=None,
            error_count=0
        )
        self.logger.info("Document processing job registered: %s (user_id=%s)", job_id, user_id)

    def track_job_start_processing(self, job_id: str) -> None:
        """Mark job status as PROCESSING."""
        job_id = str(job_id)
        if job_id in _active_jobs:
            _active_jobs[job_id].status = JobStatus.PROCESSING
            _active_jobs[job_id].started_at = datetime.now(timezone.utc)
            self.logger.info("Document processing job started execution: %s", job_id)

    def track_job_complete(self, job_id: str, processing_time: float) -> None:
        """Mark job as COMPLETED and record performance metrics."""
        job_id = str(job_id)
        if job_id in _active_jobs:
            job = _active_jobs[job_id]
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
            job.processing_time = round(processing_time, 2)

            self.logger.info(
                "Document processing job COMPLETED: %s in %.2fs",
                job_id, processing_time
            )
            self._record_metrics(asdict(job))

    def track_job_failed(self, job_id: str, error_message: str) -> None:
        """Mark job as FAILED and update telemetry error counters."""
        job_id = str(job_id)
        if job_id in _active_jobs:
            job = _active_jobs[job_id]
            job.status = JobStatus.FAILED
            job.completed_at = datetime.now(timezone.utc)
            job.error_count += 1

            _error_counts[job.document_type] += 1
            self.logger.error("Document processing job FAILED: %s — %s", job_id, error_message)
            self._record_metrics(asdict(job))

    def _record_metrics(self, job_data: Dict[str, Any]) -> None:
        """Store job metrics in sliding window buffer."""
        status_val = job_data["status"].value if isinstance(job_data["status"], JobStatus) else str(job_data["status"])
        metrics = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "job_id": job_data["job_id"],
            "user_id": job_data["user_id"],
            "document_type": job_data["document_type"],
            "file_size": job_data["file_size"],
            "processing_time": job_data["processing_time"],
            "status": status_val,
        }
        _metrics_store["processing_metrics"].append(metrics)

    def get_active_jobs(self) -> Dict[str, JobMetrics]:
        """Return all active jobs currently in flight."""
        return _active_jobs.copy()

    def get_performance_stats(self) -> Dict[str, Any]:
        """Calculate aggregated telemetry statistics for dashboard endpoints."""
        metrics = list(_metrics_store.get("processing_metrics", []))
        if not metrics:
            return {
                "total_jobs": 0,
                "completed_jobs": 0,
                "failed_jobs": 0,
                "avg_processing_time": 0.0,
                "active_jobs_count": len(_active_jobs),
            }

        completed = [m for m in metrics if m.get("status") == "completed"]
        failed = [m for m in metrics if m.get("status") == "failed"]
        p_times = [m["processing_time"] for m in completed if m.get("processing_time") is not None]

        return {
            "total_jobs": len(metrics),
            "completed_jobs": len(completed),
            "failed_jobs": len(failed),
            "active_jobs_count": len(_active_jobs),
            "avg_processing_time": round(sum(p_times) / len(p_times), 2) if p_times else 0.0,
            "max_processing_time": round(max(p_times), 2) if p_times else 0.0,
            "min_processing_time": round(min(p_times), 2) if p_times else 0.0,
            "error_counts_by_type": dict(_error_counts),
        }

    def cleanup_old_jobs(self, hours_old: int = 24) -> int:
        """Clean up completed/failed jobs from active tracking memory."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_old)
        to_delete = [
            job_id for job_id, job in _active_jobs.items()
            if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED)
            and job.completed_at and job.completed_at < cutoff
        ]
        for job_id in to_delete:
            del _active_jobs[job_id]
        return len(to_delete)


# Global singleton instance
doc_monitor = DocumentProcessingMonitor()
