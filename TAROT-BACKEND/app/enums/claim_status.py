import enum


class ClaimStatus(enum.Enum):
    """Lifecycle of a task completion (Section 6, "The Claim System").

    PENDING  — manual task awaiting admin review ("confirming ✨").
    APPROVED — credited; Stardust has been awarded from the task's reward.
    REJECTED — declined; does NOT count against frequency caps.
    """

    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
