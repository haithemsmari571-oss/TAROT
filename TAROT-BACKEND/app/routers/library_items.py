"""Public and owner-managed routes for the Sanctuary content library."""

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission
from app.models.library_item import LibraryItem
from app.schemas.library_item import LibraryItemAdmin, LibraryItemPublic, LibraryItemUpdate
from app.services.library_items import (
    MAX_LIBRARY_AUDIO_BYTES,
    MAX_LIBRARY_COVER_BYTES,
    LibraryItemError,
    audio_url,
    cover_url,
    create_library_item,
    delete_library_item,
    get_public_by_key,
    list_all,
    list_public,
    update_library_item,
)


public_router = APIRouter()
admin_router = APIRouter(dependencies=[Depends(require_permission(Permission.MANAGE_SETTINGS))])


def _admin_view(item: LibraryItem) -> LibraryItemAdmin:
    return LibraryItemAdmin(
        id=item.id,
        key=item.key,
        type=item.type,
        title=item.title,
        description=item.description,
        audio_file_path=item.audio_file_path,
        audio_url=audio_url(item),
        audio_content_type=item.audio_content_type,
        audio_size_bytes=item.audio_size_bytes,
        audio_sha256=item.audio_sha256,
        duration_seconds=item.duration_seconds,
        cover_image_path=item.cover_image_path,
        cover_url=cover_url(item),
        cover_content_type=item.cover_content_type,
        cover_size_bytes=item.cover_size_bytes,
        sort_order=item.sort_order,
        enabled=item.enabled,
        published_at=item.published_at,
        original_filename=item.original_filename,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _public_view(item: LibraryItem) -> LibraryItemPublic:
    return LibraryItemPublic(
        key=item.key,
        type=item.type,
        title=item.title,
        description=item.description,
        audio_url=audio_url(item),
        cover_url=cover_url(item),
        duration_seconds=item.duration_seconds,
        published_at=item.published_at,
    )


def _get_or_404(db: Session, item_id: int) -> LibraryItem:
    item = db.query(LibraryItem).filter(LibraryItem.id == item_id).first()
    if item is None:
        raise HTTPException(404, "No such library item.")
    return item


def _raise_library_error(exc: LibraryItemError) -> None:
    raise HTTPException(exc.status, exc.message)


@public_router.get("", response_model=list[LibraryItemPublic])
def public_list_library_items(db: Session = Depends(get_db)):
    return [_public_view(item) for item in list_public(db)]


@public_router.get("/{key}", response_model=LibraryItemPublic)
def public_get_library_item(key: str, db: Session = Depends(get_db)):
    item = get_public_by_key(db, key)
    if item is None:
        raise HTTPException(404, "Library item not found.")
    return _public_view(item)


@admin_router.get("", response_model=list[LibraryItemAdmin])
def admin_list_library_items(db: Session = Depends(get_db)):
    return [_admin_view(item) for item in list_all(db)]


@admin_router.post("", response_model=LibraryItemAdmin, status_code=201)
async def admin_create_library_item(
    audio_file: UploadFile = File(..., description="An MP3 or OGG audio file"),
    type: str = Form(..., min_length=1, max_length=80),
    title: str = Form(..., min_length=1, max_length=100),
    description: str | None = Form(default=None),
    sort_order: int = Form(0),
    enabled: bool = Form(True),
    published_at: datetime | None = Form(default=None),
    db: Session = Depends(get_db),
):
    audio_data = await audio_file.read(MAX_LIBRARY_AUDIO_BYTES + 1)
    try:
        item = create_library_item(
            db,
            audio_data=audio_data,
            audio_original_filename=audio_file.filename,
            type_value=type,
            title=title,
            description=description,
            sort_order=sort_order,
            enabled=enabled,
            published_at=published_at,
        )
    except LibraryItemError as exc:
        _raise_library_error(exc)
    return _admin_view(item)


@admin_router.patch("/{item_id}", response_model=LibraryItemAdmin)
async def admin_update_library_item(
    item_id: int,
    request: Request,
    audio_file: UploadFile | None = File(default=None, description="Optional replacement MP3 or OGG"),
    cover_image: UploadFile | None = File(default=None, description="Optional replacement JPEG, PNG or WebP cover"),
    type: str | None = Form(default=None),
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    sort_order: int | None = Form(default=None),
    enabled: bool | None = Form(default=None),
    published_at: str | None = Form(default=None),
    remove_cover: bool = Form(False),
    db: Session = Depends(get_db),
):
    item = _get_or_404(db, item_id)
    form = await request.form()
    if "key" in form:
        raise HTTPException(400, "The library item key is set at creation and cannot be changed.")
    if cover_image is not None and remove_cover:
        raise HTTPException(400, "Choose a replacement cover or remove the current cover, not both.")

    supplied = {
        "type": type,
        "title": title,
        "description": description,
        "sort_order": sort_order,
        "enabled": enabled,
        "published_at": published_at,
    }
    raw_changes = {field: supplied[field] for field in supplied if field in form}
    for nullable in ("description", "published_at"):
        if raw_changes.get(nullable) == "":
            raw_changes[nullable] = None
    try:
        changes = LibraryItemUpdate.model_validate(raw_changes).model_dump(exclude_unset=True)
    except ValidationError:
        raise HTTPException(422, "Invalid library item fields.")
    if not changes and audio_file is None and cover_image is None and not remove_cover:
        raise HTTPException(400, "Nothing to change.")

    audio_data = (
        await audio_file.read(MAX_LIBRARY_AUDIO_BYTES + 1)
        if audio_file is not None
        else None
    )
    cover_data = (
        await cover_image.read(MAX_LIBRARY_COVER_BYTES + 1)
        if cover_image is not None
        else None
    )
    try:
        item = update_library_item(
            db,
            item,
            changes=changes,
            audio_data=audio_data,
            audio_original_filename=audio_file.filename if audio_file is not None else None,
            cover_data=cover_data,
            cover_declared_content_type=cover_image.content_type if cover_image is not None else None,
            remove_cover=remove_cover,
        )
    except LibraryItemError as exc:
        _raise_library_error(exc)
    return _admin_view(item)


@admin_router.delete("/{item_id}", status_code=204)
def admin_delete_library_item(item_id: int, db: Session = Depends(get_db)):
    item = _get_or_404(db, item_id)
    delete_library_item(db, item)
    return None
