import os
import logging
from fastapi import APIRouter, Header, HTTPException

from app.utils.rate_limiter import (
    llm_limiter,
    stt_limiter,
    stt_batch_limiter,
    tts_limiter,
    translation_limiter,
    per_user_llm,
    per_user_stt,
    per_user_tts,
)

from app.services.document_monitor import doc_monitor, monitoring_config
from dataclasses import asdict
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/internal", tags=["internal-monitoring"])
doc_monitoring_router = APIRouter(prefix="/api/monitoring", tags=["document-monitoring"])

MONITOR_SECRET = os.getenv("MONITOR_SECRET", "neethimitra_internal_monitor_secret_key_2026")


@router.get("/rate-limits")
async def rate_limit_status(x_monitor_key: str = Header(...)):
    """
    Internal monitoring endpoint.
    Call this from Render dashboard or uptime monitor.
    Protected by secret header (X-Monitor-Key).
    """
    if x_monitor_key != MONITOR_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    return {
        "global_limiters": {
            "llm": llm_limiter.current_usage(),
            "stt_rest": stt_limiter.current_usage(),
            "stt_batch": stt_batch_limiter.current_usage(),
            "tts": tts_limiter.current_usage(),
            "translation": translation_limiter.current_usage(),
        },
        "per_user_active_sessions": {
            "llm": per_user_llm.active_user_count(),
            "stt": per_user_stt.active_user_count(),
            "tts": per_user_tts.active_user_count(),
        },
    }


@doc_monitoring_router.get("/health")
async def doc_monitoring_health():
    """Health check for document monitoring service."""
    try:
        stats = doc_monitor.get_performance_stats()
        health_status = {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "active_jobs": len(doc_monitor.get_active_jobs()),
            "stats": stats,
            "config": asdict(monitoring_config),
        }
        if stats.get("failed_jobs", 0) > 100:
            health_status["status"] = "degraded"
        return health_status
    except Exception as e:
        logger.error("Document monitoring health check failed: %s", str(e))
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


@doc_monitoring_router.get("/stats")
async def get_doc_monitoring_stats():
    """Get comprehensive document monitoring statistics."""
    try:
        stats = doc_monitor.get_performance_stats()
        active_jobs = doc_monitor.get_active_jobs()
        response = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "performance": stats,
            "active_jobs": {
                job_id: {
                    "user_id": job.user_id,
                    "document_type": job.document_type,
                    "status": job.status.value if hasattr(job.status, "value") else str(job.status),
                    "processing_time": job.processing_time,
                }
                for job_id, job in active_jobs.items()
            },
        }
        return response
    except Exception as e:
        logger.error("Failed to get document monitoring stats: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))
