import enum


class AiDraftStatus(enum.Enum):
    """Lifecycle of an AI draft awaiting a human decision in the admin panel.

    - PENDING: waiting for an admin to review (hybrid mode, or a sabri-mode draft
      that fell back after the retry cap).
    - SENT: the admin sent it (optionally after editing) as the reader.
    - DISCARDED: the admin dismissed it without sending.
    """

    PENDING = "PENDING"
    SENT = "SENT"
    DISCARDED = "DISCARDED"
