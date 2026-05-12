from pydantic import BaseModel


class LandingContentRead(BaseModel):
    id: int
    section: str
    content: dict

    class Config:
        from_attributes = True


class LandingContentUpdate(BaseModel):
    content: dict


class LandingContentListResponse(BaseModel):
    sections: list[LandingContentRead]
