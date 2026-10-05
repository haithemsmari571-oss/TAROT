"""The owner's phone routes for readers (ROUND54), mounted at /api/admin.

Owner-only: every route depends on require_permission(Permission.MANAGE_SETTINGS),
which only SUPERADMIN holds (app/enums/role.py), the guard of ROUND52's owner
routes (routers/owner_messaging.py). Errors are {"detail": "<CODE>"}.

- GET /readers: every reader, hidden ones too, with her whole profile, what a
  new reader's form starts at, and the form's limits.
- POST /readers: a new reader. Multipart: `reader` (OwnerReaderCreate as JSON
  text) and `photo` (JPEG, PNG or WebP). She is sent the site's set-your-password
  email; no password is ever sent to or shown on the phone.
- PATCH /readers/{id}: a change. Multipart: `reader` (OwnerReaderUpdate as JSON
  text, only the fields that change) and/or `photo`. Hide and show are
  {"is_listed": false} and {"is_listed": true}, the flag the site's roster reads.
"""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission
from app.schemas.owner_readers import (
    OwnerReaderCreate,
    OwnerReaderCreated,
    OwnerReaderDefaults,
    OwnerReaderLimits,
    OwnerReaderList,
    OwnerReaderRead,
    OwnerReaderUpdate,
)
from app.services import owner_readers
from app.services.medias import MAX_PICTURE_BYTES, PICTURE_FORMAT_EXTENSIONS, picture_format

router = APIRouter(dependencies=[Depends(require_permission(Permission.MANAGE_SETTINGS))])

READER_NOT_FOUND = "READER_NOT_FOUND"
NAME_TAKEN = "NAME_TAKEN"
EMAIL_TAKEN = "EMAIL_TAKEN"
UNKNOWN_CATEGORY = "UNKNOWN_CATEGORY"
PHOTO_TOO_LARGE = "PHOTO_TOO_LARGE"
PHOTO_NOT_ACCEPTED = "PHOTO_NOT_ACCEPTED"

# A reader's photo: JPEG, PNG or WebP, as the profile picture route reads them.
READER_PHOTO_FORMATS = ("JPEG", "PNG", "WEBP")


def _parsed(model: type[BaseModel], text: str) -> BaseModel:
    try:
        return model.model_validate_json(text)
    except ValidationError as error:
        raise RequestValidationError(error.errors(include_url=False, include_context=False))


async def _checked_photo(photo: UploadFile) -> UploadFile:
    """The photo, after the profile picture route's checks: its size, and what
    Pillow reads its bytes as. It is stored under a name of ours with the
    extension of what it really is, never the phone's file name."""
    content = await photo.read()
    if len(content) > MAX_PICTURE_BYTES:
        raise HTTPException(status_code=413, detail=PHOTO_TOO_LARGE)
    detected = picture_format(content)
    if detected not in READER_PHOTO_FORMATS:
        raise HTTPException(status_code=415, detail=PHOTO_NOT_ACCEPTED)
    await photo.seek(0)
    photo.filename = f"reader{PICTURE_FORMAT_EXTENSIONS[detected]}"
    return photo


_REFUSALS = {
    owner_readers.ReaderNotFound: (404, READER_NOT_FOUND),
    owner_readers.NameTaken: (409, NAME_TAKEN),
    owner_readers.EmailTaken: (409, EMAIL_TAKEN),
    owner_readers.UnknownCategory: (422, UNKNOWN_CATEGORY),
}


def _refused(error: Exception) -> HTTPException:
    status_code, detail = _REFUSALS[type(error)]
    return HTTPException(status_code=status_code, detail=detail)


@router.get("/readers", response_model=OwnerReaderList)
def list_owner_readers(db: Session = Depends(get_db)):
    readers = owner_readers.list_readers(db)
    return OwnerReaderList(
        items=[owner_readers.reader_out(reader) for reader in readers],
        defaults=OwnerReaderDefaults(),
        limits=OwnerReaderLimits(),
    )


@router.post("/readers", status_code=201, response_model=OwnerReaderCreated)
async def create_owner_reader(
    reader: str = Form(...),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    data = _parsed(OwnerReaderCreate, reader)
    checked = await _checked_photo(photo)
    try:
        created, email_sent = await owner_readers.create_reader(db, data, checked)
    except tuple(_REFUSALS) as error:
        raise _refused(error)
    return OwnerReaderCreated(
        **owner_readers.reader_out(created).model_dump(),
        password_email_sent=email_sent,
    )


@router.patch("/readers/{reader_id}", response_model=OwnerReaderRead)
async def update_owner_reader(
    reader_id: int,
    reader: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    data = _parsed(OwnerReaderUpdate, reader) if reader is not None else None
    checked = await _checked_photo(photo) if photo is not None else None
    try:
        updated = owner_readers.update_reader(db, reader_id, data, checked)
    except tuple(_REFUSALS) as error:
        raise _refused(error)
    return owner_readers.reader_out(updated)
