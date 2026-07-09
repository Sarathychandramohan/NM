from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _get_or_create_dev_user(db: Session) -> User:
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
            provider="phone",
            role="user",
        )
        db.add(dev_user)
        db.commit()
        db.refresh(dev_user)
    return dev_user


def _decode_user_from_token(token: str | None, db: Session) -> User | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
    return db.query(User).filter(User.id == int(user_id), User.is_active == True).first()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if settings.ENVIRONMENT == "development":
        token_user = _decode_user_from_token(token, db)
        return token_user or _get_or_create_dev_user(db)

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user = _decode_user_from_token(token, db)
    if not user:
        raise credentials_exception
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
