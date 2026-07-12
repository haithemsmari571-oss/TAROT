from typing import Optional

from pydantic import BaseModel

from app.enums.response_mode import ResponseMode


class ResponseModeUpdate(BaseModel):
    mode: ResponseMode


class DraftSend(BaseModel):
    # Optional edited text; when omitted the stored draft is sent as-is.
    content: Optional[str] = None
