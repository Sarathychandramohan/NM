import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DBSession
from jose import jwt

from app.config import settings
from app.core.dependencies import get_current_user, oauth2_scheme, _decode_user_from_token
from app.database import get_db
from app.models import Document, User
from app.schemas import DocumentResponse

router = APIRouter(tags=["files"])


def _safe_path(base_dir: str, filename: str) -> str:
    """Resolve and validate a file path, guarding against directory traversal."""
    safe_filename = os.path.basename(filename)
    path = os.path.abspath(os.path.join(base_dir, safe_filename))
    if not path.startswith(os.path.abspath(base_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return path


def verify_token_or_auth(
    filename: str,
    token: str | None = Query(None),
    auth_token: str | None = Depends(oauth2_scheme),
    db: DBSession = Depends(get_db),
) -> User:
    if token:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id = payload.get("sub")
            token_filename = payload.get("filename")
            if user_id and os.path.basename(token_filename) == os.path.basename(filename):
                user = db.query(User).filter(User.id == int(user_id), User.is_active.is_(True)).first()
                if user:
                    return user
        except Exception:
            pass

    # Fallback to standard Bearer token
    if auth_token:
        user = _decode_user_from_token(auth_token, db)
        if user:
            return user

    raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/api/files", response_model=List[DocumentResponse], summary="List all documents uploaded by the current user")
def list_user_files(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns all documents across all sessions belonging to the current user, newest first."""
    return (
        db.query(Document)
        .filter(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
        .all()
    )


# NOTE: Audio files are short-lived TTS outputs referenced by URL inside chat
# messages. Audio players (native/web) cannot easily set Authorization headers
# for src= URLs, so this endpoint stays publicly accessible. Filenames contain
# UUIDs so enumeration is not practical.
@router.get("/static/audio/{filename:path}")
def get_audio_file(filename: str):
    path = _safe_path(settings.AUDIO_CACHE_DIR, filename)
    media_type = "audio/wav" if path.lower().endswith(".wav") else "audio/mpeg"
    return FileResponse(path, media_type=media_type, headers={"Content-Disposition": "inline"})


# Complaint PDFs and uploaded documents are sensitive — authentication required.
# Supports both standard Authorization header and signed expiring query tokens.
@router.get("/static/complaints/{filename:path}")
def get_complaint_file(
    filename: str,
    current_user: User = Depends(verify_token_or_auth),
):
    path = _safe_path(settings.PDF_DIR, filename)
    return FileResponse(path, media_type="application/pdf", filename=os.path.basename(path))


@router.get("/static/uploads/{filename:path}")
def get_upload_file(
    filename: str,
    current_user: User = Depends(verify_token_or_auth),
):
    path = _safe_path(settings.UPLOAD_DIR, filename)
    return FileResponse(path, filename=os.path.basename(path))
