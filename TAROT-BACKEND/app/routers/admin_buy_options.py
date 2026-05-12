from typing import List

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission
from app.schemas.buy_option import (
    BuyOptionCreate,
    BuyOptionResponse,
    BuyOptionUpdate,
)
from app.services.buy_options import (
    create_buy_option,
    delete_buy_option,
    get_buy_option,
    get_buy_options,
    update_buy_option,
)

router = APIRouter(
    dependencies=[Depends(require_permission(Permission.MANAGE_BUY_OPTIONS))]
)


@router.get("/buy-options", response_model=List[BuyOptionResponse])
def admin_list_buy_options(db: Session = Depends(get_db)):
    options = get_buy_options(db)
    return JSONResponse(content=jsonable_encoder(options))


@router.get("/buy-options/{option_id}", response_model=BuyOptionResponse)
def admin_get_buy_option(option_id: int, db: Session = Depends(get_db)):
    option = get_buy_option(db, option_id)
    return JSONResponse(content=jsonable_encoder(option))


@router.post("/buy-options", response_model=BuyOptionResponse)
def admin_create_buy_option(data: BuyOptionCreate, db: Session = Depends(get_db)):
    option = create_buy_option(db, data)
    return JSONResponse(content=jsonable_encoder(option))


@router.put("/buy-options/{option_id}", response_model=BuyOptionResponse)
def admin_update_buy_option(
    option_id: int, data: BuyOptionUpdate, db: Session = Depends(get_db)
):
    option = update_buy_option(db, option_id, data)
    return JSONResponse(content=jsonable_encoder(option))


@router.delete("/buy-options/{option_id}")
def admin_delete_buy_option(option_id: int, db: Session = Depends(get_db)):
    delete_buy_option(db, option_id)
    return JSONResponse(content={"message": "Buy option deleted successfully"})
