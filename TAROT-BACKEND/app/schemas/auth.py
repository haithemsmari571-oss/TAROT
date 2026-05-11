from pydantic import BaseModel, EmailStr


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
