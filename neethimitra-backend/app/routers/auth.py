"""
Authentication router for NeethiMitra AI.

Endpoints:
  POST /api/auth/register        — Register with name, email, password
  POST /api/auth/login           — Login with email + password (OAuth2 form)
  POST /api/auth/google          — Google Sign-In (ID token verification)
  POST /api/auth/guest           — Instant anonymous access (3 free queries)
  POST /api/auth/guest/upgrade   — Upgrade guest to registered account
  POST /api/auth/refresh         — Rotate refresh token
  POST /api/auth/logout          — Revoke refresh token + close all active sessions
  GET  /api/auth/me              — Get current user profile
  PATCH /api/auth/me             — Update name / preferred_language
  PATCH /api/auth/me/avatar      — Update profile picture URL
  DELETE /api/auth/me            — Delete account + all data

NOTE-MANUAL: Set GOOGLE_CLIENT_ID in .env for real Google OAuth.
"""

import logging
import os
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_current_user, require_real_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)
from app.database import get_db
from app.models import AuthSession, Document, RefreshToken, Session as ChatSession, User, Complaint
from app.schemas import (
    AvatarUpdateRequest,
    FullUserResponse,
    GoogleLoginRequest,
    GuestResponse,
    GuestUpgradeRequest,
    GuestUpgradeResponse,
    LogoutRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserCreate,
    UserProfileUpdate,
    UserResponse,
)
from app.services.session_support import utcnow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _issue_refresh_token(db: Session, user_id: int, request: Request | None = None) -> str:
    token_value = create_refresh_token()
    expires_at = utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
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
    ua = request.headers.get("user-agent", "") if request else ""
    if "expo" in ua.lower():
        platform = "expo"
    elif "android" in ua.lower():
        platform = "android"
    else:
        platform = "web"
    device = "android" if "android" in ua.lower() else ("ios" if "iphone" in ua.lower() else "web")
    db.add(
        AuthSession(
            user_id=user_id,
            device=device,
            platform=platform,
            ip_address=request.client.host if request and request.client else None,
            user_agent=ua[:500],
            is_active=True,
        )
    )


def _build_token_response(db: Session, user: User, request: Request | None = None) -> TokenResponse:
    user.last_login_at = utcnow()
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


# ─── Register ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, summary="Register with name, email and password")
def register(user: UserCreate, request: Request, db: Session = Depends(get_db)):
    email = user.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    new_user = User(
        email=email,
        name=user.name.strip(),
        hashed_password=get_password_hash(user.password),
        preferred_language=user.preferred_language or "en-IN",
        is_anonymous=False,
        is_active=True,
        status="active",
        provider="password",
        role="user",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return _build_token_response(db, new_user, request=request)


# ─── Login ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse, summary="Login with email and password")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = form_data.username.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.hashed_password or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _build_token_response(db, user, request=request)


# ─── Google OAuth ─────────────────────────────────────────────────────────────

@router.post("/google", response_model=TokenResponse, summary="Google Sign-In via ID token")
def google_login(payload: GoogleLoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Accepts a Google ID token from the frontend (expo-auth-session).
    Verifies it server-side, upserts the user, returns JWT tokens.

    Security: If a verified Google email already exists in the database
    under a password account, login is rejected to prevent silent account
    takeovers. The user must log in with their original email/password instead.
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

    # Try to find user by google_id first, then fall back to email match
    user = (
        db.query(User).filter((User.google_id == google_id) | (User.email == email)).first()
    ) if email else db.query(User).filter(User.google_id == google_id).first()

    if user:
        # Bug fix: Prevent silent account takeover.
        # If this email matches a password account (google_id not linked yet),
        # reject the Google login rather than silently overwriting provider.
        if user.google_id != google_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    "An account with this email already exists using a different sign-in method. "
                    "Please log in with your email and password instead."
                ),
            )
        # Existing Google account — safe to update profile metadata
        user.profile_image = picture or user.profile_image
        if not user.name and name:
            user.name = name
        if payload.preferred_language:
            user.preferred_language = payload.preferred_language
    else:
        # First-time Google sign-in: create a new account
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


# ─── Guest ────────────────────────────────────────────────────────────────────

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
        last_login_at=utcnow(),
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


# ─── Guest Upgrade ────────────────────────────────────────────────────────────

@router.post("/guest/upgrade", response_model=GuestUpgradeResponse, summary="Upgrade guest to registered account")
def upgrade_guest(
    payload: GuestUpgradeRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upgrades an anonymous guest account to a full registered account.
    All operations are performed in a single atomic transaction.
    Migrates BOTH chat sessions AND uploaded documents to prevent data loss
    when the guest user row is deleted (the DB cascade would otherwise delete them).
    """
    if not current_user.is_anonymous:
        raise HTTPException(status_code=400, detail="Account is already registered.")

    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    try:
        # Step 1: Create the real user account
        real_user = User(
            email=email,
            name=payload.name.strip(),
            hashed_password=get_password_hash(payload.password),
            preferred_language=current_user.preferred_language or "en-IN",
            is_anonymous=False,
            is_active=True,
            status="active",
            provider="password",
            role="user",
        )
        db.add(real_user)
        db.flush()  # Assign real_user.id without committing yet

        migrated_sessions = 0
        if payload.migrate_history:
            # Step 2a: Migrate guest chat sessions
            guest_sessions = db.query(ChatSession).filter(ChatSession.user_id == current_user.id).all()
            for session in guest_sessions:
                session.user_id = real_user.id
            migrated_sessions = len(guest_sessions)

            # Step 2b: Migrate guest documents — CRITICAL: must happen before deleting the guest user
            # because Document.user_id has ondelete="CASCADE" pointing at users.id.
            # Without migrating documents first, db.delete(current_user) would cascade-delete all docs.
            guest_documents = db.query(Document).filter(Document.user_id == current_user.id).all()
            for doc in guest_documents:
                doc.user_id = real_user.id

        # Step 3: Revoke all guest refresh tokens
        db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id).update(
            {"is_revoked": True, "revoked_at": utcnow()}
        )

        # Step 4: Delete the guest user (safe now — sessions and docs already migrated)
        db.delete(current_user)

        # Step 5: Issue new tokens for the real account
        access_token = create_access_token(subject=real_user.id)
        new_refresh_token_value = create_refresh_token()
        expires_at = utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        db.add(RefreshToken(
            user_id=real_user.id,
            token=new_refresh_token_value,
            expires_at=expires_at,
            is_revoked=False,
            device_info=request.headers.get("user-agent") if request else None,
            ip_address=request.client.host if request and request.client else None,
        ))
        _record_auth_session(db, real_user.id, request=request)
        real_user.last_login_at = utcnow()

        # Single commit — atomic: all steps succeed together or none do
        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.error("Guest upgrade failed, transaction rolled back: %s", exc)
        raise HTTPException(status_code=500, detail="Account upgrade failed. Please try again.")

    return GuestUpgradeResponse(
        access_token=access_token,
        refresh_token=new_refresh_token_value,
        token_type="bearer",
        migrated_sessions=migrated_sessions,
    )


# ─── Token Refresh ────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse, summary="Rotate refresh token")
def refresh_tokens(payload: RefreshTokenRequest, request: Request, db: Session = Depends(get_db)):
    token_record = (
        db.query(RefreshToken)
        .filter(RefreshToken.token == payload.refresh_token, RefreshToken.is_revoked.is_(False))
        .first()
    )
    # SQLite strips tzinfo on read-back; normalise both sides to naive UTC before comparing.
    expires_at = token_record.expires_at.replace(tzinfo=None) if token_record else None
    now_naive = utcnow().replace(tzinfo=None)
    if not token_record or expires_at < now_naive:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")

    user = db.query(User).filter(User.id == token_record.user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or account deactivated.")

    token_record.is_revoked = True
    token_record.revoked_at = utcnow()
    db.commit()
    return _build_token_response(db, user, request=request)


# ─── Logout ───────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=204, summary="Revoke refresh token and close all active sessions")
def logout(payload: LogoutRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Revoke the specific refresh token provided
    token_record = (
        db.query(RefreshToken)
        .filter(RefreshToken.token == payload.refresh_token, RefreshToken.user_id == current_user.id)
        .first()
    )
    if token_record:
        token_record.is_revoked = True
        token_record.revoked_at = utcnow()

    # Bug fix: close ALL active AuthSessions, not just the most recent one.
    # A user may be logged in on multiple devices — all should be logged out.
    active_sessions = (
        db.query(AuthSession)
        .filter(AuthSession.user_id == current_user.id, AuthSession.is_active.is_(True))
        .all()
    )
    for auth_session in active_sessions:
        auth_session.is_active = False
        auth_session.logout_at = utcnow()

    db.commit()


# ─── Profile ──────────────────────────────────────────────────────────────────

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


@router.patch("/me/avatar", response_model=FullUserResponse, summary="Update profile picture URL")
def update_avatar(
    payload: AvatarUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_real_user),
):
    """
    Updates the user's profile picture URL.
    Uses a Pydantic model (AvatarUpdateRequest) instead of raw dict for proper
    request validation and OpenAPI schema documentation.
    """
    profile_image = payload.profile_image.strip()
    if not profile_image:
        raise HTTPException(status_code=400, detail="profile_image URL must not be empty.")
    current_user.profile_image = profile_image
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/me", status_code=204, summary="Delete account and all data")
def delete_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_real_user),
):
    user_id = current_user.id
    logger.info("delete_me: starting deletion process for user_id=%d", user_id)

    # 1. Query and delete physical document uploads from disk
    try:
        docs = db.query(Document).filter(Document.user_id == user_id).all()
        logger.info("delete_me: found %d document records to purge", len(docs))
        for doc in docs:
            if doc.file_path:
                filename = os.path.basename(doc.file_path)
                full_path = os.path.abspath(os.path.join(settings.UPLOAD_DIR, filename))
                if os.path.exists(full_path) and os.path.isfile(full_path):
                    try:
                        os.remove(full_path)
                        logger.info("delete_me: physically deleted doc file %s", full_path)
                    except Exception as e:
                        logger.error("delete_me: error removing doc file %s: %s", full_path, e)
    except Exception as exc:
        logger.error("delete_me: error querying user documents: %s", exc)

    # 2. Query and delete physical complaint PDFs from disk
    try:
        complaints = db.query(Complaint).join(ChatSession).filter(ChatSession.user_id == user_id).all()
        logger.info("delete_me: found %d complaint records to purge", len(complaints))
        for comp in complaints:
            for path_attr in ("pdf_path", "final_pdf_path"):
                path_val = getattr(comp, path_attr, None)
                if path_val:
                    filename = os.path.basename(path_val)
                    full_path = os.path.abspath(os.path.join(settings.PDF_DIR, filename))
                    if os.path.exists(full_path) and os.path.isfile(full_path):
                        try:
                            os.remove(full_path)
                            logger.info("delete_me: physically deleted complaint PDF %s", full_path)
                        except Exception as e:
                            logger.error("delete_me: error removing complaint PDF %s: %s", full_path, e)
    except Exception as exc:
        logger.error("delete_me: error querying user complaints: %s", exc)

    # 3. Perform database cascade deletion
    db.delete(current_user)
    db.commit()
    logger.info("delete_me: user_id=%d and all database rows purged successfully", user_id)
