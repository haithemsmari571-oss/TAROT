"""Task + claim backbone — the spine the whole reward system plugs into.

Section 5 (task rules) and Section 6 (the claim system). Every task completion
becomes a :class:`Claim`:

  * AUTO tasks (system events) → the claim is created AND approved in one server
    action, and earned Stardust is credited instantly.
  * Manual tasks (SCREENSHOT/HANDLE) → the claim is created PENDING for the admin
    queue; approving it credits the reward.

Two rules are enforced here no matter what admin configures:

  * The reward amount is ALWAYS read from the Task record server-side at credit
    time. The client never sends an amount.
  * The same task cannot pay the same user twice within 24 hours (silent guard),
    on top of the task's own frequency setting.

Only APPROVED claims count against frequency/guards — rejected claims are free
(Section 6). The admin panel and the per-user 4-task rotation are built in later
steps; this module is the reusable primitive underneath them.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.enums.claim_status import ClaimStatus
from app.enums.task_frequency import TaskFrequency
from app.enums.task_status import TaskStatus
from app.enums.verification_type import VerificationType
from app.exceptions.tasks import (
    ClaimAlreadyResolvedError,
    ClaimNotFoundError,
    InvalidTaskConfigError,
    TaskNotClaimableError,
    TaskNotFoundError,
)
from app.enums.notification_type import NotificationType
from app.logging_config import get_logger
from app.models import Claim, Notification, Task, User
from app.services.stardust_rewards import credit_earned_stardust

# Evidence files are deleted this long after a claim is resolved (Section 6.1).
EVIDENCE_RETENTION_DAYS = 60

logger = get_logger(__name__)

# The silent always-on guard from Section 5: the same task can't pay the same
# user twice inside this window, even for UNLIMITED-frequency tasks.
SAME_TASK_COOLDOWN_HOURS = 24
# Default rotation window used by ONCE_PER_WINDOW until the admin Settings screen
# (which will make it configurable) is built.
DEFAULT_ROTATION_WINDOW_HOURS = 5


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Treat a naive datetime as UTC. Postgres returns tz-aware datetimes and is
    left unchanged; SQLite (used in tests) returns naive ones — this keeps the
    Python-side schedule comparison from mixing naive and aware values."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def get_task(db: Session, task_id: int) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise TaskNotFoundError()
    return task


def is_task_live(task: Task, now: Optional[datetime] = None) -> bool:
    """Active status AND within its optional start/end schedule window."""
    now = now or _utcnow()
    if task.status != TaskStatus.ACTIVE:
        return False
    starts_at = _as_aware(task.starts_at)
    ends_at = _as_aware(task.ends_at)
    if starts_at and now < starts_at:
        return False
    if ends_at and now > ends_at:
        return False
    return True


def _last_approved_at(db: Session, user_id: int, task_id: int, since: datetime):
    """Most recent APPROVED claim resolved_at for (user, task) at/after ``since``,
    or None. Only APPROVED claims count — rejected ones are free."""
    return (
        db.query(Claim.resolved_at)
        .filter(
            Claim.user_id == user_id,
            Claim.task_id == task_id,
            Claim.status == ClaimStatus.APPROVED,
            Claim.resolved_at >= since,
        )
        .order_by(Claim.resolved_at.desc())
        .first()
    )


def check_can_be_paid(
    db: Session, user_id: int, task: Task, now: Optional[datetime] = None
) -> Tuple[bool, Optional[str]]:
    """Whether ``user`` may currently be PAID for ``task``.

    Enforces the silent 24h guard plus the task's frequency setting. Returns
    ``(ok, reason)`` so callers can surface why. Rejected claims never block.
    """
    now = now or _utcnow()

    if not is_task_live(task, now):
        return False, "Task is not currently active"

    # Silent once-per-24h guard (always on).
    cooldown_since = now - timedelta(hours=SAME_TASK_COOLDOWN_HOURS)
    if _last_approved_at(db, user_id, task.id, cooldown_since):
        return False, "Already claimed within the last 24 hours"

    # Task frequency on top of the guard.
    freq = task.frequency
    if freq == TaskFrequency.ONCE_PER_ACCOUNT:
        # Any approved claim ever blocks a repeat.
        if _last_approved_at(db, user_id, task.id, datetime.min.replace(tzinfo=timezone.utc)):
            return False, "This task can only be completed once"
    elif freq == TaskFrequency.ONCE_PER_DAY:
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        if _last_approved_at(db, user_id, task.id, start_of_day):
            return False, "Already claimed today"
    elif freq == TaskFrequency.ONCE_PER_WINDOW:
        window_since = now - timedelta(hours=DEFAULT_ROTATION_WINDOW_HOURS)
        if _last_approved_at(db, user_id, task.id, window_since):
            return False, "Already claimed this rotation window"
    # UNLIMITED: only the 24h guard applies.

    return True, None


def _has_open_pending_claim(db: Session, user_id: int, task_id: int) -> bool:
    """A manual claim already awaiting review blocks stacking another."""
    return (
        db.query(Claim.id)
        .filter(
            Claim.user_id == user_id,
            Claim.task_id == task_id,
            Claim.status == ClaimStatus.PENDING,
        )
        .first()
        is not None
    )


def _credit_claim(db: Session, claim: Claim, task: Task, now: datetime) -> Claim:
    """Read the reward from the task record (server-side) and award earned
    Stardust for an approved claim. Idempotent per claim."""
    reward = float(task.reward or 0)
    claim.status = ClaimStatus.APPROVED
    claim.reward_amount = reward
    claim.resolved_at = now

    if reward > 0:
        lot = credit_earned_stardust(
            db=db,
            user_id=claim.user_id,
            amount=reward,
            description=f"Reward: {task.title}",
            source=f"claim:{claim.id}",
            idempotency_key=f"claim:{claim.id}",
            now=now,
        )
        claim.transaction_id = lot.transaction_id

    db.commit()
    db.refresh(claim)
    logger.info(
        "claim_credited",
        claim_id=claim.id,
        task_id=task.id,
        user_id=claim.user_id,
        reward=reward,
    )
    return claim


def create_claim(
    db: Session,
    user_id: int,
    task_id: int,
    evidence_path: Optional[str] = None,
    evidence_handle: Optional[str] = None,
    evidence_paths: Optional[list] = None,
    message: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    now: Optional[datetime] = None,
) -> Claim:
    """Create a claim for a task completion.

    AUTO tasks are approved and credited in the same action; manual tasks are
    left PENDING for the admin queue. Eligibility (24h guard + frequency) is
    checked here so an auto event can't over-pay.

    Raises:
        TaskNotFoundError, TaskNotClaimableError.
    """
    now = now or _utcnow()
    task = get_task(db, task_id)

    ok, reason = check_can_be_paid(db, user_id, task, now=now)
    if not ok:
        raise TaskNotClaimableError(reason)

    is_manual = task.verification_type in (
        VerificationType.SCREENSHOT,
        VerificationType.HANDLE,
    )
    if is_manual and _has_open_pending_claim(db, user_id, task_id):
        raise TaskNotClaimableError("You already have a claim awaiting review")

    # First image is mirrored into evidence_path for the single-thumbnail view
    # and cleanup; the full set lives in evidence_paths.
    paths = [p for p in (evidence_paths or []) if p]
    first_path = evidence_path or (paths[0] if paths else None)
    claim = Claim(
        user_id=user_id,
        task_id=task_id,
        status=ClaimStatus.PENDING,
        evidence_path=first_path,
        evidence_paths=paths or None,
        evidence_handle=evidence_handle,
        message=(message.strip()[:300] if message and message.strip() else None),
        idempotency_key=idempotency_key,
    )
    db.add(claim)
    db.commit()
    db.refresh(claim)

    if task.verification_type == VerificationType.AUTO:
        # Auto event → approve + credit in the same server action.
        return _credit_claim(db, claim, task, now)

    logger.info(
        "claim_pending_created",
        claim_id=claim.id,
        task_id=task_id,
        user_id=user_id,
        verification_type=task.verification_type.value,
    )
    return claim


def approve_claim(
    db: Session, claim_id: int, admin_user_id: int, now: Optional[datetime] = None
) -> Claim:
    """Admin approves a PENDING manual claim. Reward is read from the task record
    at this moment and credited as earned Stardust.

    Raises:
        ClaimNotFoundError, ClaimAlreadyResolvedError, TaskNotClaimableError.
    """
    now = now or _utcnow()
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise ClaimNotFoundError()
    if claim.status != ClaimStatus.PENDING:
        raise ClaimAlreadyResolvedError()

    task = get_task(db, claim.task_id)

    # Re-check the guard at approval time (a lot can happen between submit and
    # review). Rejected claims don't block, so this only trips on real repeats.
    ok, reason = check_can_be_paid(db, claim.user_id, task, now=now)
    if not ok:
        raise TaskNotClaimableError(reason)

    claim.approved_by = admin_user_id
    credited = _credit_claim(db, claim, task, now)
    _notify_claim_resolved(db, credited, task, approved=True)
    return credited


def reject_claim(
    db: Session,
    claim_id: int,
    admin_user_id: int,
    reason: Optional[str] = None,
    now: Optional[datetime] = None,
) -> Claim:
    """Admin rejects a PENDING claim. No Stardust credited; a rejected claim does
    NOT count against frequency caps (Section 6)."""
    now = now or _utcnow()
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise ClaimNotFoundError()
    if claim.status != ClaimStatus.PENDING:
        raise ClaimAlreadyResolvedError()

    claim.status = ClaimStatus.REJECTED
    claim.rejection_reason = reason
    claim.approved_by = admin_user_id
    claim.resolved_at = now
    db.commit()
    db.refresh(claim)
    _notify_claim_resolved(db, claim, get_task(db, claim.task_id), approved=False)
    logger.info(
        "claim_rejected",
        claim_id=claim.id,
        task_id=claim.task_id,
        user_id=claim.user_id,
        admin_user_id=admin_user_id,
    )
    return claim


def _notify_claim_resolved(db: Session, claim: Claim, task: Task, approved: bool) -> None:
    """Drop a gentle in-app notification for the client when their claim is
    approved (Stardust credited) or rejected. Never blocks the resolution."""
    try:
        if approved:
            reward = claim.reward_amount or 0
            notif = Notification(
                user_id=claim.user_id,
                type=NotificationType.CLAIM_APPROVED,
                title="Your offering was confirmed ✨",
                message=f"You earned {int(reward)} Stardust for “{task.title}”.",
                data={"claim_id": claim.id, "task_id": task.id, "reward": float(reward)},
            )
        else:
            gentle = claim.rejection_reason or "This one wasn't confirmed — no worries, another ritual awaits."
            notif = Notification(
                user_id=claim.user_id,
                type=NotificationType.CLAIM_REJECTED,
                title="About your recent ritual",
                message=gentle,
                data={"claim_id": claim.id, "task_id": task.id},
            )
        db.add(notif)
        db.commit()
    except Exception as e:  # notifications must never fail the claim action
        db.rollback()
        logger.warning("claim_notification_failed", claim_id=claim.id, error=str(e))


def cleanup_resolved_evidence(db: Session, now: Optional[datetime] = None) -> dict:
    """Delete evidence files ~60 days after a claim is resolved (Section 6.1),
    keeping storage tiny. Clears the stored path so it isn't served again. Safe
    to run repeatedly; intended for the nightly job (and runs on startup)."""
    import os

    from app.config import get_app_settings

    now = now or _utcnow()
    cutoff = now - timedelta(days=EVIDENCE_RETENTION_DAYS)
    media_dir = get_app_settings().MEDIA_DIR

    stale = (
        db.query(Claim)
        .filter(
            Claim.resolved_at.isnot(None),
            Claim.resolved_at < cutoff,
            Claim.evidence_path.isnot(None),
        )
        .all()
    )
    deleted = 0
    for claim in stale:
        # Delete every stored image (evidence_paths + the mirrored first path).
        all_paths = list(claim.evidence_paths or [])
        if claim.evidence_path:
            all_paths.append(claim.evidence_path)
        for p in set(all_paths):
            filename = os.path.basename(p or "")
            if filename:
                try:
                    (media_dir / filename).unlink(missing_ok=True)
                except Exception as e:
                    logger.warning("evidence_delete_failed", claim_id=claim.id, error=str(e))
        claim.evidence_path = None
        claim.evidence_paths = None
        deleted += 1
    if deleted:
        db.commit()
        logger.info("evidence_cleanup_done", claims_cleared=deleted)
    return {"claims_cleared": deleted}


# ══════════════════════════════════════════════════════════════════════════════
# Admin panel: Task Manager (CRUD) + Claims Queue
# ══════════════════════════════════════════════════════════════════════════════
def _validate_task_config(verification_type, trigger_event):
    """An AUTO task must bind to a detectable trigger event (code detects
    completion); a manual task must not carry one. Returns the normalised
    trigger_event to store."""
    if verification_type == VerificationType.AUTO:
        if trigger_event is None:
            raise InvalidTaskConfigError(
                "Automatic tasks need a trigger event the system can detect"
            )
        return trigger_event
    # Manual (screenshot/handle) tasks are verified by eye — no trigger event.
    return None


def list_tasks(db: Session) -> List[Task]:
    """All tasks for the admin Task Manager, newest first."""
    return db.query(Task).order_by(desc(Task.created_at)).all()


def create_task(db: Session, data) -> Task:
    """Create a task from an admin payload (a TaskCreate schema or dict-like)."""
    trigger_event = _validate_task_config(data.verification_type, data.trigger_event)
    task = Task(
        title=data.title,
        description=data.description,
        icon=data.icon,
        reward=data.reward,
        verification_type=data.verification_type,
        trigger_event=trigger_event,
        frequency=data.frequency,
        status=data.status,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        rotation_weight=data.rotation_weight,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    logger.info("task_created", task_id=task.id, title=task.title, reward=task.reward)
    return task


def update_task(db: Session, task_id: int, data) -> Task:
    """Patch a task from a TaskUpdate schema (only set fields are applied)."""
    task = get_task(db, task_id)
    fields = data.model_dump(exclude_unset=True)
    for key, value in fields.items():
        setattr(task, key, value)
    # Re-validate the auto/trigger pairing against the resulting state.
    task.trigger_event = _validate_task_config(
        task.verification_type, task.trigger_event
    )
    db.commit()
    db.refresh(task)
    logger.info("task_updated", task_id=task.id, fields=list(fields.keys()))
    return task


def duplicate_task(db: Session, task_id: int) -> Task:
    """Copy an existing task ("copy yesterday's challenge, tweak the text"). The
    copy is created INACTIVE with a "(copy)" title so admin edits before it goes
    live."""
    original = get_task(db, task_id)
    copy = Task(
        title=f"{original.title} (copy)",
        description=original.description,
        icon=original.icon,
        reward=original.reward,
        verification_type=original.verification_type,
        trigger_event=original.trigger_event,
        frequency=original.frequency,
        status=TaskStatus.INACTIVE,
        starts_at=original.starts_at,
        ends_at=original.ends_at,
        rotation_weight=original.rotation_weight,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    logger.info("task_duplicated", source_task_id=task_id, new_task_id=copy.id)
    return copy


def delete_task(db: Session, task_id: int) -> None:
    task = get_task(db, task_id)
    db.delete(task)
    db.commit()
    logger.info("task_deleted", task_id=task_id)


def list_claims(
    db: Session, status: Optional[ClaimStatus] = ClaimStatus.PENDING
) -> List[dict]:
    """Claims for the admin queue, flattened with the client + task info the
    reviewer needs. Defaults to PENDING (the review queue); pass ``None`` for all.
    """
    query = db.query(Claim, User, Task).join(User, Claim.user_id == User.id).join(
        Task, Claim.task_id == Task.id
    )
    if status is not None:
        query = query.filter(Claim.status == status)
    rows = query.order_by(Claim.created_at.asc()).all()

    return [
        {
            "id": claim.id,
            "user_id": claim.user_id,
            "username": user.username if user else None,
            "task_id": claim.task_id,
            "task_title": task.title if task else None,
            "task_reward": float(task.reward) if task and task.reward is not None else None,
            "verification_type": task.verification_type if task else None,
            "status": claim.status,
            "evidence_path": claim.evidence_path,
            "evidence_paths": claim.evidence_paths or (
                [claim.evidence_path] if claim.evidence_path else []
            ),
            "evidence_handle": claim.evidence_handle,
            "message": claim.message,
            "reward_amount": (
                float(claim.reward_amount) if claim.reward_amount is not None else None
            ),
            "rejection_reason": claim.rejection_reason,
            "submitted_at": claim.created_at,
            "resolved_at": claim.resolved_at,
        }
        for claim, user, task in rows
    ]


def bulk_approve_claims(
    db: Session, claim_ids: List[int], admin_user_id: int, now: Optional[datetime] = None
) -> dict:
    """Approve several pending claims in one action. Each is credited exactly as a
    single approval (reward read from its task, 24h guard re-checked). Claims that
    can't be approved (already resolved, guard tripped) are reported, not fatal."""
    now = now or _utcnow()
    approved: List[int] = []
    skipped: List[dict] = []
    for claim_id in claim_ids:
        try:
            approve_claim(db, claim_id, admin_user_id=admin_user_id, now=now)
            approved.append(claim_id)
        except (
            ClaimNotFoundError,
            ClaimAlreadyResolvedError,
            TaskNotClaimableError,
            TaskNotFoundError,
        ) as e:
            skipped.append({"claim_id": claim_id, "reason": e.message})
    logger.info(
        "claims_bulk_approved",
        approved_count=len(approved),
        skipped_count=len(skipped),
        admin_user_id=admin_user_id,
    )
    return {"approved": approved, "skipped": skipped}
