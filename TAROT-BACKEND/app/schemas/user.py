from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.enums.role import Role
from app.enums.user_status import UserStatus


class UserBase(BaseModel):
    username: str
    email: str


class UserRead(UserBase):
    id: int
    is_verified: bool

    class Config:
        from_attributes = True


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: str | None = None


class UserProfileUpdate(BaseModel):
    """Schema for users updating their own profile"""

    bio: Optional[str] = None

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, v):
        if v is not None and len(v) > 500:
            raise ValueError("Bio must not exceed 500 characters")
        return v


class UserProfileRead(BaseModel):
    """Schema for reading user profile"""

    id: int
    username: str
    email: str
    role: Role
    balance: float
    is_verified: bool
    is_online: bool
    profile_picture_path: Optional[str] = None
    bio: Optional[str] = None
    price_per_second: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


# Admin Schemas


class AdminUserListItem(BaseModel):
    """Schema for listing users in admin panel"""

    id: int
    username: str
    email: str
    role: Role
    status: UserStatus
    balance: int
    is_verified: bool
    is_online: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AdminUserDetail(BaseModel):
    """Schema for detailed user view in admin panel"""

    id: int
    username: str
    email: str
    role: Role
    status: UserStatus
    balance: int
    is_verified: bool
    is_online: bool
    price_per_second: Optional[float] = None
    profile_picture_path: Optional[str] = None
    bio: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AdminUserCreate(BaseModel):
    """Schema for creating user via admin panel"""

    username: str
    email: EmailStr
    password: str
    role: Role = Role.USER
    status: UserStatus = UserStatus.ACTIVE
    is_verified: bool = False
    balance: int = 0
    price_per_second: Optional[float] = None
    bio: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v


class AdminUserUpdate(BaseModel):
    """Schema for updating user via admin panel"""

    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[Role] = None
    status: Optional[UserStatus] = None
    is_verified: Optional[bool] = None
    is_online: Optional[bool] = None
    price_per_second: Optional[float] = None
    bio: Optional[str] = None
    password: Optional[str] = None
    balance: Optional[int] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if v is not None and len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v


class UserStatusUpdate(BaseModel):
    """Schema for updating user status"""

    status: UserStatus


class UserRoleUpdate(BaseModel):
    """Schema for updating user role"""

    role: Role


class AdminGiftBalance(BaseModel):
    """Schema for admin gift balance"""
    amount: int = Field(gt=0, description="Amount of points to gift")
    message: str = Field(default="", max_length=500, description="Optional gift message")


class AdminBalanceAdjustment(BaseModel):
    """Schema for admin balance adjustment"""
    amount: int
    reason: str

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v == 0:
            raise ValueError("Amount cannot be zero")
        return v

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v):
        if not v or len(v.strip()) < 5:
            raise ValueError("Reason must be at least 5 characters long")
        return v.strip()


class AdminUserListResponse(BaseModel):
    """Schema for paginated user list response"""

    users: List[AdminUserListItem]
    total: int
    page: int
    limit: int
    pages: int
