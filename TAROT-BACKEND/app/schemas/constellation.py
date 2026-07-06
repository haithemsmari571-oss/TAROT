from datetime import date

from pydantic import BaseModel


class BirthdateRequest(BaseModel):
    """Quiet fallback for the rare legacy account with no DOB — DOB is a
    mandatory signup field for everyone else."""

    date_of_birth: date
