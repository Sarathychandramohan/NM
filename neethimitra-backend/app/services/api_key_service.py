"""
API Key Management Service
==========================
Generates, stores, and verifies secure API keys for programmatic access.
"""

import secrets
import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models import ApiKey, User

logger = logging.getLogger(__name__)


def generate_user_api_key(db: Session, user_id: int, description: Optional[str] = None) -> str:
    """
    Generate a secure URL-safe API key for programmatic access and store it in the database.
    Format: 'nm_' + 32-bytes token
    """
    raw_key = f"nm_{secrets.token_urlsafe(32)}"

    db_key = ApiKey(
        user_id=user_id,
        key=raw_key,
        is_active=True,
        description=description or f"Generated at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
    )
    db.add(db_key)
    db.commit()
    db.refresh(db_key)
    return raw_key


def verify_user_api_key(db: Session, raw_key: str) -> Optional[User]:
    """
    Verify an API key and return the associated active User if valid.
    Updates last_used_at timestamp.
    """
    db_key = db.query(ApiKey).filter(ApiKey.key == raw_key, ApiKey.is_active.is_(True)).first()
    if not db_key:
        return None

    # Check if the user is active
    user = db.query(User).filter(User.id == db_key.user_id, User.is_active.is_(True)).first()
    if not user:
        return None

    db_key.last_used_at = datetime.now(timezone.utc)
    db.commit()
    return user


def revoke_user_api_key(db: Session, key_id: int, user_id: int) -> bool:
    """
    Revoke/deactivate an API key.
    """
    db_key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user_id).first()
    if not db_key:
        return False
    db_key.is_active = False
    db.commit()
    return True
