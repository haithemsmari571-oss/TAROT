from datetime import date

from pydantic import BaseModel, EmailStr, field_validator

from app.enums.gender import Gender


class AuthBase(BaseModel):
    username: str
    email: EmailStr


class UserRead(AuthBase):
    id: int
    is_verified: bool

    class Config:
        from_attributes = True


class ResetPasswordReq(BaseModel):
    reset_token: str
    new_password: str


class UserSignup(AuthBase):
    password: str
    date_of_birth: date
    # Mandatory, in the same breath as the date of birth. No default: leaving it out is a
    # 422, so an account cannot be created without an answer. "Prefer not to say" is one of
    # the answers she can give, and it is recorded as NOT_STATED rather than as a blank.
    gender: Gender

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v: Gender) -> Gender:
        if v is None:
            raise ValueError("Please choose an option")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: date) -> date:
        today = date.today()
        if v > today:
            raise ValueError("Date of birth cannot be in the future")
        # Sane upper bound on age (no hard minimum-age gate).
        if v.year < today.year - 120:
            raise ValueError("Please enter a valid date of birth")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordReq(BaseModel):
    email: EmailStr


class ResendVerifyReq(BaseModel):
    email: EmailStr


class SignupResponse(BaseModel):
    user: UserRead
    email_sent: bool


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ChangePasswordReq(BaseModel):
    current_password: str
    new_password: str
