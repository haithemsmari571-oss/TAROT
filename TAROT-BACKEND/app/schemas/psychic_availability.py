from datetime import time

from pydantic import BaseModel


class PsychicAvailiabilityBase(BaseModel):
    day_of_the_week: str
    start_at: time
    end_at: time


class PsychicAvailiabilityCreate(PsychicAvailiabilityBase):
    pass


class PsychicAvailiabilityRead(PsychicAvailiabilityBase):
    id: int


class PsychicAvailiabilityUpdate(BaseModel):
    start_at: time | None = None
    end_at: time | None = None
