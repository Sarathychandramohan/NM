"""
FastAPI dependency functions for Sarvam API rate limiting.

Usage in routes:
    from app.middleware.rate_limit_deps import check_llm_limit, check_tts_limit

    @router.post("/chat", dependencies=[Depends(check_llm_limit)])
    async def chat_endpoint(req: ChatRequest):
        ...
"""

import logging

from fastapi import Depends, HTTPException, Request

from app.utils.rate_limiter import (
    llm_limiter,
    per_user_llm,
    per_user_stt,
    per_user_tts,
    stt_limiter,
    tts_limiter,
    translation_limiter,
)

logger = logging.getLogger("neethimitra.middleware")


def _get_user_context(request: Request) -> tuple[str, bool]:
    """Extract user_id and is_guest from request headers or state."""
    user_id = request.headers.get("X-User-ID", "anonymous")
    is_guest = request.headers.get("X-Is-Guest", "true").lower() != "false"
    # Fallback: check request state set by auth middleware
    if hasattr(request.state, "user_id") and request.state.user_id:
        user_id = str(request.state.user_id)
    if hasattr(request.state, "is_anonymous"):
        is_guest = request.state.is_anonymous
    return user_id, is_guest


async def check_llm_limit(request: Request) -> None:
    """
    Dependency for all /chat routes.
    Checks per-user limit first (fast fail), then global Sarvam limit.
    """
    user_id, is_guest = _get_user_context(request)

    # Per-user check — fail fast, don't queue (5s timeout)
    user_ok = await per_user_llm.acquire(
        user_id=user_id, is_guest=is_guest, timeout=5.0
    )
    if not user_ok:
        logger.warning("LLM per-user rate limit exceeded: user=%s guest=%s", user_id, is_guest)
        raise HTTPException(
            status_code=429,
            detail={
                "error": "user_rate_limit_exceeded",
                "message": "You are sending messages too quickly. Please wait a moment before trying again.",
                "retry_after_seconds": 10,
            },
        )

    # Global Sarvam API check — allow up to 20s queue (prevents 429 from Sarvam)
    global_ok = await llm_limiter.acquire(timeout=20.0)
    if not global_ok:
        logger.warning("Global LLM rate limit timeout: user=%s", user_id)
        raise HTTPException(
            status_code=503,
            detail={
                "error": "service_capacity_exceeded",
                "message": "The service is very busy right now. Please try again in a moment.",
                "retry_after_seconds": 30,
            },
        )


async def check_stt_limit(request: Request) -> None:
    """
    Dependency for REST STT upload endpoint /messages/voice.
    """
    user_id, is_guest = _get_user_context(request)

    user_ok = await per_user_stt.acquire(
        user_id=user_id, is_guest=is_guest, timeout=3.0
    )
    if not user_ok:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "user_rate_limit_exceeded",
                "message": "Too many voice requests. Please slow down.",
                "retry_after_seconds": 5,
            },
        )

    global_ok = await stt_limiter.acquire(timeout=10.0)
    if not global_ok:
        raise HTTPException(
            status_code=503,
            detail={"error": "service_capacity_exceeded", "message": "STT service is busy. Please retry."},
        )


async def check_tts_limit(request: Request) -> None:
    """
    Dependency for the /speak TTS route.
    """
    user_id, is_guest = _get_user_context(request)

    user_ok = await per_user_tts.acquire(
        user_id=user_id, is_guest=is_guest, timeout=3.0
    )
    if not user_ok:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "user_rate_limit_exceeded",
                "message": "Too many speech requests. Please wait a moment.",
                "retry_after_seconds": 5,
            },
        )

    global_ok = await tts_limiter.acquire(timeout=10.0)
    if not global_ok:
        raise HTTPException(
            status_code=503,
            detail={"error": "service_capacity_exceeded", "message": "TTS service is busy. Please retry."},
        )


async def check_translation_limit() -> None:
    """
    Dependency for Mayura translation calls — used internally in services,
    not directly in route decorators.
    """
    ok = await translation_limiter.acquire(timeout=15.0)
    if not ok:
        raise RuntimeError("Translation service is at capacity. Please retry.")
