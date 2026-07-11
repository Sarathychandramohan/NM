import json
from datetime import datetime, timezone
from typing import Any

from app.models import Session as SessionModel, SessionEvent


def utcnow() -> datetime:
    """Always return timezone-aware UTC datetime. Use this everywhere instead of utcnow_naive()."""
    return datetime.now(timezone.utc)


# Keep alias so any remaining references don't crash during transition
utcnow_naive = utcnow


def summarize_text(text: str | None, limit: int = 240) -> str | None:
    if not text:
        return None
    clean = " ".join(text.split())
    if len(clean) <= limit:
        return clean
    return f"{clean[: limit - 1].rstrip()}…"


def mark_session_active(session: SessionModel, status: str = "active") -> None:
    session.status = status
    session.last_activity_at = utcnow()


def build_session_event(
    session_id: str,
    user_id: int,
    event_type: str,
    payload: dict[str, Any] | None = None,
) -> SessionEvent:
    return SessionEvent(
        session_id=session_id,
        user_id=user_id,
        event_type=event_type,
        payload_json=json.dumps(payload, ensure_ascii=False) if payload else None,
        created_at=utcnow(),
    )
