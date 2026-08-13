"""Bulk psychic onboarding (create-first-then-review, no AI).

Superadmin/admin uploads a manifest + images, reviews the staged rows, then
confirms to create real (offline) PSYCHIC accounts.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission
from app.models.psychic_onboarding_draft import PsychicOnboardingDraft
from app.models.user import User
from app.schemas.onboarding import (
    OnboardingBatchSummary,
    OnboardingConfirmResult,
    OnboardingDraftRead,
    OnboardingDraftUpdate,
)
from app.services import psychic_onboarding as svc

router = APIRouter()
settings = get_app_settings()


def _to_read(draft: PsychicOnboardingDraft) -> OnboardingDraftRead:
    preview = (
        f"{settings.APP_BASE_URL}/{draft.profile_picture_path}"
        if draft.profile_picture_path
        else None
    )
    return OnboardingDraftRead(
        id=draft.id,
        batch_id=draft.batch_id,
        row_index=draft.row_index,
        status=draft.status,
        error_reason=draft.error_reason,
        display_name=draft.display_name,
        price_per_minute=float(draft.price_per_minute) if draft.price_per_minute is not None else None,
        bio=draft.bio,
        categories_csv=draft.categories_csv,
        username=draft.username,
        email=draft.email,
        image_filename=draft.image_filename,
        preview_url=preview,
        created_user_id=draft.created_user_id,
    )


def _summary(db: Session, batch_id: str) -> OnboardingBatchSummary:
    drafts = svc.list_batch(db, batch_id)
    return OnboardingBatchSummary(
        batch_id=batch_id,
        total=len(drafts),
        ready=sum(1 for d in drafts if d.status == "pending"),
        errors=sum(1 for d in drafts if d.status == "error"),
        created=sum(1 for d in drafts if d.status == "created"),
        drafts=[_to_read(d) for d in drafts],
    )


@router.post("/onboarding/psychics/stage", response_model=OnboardingBatchSummary)
async def stage_onboarding_batch(
    manifest: UploadFile = File(..., description="CSV manifest mapping image/name/rate/bio"),
    images: List[UploadFile] = File(..., description="The psychic image files"),
    bio_files: Optional[List[UploadFile]] = File(None, description="Optional .txt bios referenced by bio_filename"),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission(Permission.MANAGE_PSYCHICS)),
):
    manifest_bytes = await manifest.read()
    try:
        manifest_text = manifest_bytes.decode("utf-8-sig")  # tolerate a spreadsheet BOM
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Manifest must be a UTF-8 CSV file.")

    image_data: dict[str, bytes] = {}
    for f in images:
        if f.filename:
            image_data[f.filename] = await f.read()

    bio_map: dict[str, str] = {}
    for f in bio_files or []:
        if f.filename:
            bio_map[f.filename] = (await f.read()).decode("utf-8-sig", errors="replace")

    batch_id = svc.stage_batch(db, manifest_text, image_data, bio_map)
    return _summary(db, batch_id)


@router.get("/onboarding/psychics/batches/{batch_id}", response_model=OnboardingBatchSummary)
def get_onboarding_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission(Permission.MANAGE_PSYCHICS)),
):
    summary = _summary(db, batch_id)
    if summary.total == 0:
        raise HTTPException(status_code=404, detail="Batch not found.")
    return summary


@router.patch("/onboarding/psychics/drafts/{draft_id}", response_model=OnboardingDraftRead)
def edit_onboarding_draft(
    draft_id: int,
    payload: OnboardingDraftUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission(Permission.MANAGE_PSYCHICS)),
):
    try:
        draft = svc.update_draft(db, draft_id, payload.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_read(draft)


@router.post("/onboarding/psychics/batches/{batch_id}/confirm", response_model=OnboardingConfirmResult)
def confirm_onboarding_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission(Permission.MANAGE_PSYCHICS)),
):
    if not svc.list_batch(db, batch_id):
        raise HTTPException(status_code=404, detail="Batch not found.")
    return OnboardingConfirmResult(**svc.confirm_batch(db, batch_id))
