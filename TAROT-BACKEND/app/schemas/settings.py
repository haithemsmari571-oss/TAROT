from pydantic import BaseModel


class SettingResponse(BaseModel):
    id: int
    key: str
    value: str

    class Config:
        from_attributes = True


class SettingUpdate(BaseModel):
    value: str


class SettingsListResponse(BaseModel):
    settings: list[SettingResponse]


class PublicSettingsResponse(BaseModel):
    privacy_policy: str
    terms_of_service: str
