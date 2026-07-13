import logging
import sys
import time

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

logger = logging.getLogger(__name__)
logger.info("main.py: logging is now configured — this line proves it")

app = FastAPI(title="NeethiMitra AI Backend")

# ── Global exception handler ─────────────────────────────────────────────────
# Catches any unhandled exception that wasn't caught inside a route handler.
# This fires AFTER the route handler and logs a full traceback so nothing
# can fail silently again.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    tb = traceback.format_exc()
    print(f"[GLOBAL EXCEPTION HANDLER] {request.method} {request.url.path} → {type(exc).__name__}: {exc}\n{tb}", flush=True)
    logger.exception(
        "UNHANDLED EXCEPTION: %s %s → %s: %s",
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


@app.get("/api/debug/db-audit")
def db_audit():
    """
    Production database audit endpoint.
    Performs Tasks 1a to 1e.
    """
    import os
    if os.environ.get("DISABLE_DEBUG_ROUTES", "").lower() == "true":
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")

    from app.database import SessionLocal
    from sqlalchemy import text

    db = SessionLocal()
    try:
        # 1. Get dialect
        bind = db.get_bind()
        dialect = bind.dialect.name

        # 2. Get actual tables in DB
        actual_tables = set()
        if dialect == "sqlite":
            rows = db.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
            actual_tables = {row[0] for row in rows}
        elif dialect == "postgresql":
            rows = db.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).fetchall()
            actual_tables = {row[0] for row in rows}
        else:
            rows = db.execute(text(
                "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
            )).fetchall()
            actual_tables = {row[0] for row in rows}

        expected_tables = {
            "users", "refresh_tokens", "sessions", "messages",
            "documents", "complaints", "helplines", "session_events", "auth_sessions"
        }

        orphaned_tables = actual_tables - expected_tables - {"alembic_version"}
        missing_tables = expected_tables - actual_tables

        # Row counts per table
        row_counts = {}
        for t in actual_tables:
            try:
                cnt = db.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
                row_counts[t] = cnt
            except Exception as e:
                row_counts[t] = f"ERROR: {str(e)}"

        # 3. Users audit
        users_provider_role = []
        try:
            res = db.execute(text(
                "SELECT provider, role, is_anonymous, COUNT(*) FROM users GROUP BY provider, role, is_anonymous"
            )).fetchall()
            users_provider_role = [
                {"provider": r[0], "role": r[1], "is_anonymous": r[2], "count": r[3]}
                for r in res
            ]
        except Exception as e:
            users_provider_role = f"ERROR: {str(e)}"

        real_users_missing_email = []
        try:
            res = db.execute(text(
                "SELECT id, name, provider FROM users WHERE email IS NULL AND is_anonymous = false"
            )).fetchall()
            real_users_missing_email = [
                {"id": r[0], "name": r[1], "provider": r[2]}
                for r in res
            ]
        except Exception as e:
            real_users_missing_email = f"ERROR: {str(e)}"

        passwords_check = []
        try:
            res = db.execute(text(
                "SELECT id, email, hashed_password FROM users WHERE hashed_password IS NOT NULL AND provider = 'password'"
            )).fetchall()
            for r in res:
                hp = r[2] or ""
                is_bcrypt = hp.startswith("$2") or hp.startswith("$argon2")
                passwords_check.append({
                    "id": r[0],
                    "email": r[1],
                    "hash_prefix": hp[:10],
                    "looks_hashed": is_bcrypt
                })
        except Exception as e:
            passwords_check = f"ERROR: {str(e)}"

        duplicate_emails = []
        try:
            res = db.execute(text(
                "SELECT email, COUNT(*) FROM users WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1"
            )).fetchall()
            duplicate_emails = [{"email": r[0], "count": r[1]} for r in res]
        except Exception as e:
            duplicate_emails = f"ERROR: {str(e)}"

        # Sample real users
        sample_real_users = []
        try:
            res = db.execute(text(
                "SELECT id, email, name, provider, is_anonymous, is_active, status, guest_queries_used, created_at "
                "FROM users WHERE is_anonymous = false LIMIT 5"
            )).fetchall()
            for r in res:
                sample_real_users.append({
                    "id": r[0], "email": r[1], "name": r[2], "provider": r[3],
                    "is_anonymous": r[4], "is_active": r[5], "status": r[6],
                    "guest_queries_used": r[7], "created_at": str(r[8])
                })
        except Exception as e:
            sample_real_users = f"ERROR: {str(e)}"

        guest_users_summary = {}
        try:
            total_guests = db.execute(text("SELECT COUNT(*) FROM users WHERE is_anonymous = true")).scalar()
            old_guests = 0
            if dialect == "postgresql":
                old_guests = db.execute(text(
                    "SELECT COUNT(*) FROM users WHERE is_anonymous = true AND created_at < NOW() - INTERVAL '7 days'"
                )).scalar()
            elif dialect == "sqlite":
                old_guests = db.execute(text(
                    "SELECT COUNT(*) FROM users WHERE is_anonymous = true AND created_at < datetime('now', '-7 days')"
                )).scalar()
            guest_users_summary = {"total_guests": total_guests, "old_guests_older_than_7_days": old_guests}
        except Exception as e:
            guest_users_summary = f"ERROR: {str(e)}"

        # 4. Orphaned/Dangling Data
        empty_sessions = []
        try:
            res = db.execute(text(
                "SELECT s.id, s.title, s.category, s.status, s.is_active, s.created_at, u.email "
                "FROM sessions s JOIN users u ON u.id = s.user_id "
                "WHERE s.id NOT IN (SELECT DISTINCT session_id FROM messages) "
                "ORDER BY s.created_at DESC LIMIT 20"
            )).fetchall()
            for r in res:
                empty_sessions.append({
                    "session_id": r[0], "title": r[1], "category": r[2], "status": r[3],
                    "is_active": r[4], "created_at": str(r[5]), "user_email": r[6]
                })
        except Exception as e:
            empty_sessions = f"ERROR: {str(e)}"

        stuck_documents = []
        try:
            if dialect == "postgresql":
                res = db.execute(text(
                    "SELECT id, filename, analysis_status, created_at FROM documents "
                    "WHERE analysis_status IN ('processing', 'pending') AND created_at < NOW() - INTERVAL '1 hour'"
                )).fetchall()
            else:
                res = db.execute(text(
                    "SELECT id, filename, analysis_status, created_at FROM documents "
                    "WHERE analysis_status IN ('processing', 'pending') AND created_at < datetime('now', '-1 hour')"
                )).fetchall()
            for r in res:
                stuck_documents.append({
                    "id": r[0], "filename": r[1], "status": r[2], "created_at": str(r[3])
                })
        except Exception as e:
            stuck_documents = f"ERROR: {str(e)}"

        orphaned_messages = 0
        try:
            orphaned_messages = db.execute(text(
                "SELECT COUNT(*) FROM messages m LEFT JOIN sessions s ON s.id = m.session_id WHERE s.id IS NULL"
            )).scalar()
        except Exception as e:
            orphaned_messages = f"ERROR: {str(e)}"

        orphaned_complaints = 0
        try:
            orphaned_complaints = db.execute(text(
                "SELECT COUNT(*) FROM complaints c LEFT JOIN sessions s ON s.id = c.session_id WHERE s.id IS NULL"
            )).scalar()
        except Exception as e:
            orphaned_complaints = f"ERROR: {str(e)}"

        # 5. Alembic migration
        alembic_version = None
        try:
            alembic_version = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
        except Exception as e:
            alembic_version = f"ERROR: {str(e)}"

        return {
            "status": "success",
            "dialect": dialect,
            "database_tables": sorted(list(actual_tables)),
            "orphaned_tables_in_db": sorted(list(orphaned_tables)),
            "missing_model_tables": sorted(list(missing_tables)),
            "row_counts": row_counts,
            "users_audit": {
                "provider_role_breakdown": users_provider_role,
                "real_users_missing_email": real_users_missing_email,
                "passwords_hash_check": passwords_check,
                "duplicate_emails": duplicate_emails,
                "guest_users_summary": guest_users_summary,
                "sample_real_users": sample_real_users
            },
            "orphaned_or_dangling_data": {
                "sessions_with_zero_messages": empty_sessions,
                "stuck_documents_processing_or_pending_over_1h": stuck_documents,
                "orphaned_messages_no_parent_session": orphaned_messages,
                "orphaned_complaints_no_parent_session": orphaned_complaints
            },
            "alembic_version": alembic_version
        }
    except Exception as exc:
        logger.exception("db_audit endpoint failed: %s", exc)
        return {"status": "error", "error": str(exc)}
    finally:
        db.close()

