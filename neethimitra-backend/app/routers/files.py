import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter(tags=["files"])


def _safe_path(base_dir: str, filename: str) -> str:
    normalized = os.path.normpath(filename)
    path = os.path.abspath(os.path.join(base_dir, normalized))
    if not path.startswith(os.path.abspath(base_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return path


@router.get("/static/audio/{filename:path}")
def get_audio_file(filename: str):
    path = _safe_path(settings.AUDIO_CACHE_DIR, filename)
    media_type = "audio/wav" if path.lower().endswith(".wav") else "audio/mpeg"
    return FileResponse(path, media_type=media_type, filename=os.path.basename(path))


@router.get("/static/complaints/{filename:path}")
def get_complaint_file(filename: str):
    path = _safe_path(settings.PDF_DIR, filename)
    return FileResponse(path, media_type="application/pdf", filename=os.path.basename(path))


@router.get("/static/uploads/{filename:path}")
def get_upload_file(filename: str):
    path = _safe_path(settings.UPLOAD_DIR, filename)
    return FileResponse(path, filename=os.path.basename(path))
