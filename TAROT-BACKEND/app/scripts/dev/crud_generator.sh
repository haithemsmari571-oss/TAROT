#!/bin/bash

model_name=$1
model_name_snake=$(echo "$model_name" | sed -r 's/([A-Z])/_\L\1/g' | sed 's/^_//')
model_name_lowercase="$model_name_snake"

pl_model_name=''

echo "Generating CRUD for model: $model_name"

model_name_to_pl() {
  local name=$1

  # Handle words ending with consonant + y -> ies
  if [[ $name =~ [^aeiou]y$ ]]; then
    pl_model_name="${name::-1}ies"
  else
    pl_model_name="${name}s"
  fi
}

model_name_to_pl "$model_name_snake"

generate_model_file() {
  cat <<EOF >>app/models/$model_name_lowercase.py
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class $model_name(Base):
    __tablename__ = "$pl_model_name"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
EOF
}

generate_model_file

generate_schema() {
  cat <<EOF >>app/schemas/$model_name_lowercase.py
from pydantic import BaseModel


class ${model_name}Base(BaseModel):
    pass


class ${model_name}Read(${model_name}Base):
    pass

    class Config:
        from_attributes = True


class ${model_name}Create(${model_name}Read):
    pass


class ${model_name}Update(BaseModel):
    pass
EOF
}

generate_schema

generate_exceptions() {
  cat <<EOF >>app/exceptions/$pl_model_name.py
from app.exceptions.domain import DomainError

class ${model_name}NotFoundError(DomainError):
    status_code = 404
    message = "${model_name} not found"

class ${model_name}AlreadyExistsError(DomainError):
    status_code = 400
    message = "${model_name} already exists"
EOF
}

generate_exceptions

generate_service() {
  cat <<EOF >>app/services/${pl_model_name}.py
from typing import List
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.exceptions.${pl_model_name} import ${model_name}AlreadyExistsError, ${model_name}NotFoundError
from app.models.${model_name_lowercase} import ${model_name}
from app.schemas.${model_name_lowercase} import ${model_name}Create, ${model_name}Update

def get_${model_name_lowercase}(db: Session, ${model_name_lowercase}_id: int) -> ${model_name}:
    ${model_name_lowercase} = db.get(${model_name}, ${model_name_lowercase}_id)
    if ${model_name_lowercase} is None:
        raise ${model_name}NotFoundError(f"${model_name} with id {${model_name_lowercase}_id} not found")
    return ${model_name_lowercase}

def get_${pl_model_name}(db: Session, skip: int = 0, limit: int = 100) -> List[${model_name}]:
    stmt = select(${model_name}).offset(skip).limit(limit)
    return list(db.scalars(stmt))

def create_${model_name_lowercase}(db: Session, ${model_name_lowercase}_data: ${model_name}Create) -> ${model_name}:
    ${model_name_lowercase} = ${model_name}(**${model_name_lowercase}_data.model_dump())
    db.add(${model_name_lowercase})
    try:
        db.commit()
        db.refresh(${model_name_lowercase})
    except IntegrityError:
        db.rollback()
        raise ${model_name}AlreadyExistsError("${model_name} already exists with unique fields")
    return ${model_name_lowercase}

def update_${model_name_lowercase}(db: Session, ${model_name_lowercase}_id: int, ${model_name_lowercase}_data: ${model_name}Update) -> ${model_name}:
    ${model_name_lowercase} = get_${model_name_lowercase}(db, ${model_name_lowercase}_id)
    for field, value in ${model_name_lowercase}_data.model_dump(exclude_unset=True).items():
        setattr(${model_name_lowercase}, field, value)
    db.commit()
    db.refresh(${model_name_lowercase})
    return ${model_name_lowercase}

def delete_${model_name_lowercase}(db: Session, ${model_name_lowercase}_id: int) -> None:
    ${model_name_lowercase} = get_${model_name_lowercase}(db, ${model_name_lowercase}_id)
    db.delete(${model_name_lowercase})
    db.commit()
EOF
}

generate_service

generate_router() {
  cat <<EOF >>app/routers/${pl_model_name}.py
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List

from app.services.${pl_model_name} import (
    get_${model_name_lowercase},
    get_${pl_model_name},
    create_${model_name_lowercase},
    update_${model_name_lowercase},
    delete_${model_name_lowercase},
)
from app.schemas.${model_name_lowercase} import ${model_name}Create, ${model_name}Read, ${model_name}Update
from app.database.client import get_db

router = APIRouter()

@router.get("/", response_model=List[${model_name}Read])
def list_${pl_model_name}(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    data = get_${pl_model_name}(db, skip=skip, limit=limit)
    return JSONResponse(content=jsonable_encoder(data))

@router.get("/{${model_name_lowercase}_id}", response_model=${model_name}Read)
def get_${model_name_lowercase}_detail(${model_name_lowercase}_id: int, db: Session = Depends(get_db)):
    ${model_name_lowercase} = get_${model_name_lowercase}(db, ${model_name_lowercase}_id)
    return JSONResponse(content=jsonable_encoder(${model_name_lowercase}))

@router.post("/", response_model=${model_name}Read)
def create_${model_name_lowercase}_endpoint(${model_name_lowercase}: ${model_name}Create, db: Session = Depends(get_db)):
    new_${model_name_lowercase} = create_${model_name_lowercase}(db, ${model_name_lowercase})
    return JSONResponse(content=jsonable_encoder(new_${model_name_lowercase}))

@router.put("/{${model_name_lowercase}_id}", response_model=${model_name}Read)
def update_${model_name_lowercase}_endpoint(${model_name_lowercase}_id: int, ${model_name_lowercase}: ${model_name}Update, db: Session = Depends(get_db)):
    updated_${model_name_lowercase} = update_${model_name_lowercase}(db, ${model_name_lowercase}_id, ${model_name_lowercase})
    return JSONResponse(content=jsonable_encoder(updated_${model_name_lowercase}))

@router.delete("/{${model_name_lowercase}_id}")
def delete_${model_name_lowercase}_endpoint(${model_name_lowercase}_id: int, db: Session = Depends(get_db)):
    delete_${model_name_lowercase}(db, ${model_name_lowercase}_id)
    return JSONResponse(content={"message": "${model_name} deleted successfully"})
EOF
}
generate_router
