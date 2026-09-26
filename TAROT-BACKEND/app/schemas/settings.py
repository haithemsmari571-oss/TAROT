from pydantic import BaseModel


class SettingResponse(BaseModel):
    id: int
    key: str
    value: str
    # True for secret keys (Stripe/webhook). The `value` is redacted for these,
    # so the UI treats the field as write-only.
    is_secret: bool = False

    class Config:
        from_attributes = True


class SettingUpdate(BaseModel):
    value: str


class SettingsListResponse(BaseModel):
    settings: list[SettingResponse]


class PublicSettingsResponse(BaseModel):
    privacy_policy: str
    terms_of_service: str
    # The welcome credit a new account is given, whole pounds; 0 when the
    # setting is missing or invalid (services/auth.py parse_signup_bonus).
    signup_bonus_gbp: int
    # The hours after which an unanswered message is refunded
    # (offline_replies.refund_after_hours), for the reader profile's promise.
    refund_after_hours: int
