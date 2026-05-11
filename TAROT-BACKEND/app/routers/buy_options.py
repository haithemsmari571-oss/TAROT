from typing import List

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.models.user import User
from app.schemas.buy_option import BuyOptionResponse
from app.services.buy_options import get_buy_options

router = APIRouter()


@router.get("", response_model=List[BuyOptionResponse])
def list_buy_options(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    options = get_buy_options(db, only_active=True)
    return JSONResponse(content=jsonable_encoder(options))
