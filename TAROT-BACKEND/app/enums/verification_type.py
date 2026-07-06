import enum


class VerificationType(enum.Enum):
    """How a task's completion is proven before Stardust is credited.

    AUTO       — a detectable in-app/system event (Section 5, "Tier 1/2"). The
                 claim is created and approved in the same server action.
    SCREENSHOT — the user uploads image evidence; Logan approves by eye.
    HANDLE     — the user submits a social handle/link; Logan approves by eye.

    SCREENSHOT and HANDLE both create a PENDING claim for the admin queue.
    """

    AUTO = "AUTO"
    SCREENSHOT = "SCREENSHOT"
    HANDLE = "HANDLE"
