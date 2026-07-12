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

@app.get("/test-sarvam-vision")
async def test_sarvam_vision():
    dummy_jpeg = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9'
    from app.services.sarvam_vision import extract_text_from_document
    import traceback
    try:
        res = await extract_text_from_document(dummy_jpeg, "test.jpg", "image/jpeg")
        return {"status": "success", "result": res}
    except Exception as e:
        tb = traceback.format_exc()
        return {"status": "error", "error": str(e), "traceback": tb}


@app.get("/debug-failed-docs")
def debug_failed_docs():
    from app.database import SessionLocal
    from app.models import Document
    db = SessionLocal()
    try:
        return db.query(Document).all()
    finally:
        db.close()


@app.get("/")
def read_root():
    return {"message": "Welcome to NeethiMitra AI Backend API"}


@app.get("/health")
def health():
    return {"status": "ok", "environment": settings.ENVIRONMENT}
