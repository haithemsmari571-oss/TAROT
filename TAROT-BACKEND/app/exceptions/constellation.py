from app.exceptions.domain import DomainError


class BirthdateRequiredError(DomainError):
    """The daily pull needs a date of birth to pick the client's zodiac content."""

    def __init__(self):
        super().__init__(
            message="Add your date of birth to reveal today's card.",
            status_code=400,
        )


class AlreadyPulledTodayError(DomainError):
    """One pull per day — they've already pulled today."""

    def __init__(self):
        super().__init__(
            message="You've already pulled your card today. Come back tomorrow ✨",
            status_code=409,
        )
