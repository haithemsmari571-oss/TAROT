from fastapi import APIRouter, Depends
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
):
    stats = get_admin_dashboard_stats(db)
    return JSONResponse(content=jsonable_encoder(stats))
