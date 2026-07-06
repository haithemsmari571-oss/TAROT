"""Task/claim backbone: auto crediting, manual approval, and the guards."""

from datetime import timedelta

import pytest

from app.enums.claim_status import ClaimStatus
from app.enums.task_frequency import TaskFrequency
from app.enums.task_status import TaskStatus
from app.enums.task_trigger_event import TaskTriggerEvent
from app.enums.verification_type import VerificationType
from app.exceptions.tasks import TaskNotClaimableError
from app.models import Task
from app.services import stardust_rewards as sr
from app.services import tasks as task_svc


def _make_task(
    db,
    reward=5,
    verification_type=VerificationType.AUTO,
    frequency=TaskFrequency.UNLIMITED,
    status=TaskStatus.ACTIVE,
    trigger_event=TaskTriggerEvent.DAILY_PULL,
    starts_at=None,
    ends_at=None,
):
    task = Task(
        title="Daily card pull",
        description="Pull today's card",
        icon="🔮",
        reward=reward,
        verification_type=verification_type,
        trigger_event=trigger_event if verification_type == VerificationType.AUTO else None,
        frequency=frequency,
        status=status,
        starts_at=starts_at,
        ends_at=ends_at,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


# ── Auto tasks credit immediately ────────────────────────────────────────────
def test_auto_task_credits_immediately(db, make_user):
    user = make_user()
    task = _make_task(db, reward=5, verification_type=VerificationType.AUTO)

    claim = task_svc.create_claim(db, user.id, task.id)

    assert claim.status == ClaimStatus.APPROVED
    assert claim.reward_amount == 5
    assert sr.get_earned_stardust_balance(db, user.id) == 5


# ── Manual tasks go through the claim queue ──────────────────────────────────
def test_manual_task_pending_then_approve_credits(db, make_user):
    user = make_user()
    admin = make_user()
    task = _make_task(db, reward=3, verification_type=VerificationType.SCREENSHOT)

    claim = task_svc.create_claim(db, user.id, task.id, evidence_path="/x.jpg")
    assert claim.status == ClaimStatus.PENDING
    assert sr.get_earned_stardust_balance(db, user.id) == 0  # not paid yet

    approved = task_svc.approve_claim(db, claim.id, admin_user_id=admin.id)
    assert approved.status == ClaimStatus.APPROVED
    assert approved.reward_amount == 3
    assert sr.get_earned_stardust_balance(db, user.id) == 3


def test_reject_does_not_credit_or_block(db, make_user):
    user = make_user()
    admin = make_user()
    task = _make_task(db, reward=3, verification_type=VerificationType.SCREENSHOT)

    claim = task_svc.create_claim(db, user.id, task.id, evidence_path="/x.jpg")
    task_svc.reject_claim(db, claim.id, admin_user_id=admin.id, reason="Not tagged")

    assert sr.get_earned_stardust_balance(db, user.id) == 0
    # A rejected claim must not block a fresh attempt.
    again = task_svc.create_claim(db, user.id, task.id, evidence_path="/y.jpg")
    assert again.status == ClaimStatus.PENDING


# ── The silent 24-hour double-pay guard ──────────────────────────────────────
def test_same_task_cannot_pay_twice_within_24h(db, make_user):
    user = make_user()
    task = _make_task(db, reward=2, frequency=TaskFrequency.UNLIMITED)
    t0 = sr._utcnow()

    task_svc.create_claim(db, user.id, task.id, now=t0)

    # 1 hour later — blocked by the silent guard even though frequency=UNLIMITED.
    with pytest.raises(TaskNotClaimableError):
        task_svc.create_claim(db, user.id, task.id, now=t0 + timedelta(hours=1))

    # 25 hours later — allowed again.
    claim3 = task_svc.create_claim(db, user.id, task.id, now=t0 + timedelta(hours=25))
    assert claim3.status == ClaimStatus.APPROVED
    assert sr.get_earned_stardust_balance(db, user.id, now=t0 + timedelta(hours=25)) == 4


def test_once_per_account_blocks_forever(db, make_user):
    user = make_user()
    task = _make_task(db, reward=20, frequency=TaskFrequency.ONCE_PER_ACCOUNT)
    t0 = sr._utcnow()

    task_svc.create_claim(db, user.id, task.id, now=t0)

    # Even well past the 24h window, a once-per-account task can't repeat.
    with pytest.raises(TaskNotClaimableError):
        task_svc.create_claim(db, user.id, task.id, now=t0 + timedelta(days=5))


def test_reject_does_not_count_against_once_per_account(db, make_user):
    user = make_user()
    admin = make_user()
    task = _make_task(
        db,
        reward=20,
        verification_type=VerificationType.SCREENSHOT,
        frequency=TaskFrequency.ONCE_PER_ACCOUNT,
    )

    claim = task_svc.create_claim(db, user.id, task.id, evidence_path="/x.jpg")
    task_svc.reject_claim(db, claim.id, admin_user_id=admin.id, reason="blurry")

    # Rejected → still eligible to try once.
    again = task_svc.create_claim(db, user.id, task.id, evidence_path="/y.jpg")
    assert again.status == ClaimStatus.PENDING


# ── Reward is always read from the task record, server-side ──────────────────
def test_reward_read_from_task_at_credit_time(db, make_user):
    user = make_user()
    task = _make_task(db, reward=5, frequency=TaskFrequency.UNLIMITED)
    t0 = sr._utcnow()

    c1 = task_svc.create_claim(db, user.id, task.id, now=t0)
    assert c1.reward_amount == 5

    # Admin re-prices the task; the next credit must use the NEW value.
    task.reward = 8
    db.commit()

    c2 = task_svc.create_claim(db, user.id, task.id, now=t0 + timedelta(hours=25))
    assert c2.reward_amount == 8
    assert sr.get_earned_stardust_balance(db, user.id, now=t0 + timedelta(hours=25)) == 13


# ── Inactive / out-of-schedule tasks ─────────────────────────────────────────
def test_inactive_task_not_claimable(db, make_user):
    user = make_user()
    task = _make_task(db, status=TaskStatus.INACTIVE)
    with pytest.raises(TaskNotClaimableError):
        task_svc.create_claim(db, user.id, task.id)


def test_task_outside_schedule_not_claimable(db, make_user):
    user = make_user()
    now = sr._utcnow()
    task = _make_task(db, starts_at=now + timedelta(days=1))  # starts tomorrow
    with pytest.raises(TaskNotClaimableError):
        task_svc.create_claim(db, user.id, task.id, now=now)
