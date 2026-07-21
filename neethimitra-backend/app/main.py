import asyncio
import logging
import os
import sys
import time
from contextlib import asynccontextmanager

# ── CRITICAL: Configure root logger FIRST, before any other imports ──────────
# Without this, all logger.info/warning/exception calls in app/* modules are
# SILENTLY DROPPED because the root logger has no handlers. Uvicorn only
# configures its own "uvicorn.*" loggers, not application loggers. This is why
# Render logs show zero application output even though the code runs.
logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,        # stderr is unbuffered — guaranteed to flush immediately
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    force=True,               # Override any existing (empty) config from uvicorn
)
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import ensure_storage_dirs, settings
from app.routers import auth, chat, complaints, documents, files, helplines, sessions
from app.database import SessionLocal
from app.services.helpline_seeder import seed_helplines

logger = logging.getLogger(__name__)
logger.info("main.py: logging is now configured — this line proves it")



@asynccontextmanager
async def lifespan(app_instance):
    """Startup/shutdown tasks run once on cold start."""
    # Seed national helplines so the helplines page is never empty
    try:
        db = SessionLocal()
        seed_helplines(db)
        db.close()
        logger.info("lifespan: helpline seeder completed")
    except Exception as exc:
        logger.error("lifespan: helpline seeder failed (non-fatal): %s", exc)

    # ── Keep-alive self-ping for Render free tier ────────────────────────────
    # Render free instances spin down after ~15 minutes of inactivity, killing
    # any in-progress background tasks (e.g. Sarvam Vision PDF processing).
    # Every 9 minutes we ping our own /health endpoint to stay warm.
    # RENDER_EXTERNAL_URL is automatically injected by Render into the container.
    render_url = os.getenv("RENDER_EXTERNAL_URL", "").rstrip("/")

    async def _keep_alive_loop():
        if not render_url:
            logger.info("keep-alive: no RENDER_EXTERNAL_URL — skipping (local dev)")
            return
        import httpx
        ping_url = f"{render_url}/health"
        logger.info("keep-alive: starting loop — ping every 9 min → %s", ping_url)
        while True:
            await asyncio.sleep(9 * 60)  # 9 minutes
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    r = await client.get(ping_url)
                logger.info("keep-alive: ping %s → %s", ping_url, r.status_code)
            except Exception as exc:
                logger.warning("keep-alive: ping failed (non-fatal): %s", exc)

    task = asyncio.create_task(_keep_alive_loop())

    yield  # app is running

    # Graceful shutdown — cancel the ping loop
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="NeethiMitra AI Backend", lifespan=lifespan)

# ── Global exception handler ─────────────────────────────────────────────────
# Catches any unhandled exception that wasn't caught inside a route handler.
# This fires AFTER the route handler and logs a full traceback so nothing
# can fail silently again.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    tb = traceback.format_exc()
    print(f"[GLOBAL EXCEPTION HANDLER] {request.method} {request.url.path} -> {type(exc).__name__}: {exc}\n{tb}", flush=True)
    logger.exception(
        "UNHANDLED EXCEPTION: %s %s -> %s: %s",
        request.method, request.url.path, type(exc).__name__, exc,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_storage_dirs()

# Include Routers
app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(complaints.router)
app.include_router(helplines.router)
app.include_router(files.router)


@app.get("/")
def read_root():
    return {"message": "Welcome to NeethiMitra AI Backend API"}


@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


@app.get("/api/debug/sarvam-test")
async def sarvam_isolation_test():
    """
    Sarvam connectivity isolation test.
    Calls the Sarvam LLM directly with a hardcoded test query — NO auth,
    NO database, NO session logic. Verifies API key, network reachability,
    and that the sarvam-30b model is accepted.
    """
    import os
    if os.environ.get("DISABLE_DEBUG_ROUTES", "").lower() == "true":
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")

    from app.services.legal_ai import get_legal_response

    t_start = time.time()
    logger.info("sarvam_isolation_test: starting direct Sarvam call")
    print("sarvam_isolation_test: starting", flush=True)

    try:
        resolved_category, response_text = await get_legal_response(
            english_query="What are my basic legal rights as a citizen of India?",
            category="general",
            extracted_document_text="",
            session_language="en-IN",
        )
        elapsed = time.time() - t_start
        logger.info(
            "sarvam_isolation_test: SUCCESS — category=%s elapsed=%.2fs response_len=%d",
            resolved_category, elapsed, len(response_text),
        )
        return {
            "status": "success",
            "elapsed_seconds": round(elapsed, 2),
            "sarvam_api_key_set": bool(settings.SARVAM_API_KEY),
            "resolved_category": resolved_category,
            "response_preview": response_text[:500],
            "response_length": len(response_text),
        }
    except Exception as exc:
        elapsed = time.time() - t_start
        logger.exception("sarvam_isolation_test: FAILED after %.2fs — %s", elapsed, exc)
        return {
            "status": "error",
            "elapsed_seconds": round(elapsed, 2),
            "sarvam_api_key_set": bool(settings.SARVAM_API_KEY),
            "error": str(exc),
            "error_type": type(exc).__name__,
        }

