from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_admin
from app.models.user import User
from app.services.dashboard import get_admin_dashboard_stats

router = APIRouter()


@router.get("/dashboard/stats")
def admin_dashboard_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    psychics_page: int = Query(1, ge=1),
    psychics_per_page: int = Query(5, ge=1, le=50),
    transactions_page: int = Query(1, ge=1),
    transactions_per_page: int = Query(10, ge=1, le=50),
):
    stats = get_admin_dashboard_stats(
        db,
        psychics_page=psychics_page,
        psychics_per_page=psychics_per_page,
        transactions_page=transactions_page,
        transactions_per_page=transactions_per_page,
    )
    return JSONResponse(content=jsonable_encoder(stats))
