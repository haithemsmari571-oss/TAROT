import enum


class TaskStatus(enum.Enum):
    """Whether a task is live in the pool. Combined with the optional
    starts_at/ends_at schedule to support limited-time challenges (Section 5)."""

    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
