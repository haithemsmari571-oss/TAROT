from typing import Optional

from pydantic import BaseModel


class OnboardingDraftRead(BaseModel):
    id: int
    batch_id: str
    row_index: int
    status: str
    error_reason: Optional[str] = None
    display_name: Optional[str] = None
    price_per_minute: Optional[float] = None
    bio: Optional[str] = None
    categories_csv: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    image_filename: Optional[str] = None
    preview_url: Optional[str] = None
    created_user_id: Optional[int] = None


class OnboardingBatchSummary(BaseModel):
    batch_id: str
    total: int
    ready: int
    errors: int
    created: int
    drafts: list[OnboardingDraftRead]


class OnboardingDraftUpdate(BaseModel):
    display_name: Optional[str] = None
    price_per_minute: Optional[float] = None
    bio: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    categories_csv: Optional[str] = None


class OnboardingConfirmResult(BaseModel):
    batch_id: str
    created: int
    skipped: int
    failed: int
    results: list[dict]
