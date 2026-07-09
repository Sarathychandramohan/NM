from typing import List, Optional

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Helpline
from app.schemas import HelplineResponse
from fastapi import Depends

router = APIRouter(prefix="/api/helplines", tags=["helplines"])


@router.get("", response_model=List[HelplineResponse])
def list_helplines(
    category: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    national_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    query = db.query(Helpline)
    if category:
        query = query.filter(Helpline.category == category)
    if state:
        query = query.filter((Helpline.state == state) | (Helpline.state.is_(None)))
    if national_only:
        query = query.filter(Helpline.is_national == True)
    return query.order_by(Helpline.priority.asc(), Helpline.name.asc()).all()
