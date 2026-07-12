from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ensure_storage_dirs, settings
from app.routers import auth, chat, complaints, documents, files, helplines, sessions

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

@app.get("/debug-failed-docs")
def debug_failed_docs():
    from app.database import SessionLocal
    from app.models import Document
    db = SessionLocal()
    try:
        return db.query(Document).filter(Document.analysis_status == "failed").all()
    finally:
        db.close()


@app.get("/")
def read_root():
    return {"message": "Welcome to NeethiMitra AI Backend API"}


@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.ENVIRONMENT}
