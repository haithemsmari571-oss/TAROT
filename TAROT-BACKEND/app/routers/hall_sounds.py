"""Hall sounds: the owner's ambient loops for the entry form and the room.

Admin routes are gated by MANAGE_SETTINGS, the same permission that guards
/api/admin/settings (routers/settings.py), which is where this lives in
Vulcan's SYSTEM section. The public route is what the website calls.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission
from app.models.hall_sound import HallSound
from app.schemas.hall_sound import HallSoundAdmin, HallSoundPublic, HallSoundUpdate
from app.services.hall_sounds import (
    MAX_HALL_SOUND_BYTES,
    HallSoundError,
    delete_hall_sound,
    list_all,
    list_enabled,
    public_url,
    store_hall_sound,
)

public_router = APIRouter()
admin_router = APIRouter(dependencies=[Depends(require_permission(Permission.MANAGE_SETTINGS))])


def _admin_view(sound: HallSound) -> HallSoundAdmin:
    return HallSoundAdmin(
        id=sound.id,
        key=sound.key,
        name=sound.name,
        sort_order=sound.sort_order,
        enabled=sound.enabled,
        file_path=sound.file_path,
        url=public_url(sound),
        content_type=sound.content_type,
        size_bytes=sound.size_bytes,
        sha256=sound.sha256,
        duration_seconds=sound.duration_seconds,
        level=sound.level,
        original_filename=sound.original_filename,
        created_at=sound.created_at,
        updated_at=sound.updated_at,
    )


def _get_or_404(db: Session, sound_id: int) -> HallSound:
    sound = db.query(HallSound).filter(HallSound.id == sound_id).first()
    if sound is None:
        raise HTTPException(404, "No such sound.")
    return sound


# ---------------------------------------------------------------- public ----
@public_router.get("", response_model=list[HallSoundPublic])
def public_list_hall_sounds(db: Session = Depends(get_db)):
    """The enabled loops in the owner's order: key, name, url, level. Silence is
    the site's own and is not listed."""
    return [
        HallSoundPublic(key=s.key, name=s.name, url=public_url(s), level=s.level)
        for s in list_enabled(db)
    ]


# ----------------------------------------------------------------- admin ----
@admin_router.get("", response_model=list[HallSoundAdmin])
def admin_list_hall_sounds(db: Session = Depends(get_db)):
    """Every sound, disabled ones included, in sort order."""
    return [_admin_view(s) for s in list_all(db)]


@admin_router.post("", response_model=HallSoundAdmin, status_code=201)
async def admin_upload_hall_sound(
    file: UploadFile = File(..., description="An MP3 or OGG ambient loop"),
    name: str = Form(..., min_length=1, max_length=80),
    sort_order: int = Form(0),
    enabled: bool = Form(True),
    level: float = Form(1.0, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
):
    # Read one byte past the cap so an oversized upload is refused without
    # buffering the whole thing; the declared content type is never consulted.
    data = await file.read(MAX_HALL_SOUND_BYTES + 1)
    try:
        sound = store_hall_sound(
            db,
            data=data,
            name=name,
            original_filename=file.filename,
            sort_order=sort_order,
            enabled=enabled,
            level=level,
        )
    except HallSoundError as e:
        raise HTTPException(e.status, e.message)
    return _admin_view(sound)


@admin_router.patch("/{sound_id}", response_model=HallSoundAdmin)
def admin_update_hall_sound(
    sound_id: int,
    body: HallSoundUpdate,
    db: Session = Depends(get_db),
):
    sound = _get_or_404(db, sound_id)
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "Nothing to change: send name, sort_order, enabled or level.")
    for field, value in changes.items():
        setattr(sound, field, value.strip() if field == "name" else value)
    db.commit()
    db.refresh(sound)
    return _admin_view(sound)


@admin_router.delete("/{sound_id}", status_code=204)
def admin_delete_hall_sound(sound_id: int, db: Session = Depends(get_db)):
    sound = _get_or_404(db, sound_id)
    delete_hall_sound(db, sound)
    return None
