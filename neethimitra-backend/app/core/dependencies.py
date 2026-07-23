import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.services.api_key_service import verify_user_api_key

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def _get_or_create_dev_user(db: Session) -> User:
    """
    Creates a fallback dev user for local development ONLY.
    This is guarded by a hard check — it WILL NOT activate in production
    even if ENVIRONMENT is accidentally misconfigured.
    """
    # Hard safety guard: refuse to create dev user if any production signal is present
    if (
        settings.ENVIRONMENT.lower() == "production"
        or (settings.DATABASE_URL and "sqlite" not in settings.DATABASE_URL.lower() and settings.ENVIRONMENT.lower() != "development")
    ):
        logger.critical(
            "DEV USER BYPASS ATTEMPTED IN PRODUCTION ENVIRONMENT. Refusing. "
            "Check ENVIRONMENT env var — must be 'development' for local dev."
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    dev_user = db.query(User).filter(User.id == 1).first()
    if not dev_user:
        dev_user = User(
            id=1,
            phone="9999999999",
            name="Dev User",
            hashed_password=None,
            preferred_language="en-IN",
            is_active=True,
            is_anonymous=False,
            guest_queries_used=0,
            status="active",
            provider="password",
            role="user",
        )
        db.add(dev_user)
        db.commit()
        db.refresh(dev_user)
    return dev_user


def _decode_user_from_token(token: str | None, db: Session) -> User | None:
    """
    Decodes the JWT and fetches the corresponding user from the database.

    Previously only caught JWTError — any DB exception (e.g. OperationalError
    when Postgres is momentarily unavailable) would propagate uncaught, crash
    the uvicorn worker, and surface as an instant 502 with no log output.

    Now catches all exceptions and logs them explicitly so root causes are
    visible in Render logs.
    """
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            logger.warning("JWT decoded successfully but 'sub' claim is missing")
            return None
    except JWTError as exc:
        logger.warning("JWT decode failed (invalid/expired token): %s", exc)
        return None
    except Exception as exc:
        # Catches unexpected errors (e.g., misconfigured SECRET_KEY type)
        logger.exception("Unexpected error during JWT decode: %s", exc)
        return None

    try:
        user = db.query(User).filter(User.id == int(user_id), User.is_active.is_(True)).first()
        return user
    except Exception as exc:
        # Critical: DB failure here was silently crashing the worker and causing
        # an instant 502 with no log. Now we log it and return None → clean 401.
        logger.exception(
            "Database error while fetching user (user_id=%s) from token — "
            "this was previously causing silent worker crash + instant 502: %s",
            user_id, exc,
        )
        return None


def get_current_user(
    token: str = Depends(oauth2_scheme),
    x_api_key: str = Depends(api_key_header),
    db: Session = Depends(get_db),
) -> User:
    """
    Resolves the current user.
    Supports two authentication layers:
      1. Programmatic access: X-API-Key header (verifies key in database)
      2. Regular client: Bearer JWT token (jose decode)
      
    In development mode, falls back to dev user if neither is present.
    """
    logger.info(
        "get_current_user called — env=%s token_present=%s api_key_present=%s",
        settings.ENVIRONMENT,
        bool(token),
        bool(x_api_key),
    )

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Check for API Key first (programmatic access)
    if x_api_key:
        api_user = verify_user_api_key(db, x_api_key)
        if api_user:
            logger.info("get_current_user: authenticated via API Key, user_id=%s", api_user.id)
            return api_user
        else:
            logger.warning("get_current_user: invalid API key provided")
            raise credentials_exception

    # 2. Check for Bearer token fallback in Dev, strict in Prod
    if settings.ENVIRONMENT == "development" and not token:
        return _get_or_create_dev_user(db)

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        user = _decode_user_from_token(token, db)
    except Exception as exc:
        # Belt-and-suspenders: _decode_user_from_token should never raise
        # but if it does, log it and return a clean 401 rather than crashing.
        logger.exception("get_current_user: unexpected exception from _decode_user_from_token: %s", exc)
        raise credentials_exception

    if not user:
        logger.warning(
            "get_current_user: no valid user resolved — returning 401. "
            "token_present=%s env=%s",
            bool(token), settings.ENVIRONMENT,
        )
        raise credentials_exception

    logger.info("get_current_user: authenticated user_id=%s", user.id)
    return user


def require_real_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Use this dependency instead of get_current_user on endpoints that guests
    cannot access (PDF generation, document upload, chat history, etc.).
    Returns the authenticated user if they are registered; raises 403 for guests.
    """
    if current_user.is_anonymous:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This feature requires a registered account. Please sign in to continue.",
        )
    return current_user


def require_roles(allowed_roles: list[str]):
    """
    Role-Based Access Control (RBAC) dependency.
    Protects sensitive admin/legal endpoints based on User.role values
    (e.g., 'admin', 'lawyer', 'paralegal', 'client', 'viewer').
    """
    def dependency(current_user: User = Depends(require_real_user)) -> User:
        user_role = getattr(current_user, "role", "user") or "user"
        # Support both 'client' and 'user' as default roles for standard users
        normalized_role = "client" if user_role == "user" else user_role
        
        # Check if the role matches any allowed role
        if normalized_role not in allowed_roles:
            logger.warning(
                "Access denied for user_id=%s: role '%s' not in allowed %s",
                current_user.id, normalized_role, allowed_roles
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: this resource requires one of the roles: {allowed_roles}"
            )
        return current_user
    return dependency
