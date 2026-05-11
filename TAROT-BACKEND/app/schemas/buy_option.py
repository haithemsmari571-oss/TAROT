from datetime import datetime

from pydantic import BaseModel, Field


class BuyOptionCreate(BaseModel):
    label: str
    points: int = Field(gt=0)
    is_active: bool = True
    sort_order: int = 0


class BuyOptionUpdate(BaseModel):
    label: str | None = None
    points: int | None = Field(default=None, gt=0)
    is_active: bool | None = None
    sort_order: int | None = None


class BuyOptionResponse(BaseModel):
    id: int
    label: str
    points: int
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
