from datetime import datetime, timedelta, timezone
from typing import Optional, Union, Any
import hashlib
import hmac
import secrets
from jose import jwt
from passlib.context import CryptContext
from app.config import settings

# ── Password hashing (bcrypt) — for user passwords only ──────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ── OTP hashing (PBKDF2-HMAC) — lightweight, bcrypt is overkill for OTPs ────
# OTPs are short-lived (5 min) so we use PBKDF2 with the SECRET_KEY as salt.
_OTP_SALT = b"neethimitra_otp_salt_v1"


def hash_otp(otp: str) -> str:
    """Hash a 6-digit OTP using PBKDF2-HMAC-SHA256. Returns hex digest."""
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        otp.encode("utf-8"),
        _OTP_SALT + settings.SECRET_KEY.encode("utf-8"),
        iterations=100_000,
    )
    return dk.hex()


def verify_otp_hash(plain_otp: str, stored_hash: str) -> bool:
    """Constant-time comparison of OTP against stored PBKDF2 hash."""
    expected = hash_otp(plain_otp)
    return hmac.compare_digest(expected, stored_hash)


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
