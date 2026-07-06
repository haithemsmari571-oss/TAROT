import enum


class TaskFrequency(enum.Enum):
    """How often a single user may be paid for a task (Section 5, "Frequency").

    A silent server-side guard also blocks the same task paying the same user
    twice within 24 hours, on top of whichever frequency is chosen here.
    """

    ONCE_PER_ACCOUNT = "ONCE_PER_ACCOUNT"  # one-time tasks (e.g. first-reading bonus)
    ONCE_PER_DAY = "ONCE_PER_DAY"          # e.g. daily card pull
    ONCE_PER_WINDOW = "ONCE_PER_WINDOW"    # once per 5-hour rotation window
    UNLIMITED = "UNLIMITED"                # unlimited (24h guard still applies)
