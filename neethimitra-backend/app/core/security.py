from datetime import datetime, timedelta, timezone
from typing import Optional, Union, Any
import secrets
from jose import jwt
from passlib.context import CryptContext
from app.config import settings

# ── Password hashing (bcrypt) ────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ── JWT ────────────────────────────────────────────────────────────────────────

def create_access_token(
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta
        else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode = {"exp": expire, "sub": str(subject)}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def create_file_download_token(user_id: int, filename: str, expires_minutes: int = 60) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    to_encode = {"exp": expire, "sub": str(user_id), "filename": filename}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def sign_file_url(file_path: str, user_id: int) -> str:
    import os
    if not file_path:
        return file_path
    filename = os.path.basename(file_path)
    token = create_file_download_token(user_id, filename)
    return f"{file_path}?token={token}"
