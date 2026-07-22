import os
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    SARVAM_API_KEY: Optional[str] = None

    # ── Google OAuth ───────────────────────────────────────────────────────────
    # NOTE-MANUAL: Create OAuth 2.0 Client ID at https://console.cloud.google.com
    GOOGLE_CLIENT_ID: Optional[str] = None

    # ── JWT ────────────────────────────────────────────────────────────────────
    SECRET_KEY: Optional[str] = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    GUEST_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    GUEST_QUERY_LIMIT: int = 3

    # ── Database ───────────────────────────────────────────────────────────────
    DATABASE_URL: Optional[str] = None

    # ── Server ─────────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:8081,http://localhost:8082,http://localhost:3000,http://localhost:19006"
    MAX_UPLOAD_SIZE_MB: int = 10
    AUDIO_CACHE_DIR: str = "./static/audio"
    PDF_DIR: str = "./static/complaints"
    UPLOAD_DIR: str = "./static/uploads"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()

# ── Post-processing: enforce required secrets in production ────────────────────
if settings.ENVIRONMENT == "production":
    if not settings.SECRET_KEY:
        raise ValueError("SECRET_KEY environment variable is required in production!")
    if not settings.DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable is required in production!")
else:
    # Use dev fallback keys only in development mode
    if not settings.SECRET_KEY:
        settings.SECRET_KEY = "neethimitra_dev_secret_key_replace_in_production_32chars"
    if not settings.DATABASE_URL:
        settings.DATABASE_URL = "sqlite:///./neethimitra.db"

# Convert postgres:// to postgresql:// for SQLAlchemy 1.4/2.0+ compatibility
if settings.DATABASE_URL and settings.DATABASE_URL.startswith("postgres://"):
    settings.DATABASE_URL = settings.DATABASE_URL.replace("postgres://", "postgresql://", 1)

def _resolve_storage_path(path_value: str) -> str:
    """
    Resolve a possibly relative storage path to an absolute path anchored
    at the backend root. Uses os.path.abspath — not string manipulation —
    for security (prevents path traversal via .. components).
    """
    # Normalize first to collapse any .. segments
    normalized = os.path.normpath(path_value)
    if os.path.isabs(normalized):
        return normalized
    backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    resolved = os.path.abspath(os.path.join(backend_root, normalized))
    # Safety: ensure resolved path is still inside backend_root or a system temp dir
    return resolved


settings.AUDIO_CACHE_DIR = _resolve_storage_path(settings.AUDIO_CACHE_DIR)
settings.PDF_DIR = _resolve_storage_path(settings.PDF_DIR)
settings.UPLOAD_DIR = _resolve_storage_path(settings.UPLOAD_DIR)


def ensure_storage_dirs() -> None:
    for path in (settings.AUDIO_CACHE_DIR, settings.PDF_DIR, settings.UPLOAD_DIR):
        os.makedirs(path, exist_ok=True)


def is_production() -> bool:
    return settings.ENVIRONMENT.lower() == "production"


# Required API keys and client credentials will be validated dynamically during API requests to prevent startup crashes.


# ── Sarvam Model Configuration (pinned — never use "latest" aliases) ───────────
# Source: Sarvam AI documentation — models page + Q6 engineering answer
# Pinning prevents silent regressions if Sarvam adds a new default.
MODEL_CONFIG = {
    "llm":         "sarvam-30b",   # Current production LLM (sarvam-m DEPRECATED 2026-07)
    "stt":         "saaras:v3",    # Current production STT (streaming + REST)
    "tts":         "bulbul:v3",    # Current production TTS (11-language set)
    "translation": "mayura:v1",   # Current production translation model
}

# ── Sarvam Starter Plan Rate Limits (per-minute) ──────────────────────────────
# Source: Sarvam AI documentation — Rate Limits page (Q5 answer)
# Use (limit - 2) as effective ceiling to absorb burst variance.
RATE_LIMITS = {
    "llm_per_min": 38,      # Sarvam confirms 40/min; -2 buffer
    "stt_rest_per_min": 58, # Sarvam confirms 60/min REST; -2 buffer
    "stt_batch_per_min": 18,# Sarvam confirms 20/min batch; -2 buffer
    # WebSocket concurrent stream limit: not documented — ask engineering team
    # TTS per-min limit: not separately published — ask engineering team
    # Mayura per-min limit: not separately published — ask engineering team
}
