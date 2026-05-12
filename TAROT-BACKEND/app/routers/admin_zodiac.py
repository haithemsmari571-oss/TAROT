from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List

from app.services.zodiac import (
    get_zodiac_sign,
    get_zodiac_signs,
    create_zodiac_sign,
    update_zodiac_sign,
    delete_zodiac_sign,
    get_zodiac_compatibility,
    get_all_zodiac_compatibilities,
    create_zodiac_compatibility,
    update_zodiac_compatibility,
    delete_zodiac_compatibility,
)
from app.services.life_path import (
    get_life_path_number,
    get_all_life_path_numbers,
    create_life_path_number,
    update_life_path_number,
    delete_life_path_number,
    get_life_path_compatibility,
    get_all_life_path_compatibilities,
    create_life_path_compatibility,
    update_life_path_compatibility,
    delete_life_path_compatibility,
)
from app.schemas.zodiac import (
    ZodiacSignCreate,
    ZodiacSignUpdate,
    ZodiacSignResponse,
    ZodiacCompatibilityCreate,
    ZodiacCompatibilityUpdate,
    ZodiacCompatibilityResponse,
)
from app.schemas.life_path import (
    LifePathNumberCreate,
    LifePathNumberUpdate,
    LifePathNumberResponse,
    LifePathCompatibilityCreate,
    LifePathCompatibilityUpdate,
    LifePathCompatibilityResponse,
)
from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission

router = APIRouter(dependencies=[Depends(require_permission(Permission.MANAGE_ZODIAC))])


# Zodiac Signs Admin CRUD


@router.get("/zodiac/signs", response_model=List[ZodiacSignResponse])
def admin_list_zodiac_signs(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
    """Admin: Get all zodiac signs."""
    signs = get_zodiac_signs(db, skip=skip, limit=limit)
    return JSONResponse(content=jsonable_encoder(signs))


@router.get("/zodiac/signs/{sign_id}", response_model=ZodiacSignResponse)
def admin_get_zodiac_sign(sign_id: int, db: Session = Depends(get_db)):
    """Admin: Get a specific zodiac sign."""
    sign = get_zodiac_sign(db, sign_id)
    return JSONResponse(content=jsonable_encoder(sign))


@router.post("/zodiac/signs", response_model=ZodiacSignResponse)
def admin_create_zodiac_sign(sign: ZodiacSignCreate, db: Session = Depends(get_db)):
    """Admin: Create a new zodiac sign."""
    new_sign = create_zodiac_sign(db, sign)
    return JSONResponse(content=jsonable_encoder(new_sign))


@router.put("/zodiac/signs/{sign_id}", response_model=ZodiacSignResponse)
def admin_update_zodiac_sign(
    sign_id: int, sign: ZodiacSignUpdate, db: Session = Depends(get_db)
):
    """Admin: Update a zodiac sign."""
    updated_sign = update_zodiac_sign(db, sign_id, sign)
    return JSONResponse(content=jsonable_encoder(updated_sign))


@router.delete("/zodiac/signs/{sign_id}")
def admin_delete_zodiac_sign(sign_id: int, db: Session = Depends(get_db)):
    """Admin: Delete a zodiac sign."""
    delete_zodiac_sign(db, sign_id)
    return JSONResponse(content={"message": "Zodiac sign deleted successfully"})


# Zodiac Compatibility Admin CRUD


@router.get("/zodiac/compatibility", response_model=List[ZodiacCompatibilityResponse])
def admin_list_zodiac_compatibilities(
    skip: int = 0, limit: int = 500, db: Session = Depends(get_db)
):
    """Admin: Get all zodiac compatibility records."""
    compatibilities = get_all_zodiac_compatibilities(db, skip=skip, limit=limit)
    return JSONResponse(content=jsonable_encoder(compatibilities))


@router.get(
    "/zodiac/compatibility/{compatibility_id}",
    response_model=ZodiacCompatibilityResponse,
)
def admin_get_zodiac_compatibility(
    compatibility_id: int, db: Session = Depends(get_db)
):
    """Admin: Get a specific zodiac compatibility record."""
    compatibility = get_zodiac_compatibility(db, compatibility_id)
    return JSONResponse(content=jsonable_encoder(compatibility))


@router.post("/zodiac/compatibility", response_model=ZodiacCompatibilityResponse)
def admin_create_zodiac_compatibility(
    compatibility: ZodiacCompatibilityCreate, db: Session = Depends(get_db)
):
    """Admin: Create a new zodiac compatibility record."""
    new_compatibility = create_zodiac_compatibility(db, compatibility)
    return JSONResponse(content=jsonable_encoder(new_compatibility))


@router.put(
    "/zodiac/compatibility/{compatibility_id}",
    response_model=ZodiacCompatibilityResponse,
)
def admin_update_zodiac_compatibility(
    compatibility_id: int,
    compatibility: ZodiacCompatibilityUpdate,
    db: Session = Depends(get_db),
):
    """Admin: Update a zodiac compatibility record."""
    updated_compatibility = update_zodiac_compatibility(
        db, compatibility_id, compatibility
    )
    return JSONResponse(content=jsonable_encoder(updated_compatibility))


@router.delete("/zodiac/compatibility/{compatibility_id}")
def admin_delete_zodiac_compatibility(
    compatibility_id: int, db: Session = Depends(get_db)
):
    """Admin: Delete a zodiac compatibility record."""
    delete_zodiac_compatibility(db, compatibility_id)
    return JSONResponse(
        content={"message": "Zodiac compatibility deleted successfully"}
    )


# Life Path Numbers Admin CRUD


@router.get("/life-paths", response_model=List[LifePathNumberResponse])
def admin_list_life_paths(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
    """Admin: Get all life path numbers."""
    life_paths = get_all_life_path_numbers(db, skip=skip, limit=limit)
    return JSONResponse(content=jsonable_encoder(life_paths))


@router.get("/life-paths/{life_path_id}", response_model=LifePathNumberResponse)
def admin_get_life_path(life_path_id: int, db: Session = Depends(get_db)):
    """Admin: Get a specific life path number."""
    life_path = get_life_path_number(db, life_path_id)
    return JSONResponse(content=jsonable_encoder(life_path))


@router.post("/life-paths", response_model=LifePathNumberResponse)
def admin_create_life_path(
    life_path: LifePathNumberCreate, db: Session = Depends(get_db)
):
    """Admin: Create a new life path number."""
    new_life_path = create_life_path_number(db, life_path)
    return JSONResponse(content=jsonable_encoder(new_life_path))


@router.put("/life-paths/{life_path_id}", response_model=LifePathNumberResponse)
def admin_update_life_path(
    life_path_id: int, life_path: LifePathNumberUpdate, db: Session = Depends(get_db)
):
    """Admin: Update a life path number."""
    updated_life_path = update_life_path_number(db, life_path_id, life_path)
    return JSONResponse(content=jsonable_encoder(updated_life_path))


@router.delete("/life-paths/{life_path_id}")
def admin_delete_life_path(life_path_id: int, db: Session = Depends(get_db)):
    """Admin: Delete a life path number."""
    delete_life_path_number(db, life_path_id)
    return JSONResponse(content={"message": "Life path number deleted successfully"})


# Life Path Compatibility Admin CRUD


@router.get(
    "/life-path-compatibility", response_model=List[LifePathCompatibilityResponse]
)
def admin_list_life_path_compatibilities(
    skip: int = 0, limit: int = 500, db: Session = Depends(get_db)
):
    """Admin: Get all life path compatibility records."""
    compatibilities = get_all_life_path_compatibilities(db, skip=skip, limit=limit)
    return JSONResponse(content=jsonable_encoder(compatibilities))


@router.get(
    "/life-path-compatibility/{compatibility_id}",
    response_model=LifePathCompatibilityResponse,
)
def admin_get_life_path_compatibility(
    compatibility_id: int, db: Session = Depends(get_db)
):
    """Admin: Get a specific life path compatibility record."""
    compatibility = get_life_path_compatibility(db, compatibility_id)
    return JSONResponse(content=jsonable_encoder(compatibility))


@router.post("/life-path-compatibility", response_model=LifePathCompatibilityResponse)
def admin_create_life_path_compatibility(
    compatibility: LifePathCompatibilityCreate, db: Session = Depends(get_db)
):
    """Admin: Create a new life path compatibility record."""
    new_compatibility = create_life_path_compatibility(db, compatibility)
    return JSONResponse(content=jsonable_encoder(new_compatibility))


@router.put(
    "/life-path-compatibility/{compatibility_id}",
    response_model=LifePathCompatibilityResponse,
)
def admin_update_life_path_compatibility(
    compatibility_id: int,
    compatibility: LifePathCompatibilityUpdate,
    db: Session = Depends(get_db),
):
    """Admin: Update a life path compatibility record."""
    updated_compatibility = update_life_path_compatibility(
        db, compatibility_id, compatibility
    )
    return JSONResponse(content=jsonable_encoder(updated_compatibility))


@router.delete("/life-path-compatibility/{compatibility_id}")
def admin_delete_life_path_compatibility(
    compatibility_id: int, db: Session = Depends(get_db)
):
    """Admin: Delete a life path compatibility record."""
    delete_life_path_compatibility(db, compatibility_id)
    return JSONResponse(
        content={"message": "Life path compatibility deleted successfully"}
    )
