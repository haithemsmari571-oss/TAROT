from typing import Optional

from pydantic import BaseModel, Field


class ClientNoteCreate(BaseModel):
    """Body for saving a dossier note about a client."""

    note: str = Field(min_length=1, max_length=5000)
    chat_id: Optional[int] = None
