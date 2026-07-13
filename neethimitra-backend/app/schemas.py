from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# ─── AUTH ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    preferred_language: Optional[str] = "en-IN"

class GoogleLoginRequest(BaseModel):
    """Sent by the frontend after getting a Google ID token from expo-auth-session."""
    id_token: str
    preferred_language: Optional[str] = "en-IN"

class UserProfileUpdate(BaseModel):
    """PATCH /api/auth/me — update mutable profile fields."""
    name: Optional[str] = None
    preferred_language: Optional[str] = None

class AvatarUpdateRequest(BaseModel):
    """PATCH /api/auth/me/avatar — update profile picture URL with validation."""
    profile_image: str


class GuestUpgradeRequest(BaseModel):
    """POST /api/auth/guest/upgrade — upgrade guest to registered account."""
    email: EmailStr
    name: str
    password: str
    migrate_history: bool = True   # True = move sessions to new account

class GuestUpgradeResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    migrated_sessions: int = 0     # number of chat sessions moved to the real account

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: Optional["FullUserResponse"] = None

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class GuestResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_id: int
    expires_in_minutes: int
    token_type: str = "bearer"

class UserResponse(BaseModel):
    """Slim response — used inside TokenResponse and legacy endpoints."""
    id: int
    phone: Optional[str] = None
    name: Optional[str] = None
    preferred_language: str
    is_anonymous: bool
    guest_queries_used: int = 0
    status: str = "active"
    state_code: Optional[str] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}

class FullUserResponse(BaseModel):
    """Full profile — returned by /api/auth/me and TokenResponse."""
    id: int
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    profile_image: Optional[str] = None
    provider: str = "phone"          # "phone" | "google" | "guest"
    role: str = "user"               # "user" | "admin" | "guest"
    preferred_language: str
    is_anonymous: bool
    guest_queries_used: int = 0
    status: str = "active"
    state_code: Optional[str] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}

class LogoutRequest(BaseModel):
    refresh_token: str


# ─── MESSAGES ──────────────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    id: int
    session_id: str
    role: str                         # "user" | "assistant"
    text_content: str
    input_type: str                   # "text" | "voice"
    original_language: Optional[str] = None
    english_translation: Optional[str] = None
    audio_url: Optional[str] = None
    created_at: datetime
    category: Optional[str] = None
    processing_status: str = "completed"
    error_message: Optional[str] = None
    meta_json: Optional[str] = None

    model_config = {"from_attributes": True}

class ChatResponse(BaseModel):
    user_message: MessageResponse
    assistant_message: MessageResponse

# ─── SESSIONS ──────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    category: str
    title: Optional[str] = None
    language_code: Optional[str] = "en-IN"

class SessionResponse(BaseModel):
    id: str
    user_id: int
    title: str
    category: str
    language_code: str
    is_active: bool
    status: str = "active"
    source: str = "app"
    last_activity_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}

# ─── DOCUMENTS ─────────────────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: int
    session_id: str
    filename: str
    file_path: str
    mime_type: Optional[str] = None
    file_size_kb: Optional[int] = None
    analysis_status: str              # "pending" | "completed" | "failed"
    extracted_text: Optional[str] = None
    sarvam_job_id: Optional[str] = None
    processed_at: Optional[datetime] = None
    analysis_error: Optional[str] = None
    analysis_provider: Optional[str] = None
    extracted_summary: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

# ─── COMPLAINTS ────────────────────────────────────────────────────────────────

class ComplaintResponse(BaseModel):
    id: int
    session_id: str
    pdf_path: Optional[str] = None
    draft_text: str
    category: Optional[str] = None
    language_code: Optional[str] = None
    status: str = "generated"
    version: int = 1
    updated_at: Optional[datetime] = None
    finalized_at: Optional[datetime] = None
    final_pdf_path: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

# ─── HELPLINES ─────────────────────────────────────────────────────────────────

class HelplineResponse(BaseModel):
    id: int
    category: str
    name: str
    number: str
    available_hours: Optional[str] = None
    state: Optional[str] = None
    language_code: str = "en-IN"
    priority: int = 1
    district: Optional[str] = None
    is_national: bool = False

    model_config = {"from_attributes": True}

class SessionEventResponse(BaseModel):
    id: int
    session_id: str
    user_id: int
    event_type: str
    payload_json: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

class SessionDetailResponse(SessionResponse):
    messages: List[MessageResponse] = []
    documents: List[DocumentResponse] = []
    complaints: List[ComplaintResponse] = []
    events: List[SessionEventResponse] = []
