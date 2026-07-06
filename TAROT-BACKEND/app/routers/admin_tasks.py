"""Admin panel — Task Manager + Claims Queue (Section 7, screens 1 & 2).

Every endpoint is behind MANAGE_TASKS (admin/superadmin). No reward logic runs
in the browser: approvals credit through the step-1 ledger, always reading the
reward from the stored task record.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.dependencies.get_current_user import get_current_user
from app.enums.claim_status import ClaimStatus
from app.enums.permissions import Permission
from app.models.user import User
from app.schemas.task import (
    BulkApproveRequest,
    ClaimRejectRequest,
    ClaimResponse,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)
from app.services import tasks as task_svc

router = APIRouter(dependencies=[Depends(require_permission(Permission.MANAGE_TASKS))])


# ── Task Manager ─────────────────────────────────────────────────────────────
@router.get("/tasks", response_model=List[TaskResponse])
def admin_list_tasks(db: Session = Depends(get_db)):
    """List every task for the Task Manager."""
    return JSONResponse(content=jsonable_encoder(task_svc.list_tasks(db)))


@router.post("/tasks", response_model=TaskResponse)
def admin_create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    """Create a new task."""
    task = task_svc.create_task(db, payload)
    return JSONResponse(content=jsonable_encoder(task))


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def admin_get_task(task_id: int, db: Session = Depends(get_db)):
    return JSONResponse(content=jsonable_encoder(task_svc.get_task(db, task_id)))


@router.put("/tasks/{task_id}", response_model=TaskResponse)
def admin_update_task(
    task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)
):
    task = task_svc.update_task(db, task_id, payload)
    return JSONResponse(content=jsonable_encoder(task))


@router.post("/tasks/{task_id}/duplicate", response_model=TaskResponse)
def admin_duplicate_task(task_id: int, db: Session = Depends(get_db)):
    """Copy a task (created inactive) so admin can tweak and publish quickly."""
    task = task_svc.duplicate_task(db, task_id)
    return JSONResponse(content=jsonable_encoder(task))


@router.delete("/tasks/{task_id}")
def admin_delete_task(task_id: int, db: Session = Depends(get_db)):
    task_svc.delete_task(db, task_id)
    return JSONResponse(content={"message": "Task deleted successfully"})


# ── Claims Queue ─────────────────────────────────────────────────────────────
@router.get("/claims", response_model=List[ClaimResponse])
def admin_list_claims(
    status: Optional[ClaimStatus] = ClaimStatus.PENDING,
    db: Session = Depends(get_db),
):
    """List claims (defaults to the pending review queue)."""
    return JSONResponse(content=jsonable_encoder(task_svc.list_claims(db, status)))


@router.post("/claims/{claim_id}/approve", response_model=ClaimResponse)
def admin_approve_claim(
    claim_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_user),
):
    """Approve a pending claim → credits Stardust from the task record."""
    task_svc.approve_claim(db, claim_id, admin_user_id=admin.id)
    # Return the flattened claim view the queue uses.
    claim = next(
        c for c in task_svc.list_claims(db, status=None) if c["id"] == claim_id
    )
    return JSONResponse(content=jsonable_encoder(claim))


@router.post("/claims/{claim_id}/reject", response_model=ClaimResponse)
def admin_reject_claim(
    claim_id: int,
    payload: ClaimRejectRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_user),
):
    """Reject a pending claim (optional short reason). No Stardust credited."""
    task_svc.reject_claim(
        db, claim_id, admin_user_id=admin.id, reason=payload.reason
    )
    claim = next(
        c for c in task_svc.list_claims(db, status=None) if c["id"] == claim_id
    )
    return JSONResponse(content=jsonable_encoder(claim))


@router.post("/claims/bulk-approve")
def admin_bulk_approve_claims(
    payload: BulkApproveRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_user),
):
    """Approve several pending claims at once (batch review)."""
    result = task_svc.bulk_approve_claims(
        db, payload.claim_ids, admin_user_id=admin.id
    )
    return JSONResponse(content=jsonable_encoder(result))
