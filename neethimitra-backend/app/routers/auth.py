"""
Authentication router for NeethiMitra AI.

Endpoints:
  POST /api/auth/google          — Google Sign-In (ID token verification)
  POST /api/auth/request-otp     — Send OTP to phone (with rate limiting)
  POST /api/auth/verify-otp      — Verify OTP, create/login user
  POST /api/auth/guest           — Instant anonymous access (3 free queries)
  POST /api/auth/refresh         — Rotate refresh token
  POST /api/auth/logout          — Revoke refresh token
  GET  /api/auth/me              — Get current user profile
  PATCH /api/auth/me             — Update name / preferred_language
  POST /api/auth/guest/upgrade   — Upgrade guest to real account (migrate or discard history)
  DELETE /api/auth/me            — Delete account + all data

NOTE-MANUAL items (no code change needed from you, just set env vars):
  - GOOGLE_CLIENT_ID    : https://console.cloud.google.com
  - FAST2SMS_API_KEY    : https://fast2sms.com
"""

import logging
import random
import re
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_current_user, require_real_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    hash_otp,
    verify_otp_hash,
    verify_password,
)
from app.database import get_db
from app.models import AuthSession, OTPRequestRecord, RefreshToken, Session as ChatSession, User
from app.schemas import (
    FullUserResponse,
    GoogleLoginRequest,
    GuestResponse,
    GuestUpgradeRequest,
    GuestUpgradeResponse,
    LogoutRequest,
    OTPRequest,
    OTPRequestResponse,
    OTPVerifyRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserCreate,
    UserProfileUpdate,
    UserResponse,
)
from app.services.session_support import utcnow_naive
from app.services.sms import send_otp_sms

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

DEV_OTP_CODE = "123456"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _generate_otp() -> str:
    return str(random.SystemRandom().randint(100000, 999999))


def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 10:
        return digits
    if len(digits) == 12 and digits.startswith("91"):
        return digits[-10:]
    raise HTTPException(
        status_code=400,
        detail="Phone number must be a valid 10-digit Indian mobile number.",
    )


def _check_otp_rate_limit(phone: str, db: Session) -> None:
    """Raise HTTP 429 if the phone has requested too many OTPs in the rolling window."""
    window_start = utcnow_naive() - timedelta(minutes=settings.OTP_WINDOW_MINUTES)
    recent_count = (
        db.query(func.count(OTPRequestRecord.id))
        .filter(
            OTPRequestRecord.phone == phone,
            OTPRequestRecord.sent_at >= window_start,
        )
        .scalar()
        or 0
    )
    if recent_count >= settings.OTP_MAX_REQUESTS_PER_WINDOW:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Too many OTP requests. Please wait {settings.OTP_WINDOW_MINUTES} minutes "
                f"before requesting another OTP."
            ),
        )


def _issue_refresh_token(db: Session, user_id: int, request: Request | None = None) -> str:
    token_value = create_refresh_token()
    expires_at = utcnow_naive() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(
        RefreshToken(
            user_id=user_id,
            token=token_value,
            expires_at=expires_at,
            is_revoked=False,
            device_info=request.headers.get("user-agent") if request else None,
            ip_address=request.client.host if request and request.client else None,
        )
    )
    db.commit()
    return token_value


def _record_auth_session(db: Session, user_id: int, request: Request | None = None) -> None:
    """Log a new AuthSession row for audit trail."""
    ua = request.headers.get("user-agent", "") if request else ""
    platform = "expo" if "expo" in ua.lower() else ("android" in ua.lower() and "android" or "web")
    device = "android" if "android" in ua.lower() else ("ios" if "iphone" in ua.lower() else "web")
    db.add(
        AuthSession(
            user_id=user_id,
            device=device,
            platform=platform,
            ip_address=request.client.host if request and request.client else None,
            user_agent=ua[:500],  # truncate very long UA strings
            is_active=True,
        )
    )
    # No commit here — caller commits.


def _build_token_response(db: Session, user: User, request: Request | None = None) -> TokenResponse:
    user.last_login_at = utcnow_naive()
    user.status = "active"
    access_token = create_access_token(subject=user.id)
    refresh_token = _issue_refresh_token(db, user.id, request=request)
    _record_auth_session(db, user.id, request=request)
    db.commit()
    db.refresh(user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=FullUserResponse.model_validate(user),
    )


# ─── Existing endpoints (unchanged contracts) ─────────────────────────────────

@router.post("/register", response_model=UserResponse, summary="Register with phone and password")
def register(user: UserCreate, db: Session = Depends(get_db)):
    phone = _normalize_phone(user.phone)
    db_user = db.query(User).filter(User.phone == phone).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    new_user = User(
        phone=phone,
        name=user.name,
        hashed_password=get_password_hash(user.password),
        preferred_language=user.preferred_language or "en-IN",
        is_anonymous=False,
        status="active",
        provider="phone",
        role="user",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=TokenResponse, summary="Login with phone and password")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    phone = _normalize_phone(form_data.username)
    user = db.query(User).filter(User.phone == phone).first()
    if not user or not user.hashed_password or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect phone number or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _build_token_response(db, user, request=request)


@router.post("/request-otp", response_model=OTPRequestResponse, summary="Request OTP for phone login")
def request_otp(payload: OTPRequest, db: Session = Depends(get_db)):
    phone = _normalize_phone(payload.phone)

    # Rate limit: max N requests per phone per rolling window
    _check_otp_rate_limit(phone, db)

    expires_at = utcnow_naive() + timedelta(minutes=5)
    otp_code = DEV_OTP_CODE if settings.ENVIRONMENT != "production" else _generate_otp()

    db.add(
        OTPRequestRecord(
            phone=phone,
            otp_hash=hash_otp(otp_code),   # PBKDF2 — not bcrypt
            expires_at=expires_at,
            attempt_count=0,
            channel="sms",
            is_used=False,
        )
    )
    db.commit()

    if settings.ENVIRONMENT == "production":
        send_otp_sms(phone, otp_code)

    return OTPRequestResponse(
        success=True,
        message="OTP sent successfully" if settings.ENVIRONMENT == "production" else "OTP generated (dev mode — use 123456)",
        otp_hint=otp_code if settings.ENVIRONMENT != "production" else None,
    )


@router.post("/verify-otp", response_model=TokenResponse, summary="Verify OTP and issue JWT tokens")
def verify_otp(payload: OTPVerifyRequest, request: Request, db: Session = Depends(get_db)):
    phone = _normalize_phone(payload.phone)
    otp_record = (
        db.query(OTPRequestRecord)
        .filter(and_(OTPRequestRecord.phone == phone, OTPRequestRecord.is_used == False))
        .order_by(OTPRequestRecord.sent_at.desc())
        .first()
    )
    if not otp_record:
        raise HTTPException(status_code=400, detail="OTP not requested or already used.")
    if utcnow_naive() > otp_record.expires_at:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    if otp_record.attempt_count >= settings.OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many wrong attempts. Please request a new OTP.")
    if not verify_otp_hash(payload.otp, otp_record.otp_hash):
        otp_record.attempt_count += 1
        db.commit()
        remaining = settings.OTP_MAX_ATTEMPTS - otp_record.attempt_count
        raise HTTPException(status_code=400, detail=f"Invalid OTP. {remaining} attempt(s) remaining.")

    user = db.query(User).filter(User.phone == phone).first()
    if not user:
        user = User(
            phone=phone,
            name=payload.name or f"User {phone[-4:]}",
            preferred_language=payload.preferred_language or "en-IN",
            is_anonymous=False,
            is_active=True,
            status="active",
            provider="phone",
            role="user",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if payload.preferred_language:
            user.preferred_language = payload.preferred_language
        db.commit()
        db.refresh(user)

    otp_record.is_used = True
    otp_record.consumed_at = utcnow_naive()
    db.commit()
    return _build_token_response(db, user, request=request)


@router.post("/refresh", response_model=TokenResponse, summary="Rotate refresh token")
def refresh_tokens(payload: RefreshTokenRequest, request: Request, db: Session = Depends(get_db)):
    token_record = (
        db.query(RefreshToken)
        .filter(RefreshToken.token == payload.refresh_token, RefreshToken.is_revoked == False)
        .first()
    )
    if not token_record or token_record.expires_at < utcnow_naive():
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")

    user = db.query(User).filter(User.id == token_record.user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or account deactivated.")

    token_record.is_revoked = True
    token_record.revoked_at = utcnow_naive()
    db.commit()
    return _build_token_response(db, user, request=request)


@router.post("/logout", status_code=204, summary="Revoke refresh token")
def logout(payload: LogoutRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    token_record = (
        db.query(RefreshToken)
        .filter(RefreshToken.token == payload.refresh_token, RefreshToken.user_id == current_user.id)
        .first()
    )
    if token_record:
        token_record.is_revoked = True
        token_record.revoked_at = utcnow_naive()

    # Mark the matching auth session as logged out
    active_session = (
        db.query(AuthSession)
        .filter(AuthSession.user_id == current_user.id, AuthSession.is_active == True)
        .order_by(AuthSession.login_at.desc())
        .first()
    )
    if active_session:
        active_session.is_active = False
        active_session.logout_at = utcnow_naive()

    db.commit()


@router.post("/guest", response_model=GuestResponse, summary="Instant anonymous access (3 free queries)")
def guest_login(request: Request, db: Session = Depends(get_db)):
    guest_user = User(
        phone=None,
        name="Guest Citizen",
        hashed_password=None,
        is_anonymous=True,
        preferred_language="en-IN",
        is_active=True,
        guest_queries_used=0,
        status="active",
        last_login_at=utcnow_naive(),
        provider="guest",
        role="guest",
    )
    db.add(guest_user)
    db.commit()
    db.refresh(guest_user)

    access_token = create_access_token(
        subject=guest_user.id,
        expires_delta=timedelta(minutes=settings.GUEST_ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = _issue_refresh_token(db, guest_user.id, request=request)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user_id": guest_user.id,
        "expires_in_minutes": settings.GUEST_ACCESS_TOKEN_EXPIRE_MINUTES,
        "token_type": "bearer",
    }


# ─── New endpoints ─────────────────────────────────────────────────────────────

@router.post("/google", response_model=TokenResponse, summary="Google Sign-In via ID token")
def google_login(payload: GoogleLoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Accepts a Google ID token from the frontend (expo-auth-session) and:
    1. Verifies it server-side with Google's JWKS.
    2. Upserts the user (create if new, login if exists).
    3. Returns JWT access + refresh tokens.

    NOTE-MANUAL: GOOGLE_CLIENT_ID must be set in .env.
    In development, if GOOGLE_CLIENT_ID is not set, accepts mock tokens in the format:
        mock_google_<email>_<name>
    """
    from app.services.google_auth import verify_google_id_token

    try:
        idinfo = verify_google_id_token(payload.id_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=f"Google authentication failed: {exc}")

    google_id = idinfo["sub"]
    email = idinfo.get("email")
    name = idinfo.get("name") or (email.split("@")[0] if email else "Google User")
    picture = idinfo.get("picture")

    # Find existing user by google_id or email (handles account merging)
    user = (
        db.query(User)
        .filter(
            (User.google_id == google_id) | (User.email == email)
        )
        .first()
    ) if email else db.query(User).filter(User.google_id == google_id).first()

    if user:
        # Update Google-sourced fields in case they changed
        user.google_id = google_id
        user.profile_image = picture or user.profile_image
        if not user.email and email:
            user.email = email
        if not user.name and name:
            user.name = name
        user.provider = "google"
        if payload.preferred_language:
            user.preferred_language = payload.preferred_language
    else:
        # New user — create account
        user = User(
            email=email,
            google_id=google_id,
            name=name,
            profile_image=picture,
            provider="google",
            role="user",
            preferred_language=payload.preferred_language or "en-IN",
            is_anonymous=False,
            is_active=True,
            status="active",
            guest_queries_used=0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    db.commit()
    return _build_token_response(db, user, request=request)


@router.get("/me", response_model=FullUserResponse, summary="Get current user profile")
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=FullUserResponse, summary="Update profile (name, language)")
def update_me(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_real_user),
):
    if payload.name is not None:
        current_user.name = payload.name.strip()
    if payload.preferred_language is not None:
        current_user.preferred_language = payload.preferred_language
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/guest/upgrade", response_model=GuestUpgradeResponse, summary="Upgrade guest to registered account")
def upgrade_guest(
    payload: GuestUpgradeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upgrade an anonymous guest to a phone-verified account.
    - Verifies OTP for the given phone number.
    - Optionally migrates guest chat sessions to the new account.
    - Deletes the guest user record.
    - Returns new JWT tokens for the real account.
    """
    if not current_user.is_anonymous:
        raise HTTPException(status_code=400, detail="Account is already registered.")

    phone = _normalize_phone(payload.phone)

    # Verify OTP (reuse same logic as verify-otp)
    otp_record = (
        db.query(OTPRequestRecord)
        .filter(and_(OTPRequestRecord.phone == phone, OTPRequestRecord.is_used == False))
        .order_by(OTPRequestRecord.sent_at.desc())
        .first()
    )
    if not otp_record:
        raise HTTPException(status_code=400, detail="OTP not requested or already used.")
    if utcnow_naive() > otp_record.expires_at:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    if otp_record.attempt_count >= settings.OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many wrong attempts. Please request a new OTP.")
    if not verify_otp_hash(payload.otp, otp_record.otp_hash):
        otp_record.attempt_count += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    otp_record.is_used = True
    otp_record.consumed_at = utcnow_naive()

    # Find or create the real user for this phone
    real_user = db.query(User).filter(User.phone == phone).first()
    if not real_user:
        real_user = User(
            phone=phone,
            name=current_user.name if current_user.name != "Guest Citizen" else f"User {phone[-4:]}",
            preferred_language=current_user.preferred_language or "en-IN",
            is_anonymous=False,
            is_active=True,
            status="active",
            provider="phone",
            role="user",
        )
        db.add(real_user)
        db.commit()
        db.refresh(real_user)

    # Migrate or discard guest chat sessions
    migrated_count = 0
    if payload.migrate_history:
        guest_sessions = db.query(ChatSession).filter(ChatSession.user_id == current_user.id).all()
        for session in guest_sessions:
            session.user_id = real_user.id
        migrated_count = len(guest_sessions)

    # Revoke all guest refresh tokens
    db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id).update(
        {"is_revoked": True, "revoked_at": utcnow_naive()}
    )

    # Delete guest user
    db.delete(current_user)
    db.commit()

    # Issue new tokens for the real account
    access_token = create_access_token(subject=real_user.id)
    new_refresh_token = _issue_refresh_token(db, real_user.id, request=request)
    _record_auth_session(db, real_user.id, request=request)
    real_user.last_login_at = utcnow_naive()
    db.commit()

    return GuestUpgradeResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        migrated_sessions=migrated_count,
    )


@router.delete("/me", status_code=204, summary="Delete account and all data")
def delete_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_real_user),
):
    """
    Permanently delete the authenticated user's account and all associated data.
    Cascades to: sessions, messages, documents, complaints, refresh_tokens, auth_sessions.
    """
    db.delete(current_user)
    db.commit()
