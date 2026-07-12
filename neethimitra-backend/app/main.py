import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ensure_storage_dirs, settings
from app.routers import auth, chat, complaints, documents, files, helplines, sessions

logger = logging.getLogger(__name__)

app = FastAPI(title="NeethiMitra AI Backend")

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
    TASK 2 — Sarvam connectivity isolation test.

    Calls the Sarvam LLM directly with a hardcoded test query — NO auth,
    NO database, NO session logic. Use this to verify:
      1. SARVAM_API_KEY is valid and set correctly in Render env vars
      2. The Sarvam API is reachable from the Render instance
      3. The chat/completions endpoint returns a real response

    This endpoint is intentionally LEFT ACTIVE in production as a safe
    monitoring/debugging tool — it only reads SARVAM_API_KEY from env vars
    and makes one outbound HTTP call. It does not expose user data or DB.
    It is rate-limit-safe (single call per hit).

    To disable in production, set the DISABLE_DEBUG_ROUTES env var to "true".
    """
    import os
    if os.environ.get("DISABLE_DEBUG_ROUTES", "").lower() == "true":
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")

    from app.services.legal_ai import get_legal_response

    t_start = time.time()
    logger.info("sarvam_isolation_test: starting direct Sarvam call")

    try:
        resolved_category, response_text = await get_legal_response(
            english_query="What are my basic legal rights as a citizen of India?",
            category="general",
            extracted_document_text="",
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
