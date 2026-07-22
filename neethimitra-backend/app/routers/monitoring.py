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

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/internal", tags=["internal-monitoring"])

MONITOR_SECRET = os.getenv("MONITOR_SECRET", "neethimitra_internal_monitor_secret_key_2026")


@router.get("/rate-limits")
async def rate_limit_status(x_monitor_key: str = Header(...)):
    \"\"\"
    Internal monitoring endpoint.
    Call this from Render dashboard or uptime monitor.
    Protected by secret header (X-Monitor-Key).
    \"\"\"
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
