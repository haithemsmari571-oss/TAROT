from typing import Optional

from pydantic import BaseModel, Field


class ClientNoteCreate(BaseModel):
    """Body for saving a dossier note about a client. No length cap on the body —
    long transcripts / write-ups are expected."""

    note: str = Field(min_length=1)
    title: Optional[str] = Field(default=None, max_length=200)
    chat_id: Optional[int] = None


class ClientNoteUpdate(BaseModel):
    """Body for editing an existing dossier note (title and/or body)."""

    note: Optional[str] = Field(default=None, min_length=1)
    title: Optional[str] = Field(default=None, max_length=200)
