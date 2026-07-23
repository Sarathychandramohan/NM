from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .database import Base

def get_utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String, unique=True, index=True, nullable=True)
    name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)
    preferred_language = Column(String, default="en-IN", nullable=False)
    is_active = Column(Boolean, default=True)
    is_anonymous = Column(Boolean, default=False)
    guest_queries_used = Column(Integer, default=0, nullable=False)
    status = Column(String, default="active", nullable=False)
    state_code = Column(String, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)

    # ── Google OAuth fields (added in migration 002) ───────────────────────────
    email = Column(String, unique=True, index=True, nullable=True)
    google_id = Column(String, unique=True, index=True, nullable=True)
    provider = Column(String, default="password", nullable=False)  # "password"|"google"|"guest"
    profile_image = Column(String, nullable=True)               # Google profile picture URL
    role = Column(String, default="user", nullable=False)        # "user"|"admin"|"guest"

    # ── Voice preferences (added in migration 003) ─────────────────────────────
    # JSON-serialised dict: {"hi-IN": "ishita", "ta-IN": "kavya", ...}
    # Maps BCP-47 language codes to the user's chosen Bulbul v3 speaker name.
    # Null = use system default from LANGUAGE_DEFAULTS in voice_config.py.
    voice_preferences = Column(Text, nullable=True)              # JSON string or None

    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    session_events = relationship("SessionEvent", back_populates="user", cascade="all, delete-orphan")
    auth_sessions = relationship("AuthSession", back_populates="user", cascade="all, delete-orphan")
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_revoked = Column(Boolean, default=False)
    device_info = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    user = relationship("User", back_populates="refresh_tokens")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, index=True)  # Using UUID string
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)
    language_code = Column(String, default="en-IN", nullable=False)
    is_active = Column(Boolean, default=True)
    status = Column(String, default="active", nullable=False)
    source = Column(String, default="app", nullable=False)
    session_type = Column(String, default="chat", nullable=False)
    source_document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    last_activity_at = Column(DateTime, default=get_utc_now, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)

    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="session", cascade="all, delete-orphan", foreign_keys="[Document.session_id]")
    source_document = relationship("Document", foreign_keys=[source_document_id])
    complaints = relationship("Complaint", back_populates="session", cascade="all, delete-orphan")
    events = relationship("SessionEvent", back_populates="session", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)  # "user" or "assistant"
    text_content = Column(Text, nullable=False)
    original_language = Column(String, nullable=True) # E.g. ta-IN if spoken/typed in Tamil
    english_translation = Column(Text, nullable=True)
    audio_url = Column(String, nullable=True)
    input_type = Column(String, nullable=False, default="text") # "text" or "voice"
    category = Column(String, nullable=True)
    processing_status = Column(String, default="completed", nullable=False)
    error_message = Column(Text, nullable=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    session = relationship("Session", back_populates="messages")

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    mime_type = Column(String, nullable=True)
    file_size_kb = Column(Integer, nullable=True)
    analysis_status = Column(String, default="pending")  # pending, completed, failed
    extracted_text = Column(Text, nullable=True)
    sarvam_job_id = Column(String, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    analysis_error = Column(Text, nullable=True)
    analysis_provider = Column(String, nullable=True)
    extracted_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    session = relationship("Session", back_populates="documents", foreign_keys="[Document.session_id]")


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    pdf_path = Column(String, nullable=True)
    draft_text = Column(Text, nullable=False)
    category = Column(String, nullable=True)
    language_code = Column(String, nullable=True)
    status = Column(String, default="generated", nullable=False)
    version = Column(Integer, default=1, nullable=False)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
    finalized_at = Column(DateTime, nullable=True)
    final_pdf_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    session = relationship("Session", back_populates="complaints")

class Helpline(Base):
    __tablename__ = "helplines"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    number = Column(String, nullable=False)
    available_hours = Column(String, nullable=True)
    state = Column(String, nullable=True)
    language_code = Column(String, default="en-IN", nullable=False)
    priority = Column(Integer, default=1, nullable=False)
    district = Column(String, nullable=True)
    is_national = Column(Boolean, default=False, nullable=False)

class SessionEvent(Base):
    __tablename__ = "session_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String, nullable=False)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_utc_now)

    session = relationship("Session", back_populates="events")
    user = relationship("User", back_populates="session_events")


class AuthSession(Base):
    """Login audit trail — one row per login event per device."""
    __tablename__ = "auth_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device = Column(String, nullable=True)     # "android" | "web" | "ios"
    platform = Column(String, nullable=True)   # "expo" | "browser"
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    login_at = Column(DateTime, default=get_utc_now)
    logout_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)

    user = relationship("User", back_populates="auth_sessions")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String(255), unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=get_utc_now)
    last_used_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="api_keys")
