"""Schemas for the admin Task Manager and Claims Queue.

Reward logic never runs in the browser: the API accepts task definitions and
approve/reject decisions only. The reward that gets credited is always read
from the stored Task record at approval time (see app.services.tasks).
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.enums.claim_status import ClaimStatus
from app.enums.task_frequency import TaskFrequency
from app.enums.task_status import TaskStatus
from app.enums.task_trigger_event import TaskTriggerEvent
from app.enums.verification_type import VerificationType


# ── Tasks ────────────────────────────────────────────────────────────────────
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    icon: Optional[str] = None
    reward: float = Field(ge=0, description="Stardust awarded (⭐ = £1)")
    verification_type: VerificationType = VerificationType.AUTO
    trigger_event: Optional[TaskTriggerEvent] = None
    frequency: TaskFrequency = TaskFrequency.UNLIMITED
    status: TaskStatus = TaskStatus.ACTIVE
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    rotation_weight: int = Field(default=1, ge=0)


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    reward: Optional[float] = Field(default=None, ge=0)
    verification_type: Optional[VerificationType] = None
    trigger_event: Optional[TaskTriggerEvent] = None
    frequency: Optional[TaskFrequency] = None
    status: Optional[TaskStatus] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    rotation_weight: Optional[int] = Field(default=None, ge=0)


class TaskResponse(TaskBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Claims ───────────────────────────────────────────────────────────────────
class ClaimResponse(BaseModel):
    """Flattened claim for the admin queue — carries the client and task info the
    reviewer needs to decide, plus the evidence to preview."""

    id: int
    user_id: int
    username: Optional[str] = None
    task_id: int
    task_title: Optional[str] = None
    task_reward: Optional[float] = None
    verification_type: Optional[VerificationType] = None
    status: ClaimStatus
    evidence_path: Optional[str] = None
    evidence_paths: List[str] = []
    evidence_handle: Optional[str] = None
    message: Optional[str] = None
    reward_amount: Optional[float] = None
    rejection_reason: Optional[str] = None
    submitted_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None


class ClaimRejectRequest(BaseModel):
    reason: Optional[str] = None


class BulkApproveRequest(BaseModel):
    claim_ids: List[int] = Field(min_length=1)
