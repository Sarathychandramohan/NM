import os
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    SARVAM_API_KEY: Optional[str] = "PASTE_YOUR_SARVAM_API_KEY_HERE"

    # ── SMS (Fast2SMS — free tier, Indian numbers) ─────────────────────────────
    # TODO-MANUAL: Get your API key from https://fast2sms.com → Dev API
    FAST2SMS_API_KEY: Optional[str] = None

    # ── Google OAuth ───────────────────────────────────────────────────────────
    # TODO-MANUAL: Create OAuth 2.0 Client ID at https://console.cloud.google.com
    GOOGLE_CLIENT_ID: Optional[str] = None

    # ── JWT ────────────────────────────────────────────────────────────────────
    SECRET_KEY: str = "neethimitra_dev_secret_key_replace_in_production_32chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    GUEST_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    GUEST_QUERY_LIMIT: int = 3

    # ── OTP Rate Limiting ──────────────────────────────────────────────────────
    OTP_MAX_REQUESTS_PER_WINDOW: int = 3   # max OTP requests per phone per window
    OTP_WINDOW_MINUTES: int = 10           # rolling window in minutes
    OTP_MAX_ATTEMPTS: int = 5             # max wrong attempts before OTP is locked

    # ── Database ───────────────────────────────────────────────────────────────
    # TODO-MANUAL: Replace with your Render PostgreSQL Internal URL for production
    DATABASE_URL: str = "sqlite:///./neethimitra.db"

    # ── Server ─────────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:8081,http://localhost:8082,http://localhost:3000,http://localhost:19006"
    MAX_UPLOAD_SIZE_MB: int = 10
    AUDIO_CACHE_DIR: str = "./static/audio"
    PDF_DIR: str = "./static/complaints"
    UPLOAD_DIR: str = "./static/uploads"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()


def _resolve_storage_path(path_value: str) -> str:
    if os.path.isabs(path_value):
        return path_value
    backend_root = os.path.dirname(os.path.dirname(__file__))
    return os.path.abspath(os.path.join(backend_root, path_value))


settings.AUDIO_CACHE_DIR = _resolve_storage_path(settings.AUDIO_CACHE_DIR)
settings.PDF_DIR = _resolve_storage_path(settings.PDF_DIR)
settings.UPLOAD_DIR = _resolve_storage_path(settings.UPLOAD_DIR)


def ensure_storage_dirs() -> None:
    for path in (settings.AUDIO_CACHE_DIR, settings.PDF_DIR, settings.UPLOAD_DIR):
        os.makedirs(path, exist_ok=True)


def is_production() -> bool:
    return settings.ENVIRONMENT.lower() == "production"


def has_sarvam_key() -> bool:
    key = settings.SARVAM_API_KEY
    return bool(key and key != "PASTE_YOUR_SARVAM_API_KEY_HERE")
