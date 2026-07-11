import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import Session as SessionModel, User
from app.schemas import SessionCreate, SessionDetailResponse, SessionResponse
from app.services.session_support import build_session_event, mark_session_active

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse)
def create_session(
    payload: SessionCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session_id = str(uuid.uuid4())
    title = payload.title or f"{payload.category} Case"

    db_session = SessionModel(
        id=session_id,
        user_id=current_user.id,
        title=title,
        category=payload.category,
        language_code=payload.language_code or current_user.preferred_language,
        is_active=True,
        status="active",
        source="app",
    )
    db.add(db_session)
    db.add(
        build_session_event(
            session_id=session_id,
            user_id=current_user.id,
            event_type="session_created",
            payload={"category": payload.category, "language_code": db_session.language_code},
        )
    )
    db.commit()
    db.refresh(db_session)
    return db_session


@router.get("", response_model=List[SessionResponse])
def list_sessions(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(SessionModel)
        .filter(SessionModel.user_id == current_user.id, SessionModel.is_active.is_(True))
        .order_by(SessionModel.last_activity_at.desc(), SessionModel.created_at.desc())
        .all()
    )


@router.get("/{session_id}", response_model=SessionDetailResponse)
def get_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_session = (
        db.query(SessionModel)
        .filter(
            SessionModel.id == session_id,
            SessionModel.user_id == current_user.id,
            SessionModel.is_active.is_(True),
        )
        .first()
    )
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    return db_session


@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_session = (
        db.query(SessionModel)
        .filter(SessionModel.id == session_id, SessionModel.user_id == current_user.id)
        .first()
    )
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    db_session.is_active = False
    mark_session_active(db_session, status="archived")
    db.add(
        build_session_event(
            session_id=session_id,
            user_id=current_user.id,
            event_type="session_archived",
        )
    )
    db.commit()
