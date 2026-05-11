class DomainError(Exception):
    status_code: int = 500
    message: str = "An error occurred, please try again later"

    def __init__(
        self,
        message: str | None = None,
        status_code: int | None = None,
    ):
        if message is not None:
            self.message = message
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)
