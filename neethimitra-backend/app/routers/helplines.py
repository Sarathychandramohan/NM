from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import Helpline, User
from app.schemas import HelplineResponse

router = APIRouter(prefix="/api/helplines", tags=["helplines"])


@router.get("", response_model=List[HelplineResponse])
def list_helplines(
    category: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    national_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Helpline)
    if category:
        query = query.filter(Helpline.category == category)
    if state:
        query = query.filter((Helpline.state == state) | (Helpline.state.is_(None)))
    if national_only:
        query = query.filter(Helpline.is_national.is_(True))
    return query.order_by(Helpline.priority.asc(), Helpline.name.asc()).all()
