from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.enums.gender import Gender
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

    username: Optional[str] = None
    bio: Optional[str] = None
    date_of_birth: Optional[date] = None
    # Editable afterwards, in the same place she can already change her date of birth.
    # Optional here only in the "not supplied, leave it alone" sense — update_user_profile
    # uses exclude_unset, so omitting it never overwrites what she chose.
    gender: Optional[Gender] = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        if v is None:
            return v
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Name must be at least 3 characters")
        if len(v) > 50:
            raise ValueError("Name must not exceed 50 characters")
        return v

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, v):
        if v is not None and len(v) > 500:
            raise ValueError("Bio must not exceed 500 characters")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v):
        if v is not None and v > date.today():
            raise ValueError("Date of birth cannot be in the future")
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
    date_of_birth: Optional[date] = None
    gender: Gender = Gender.NOT_STATED
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
    balance: float  # money stored to 2 dp (pennies)
    credit_balance: float
    total_balance: float
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
    balance: float  # money stored to 2 dp (pennies)
    credit_balance: float
    total_balance: float
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
    balance: float = 0
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
    balance: Optional[float] = None

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
    amount: float = Field(gt=0, description="Amount of points to gift")
    message: str = Field(default="", max_length=500, description="Optional gift message")


class AdminBalanceAdjustment(BaseModel):
    """Schema for admin balance adjustment"""
    amount: float
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


class PushTokenReq(BaseModel):
    """Expo push token registration from the mobile app."""

    token: str
    platform: Optional[str] = None  # "ios" | "android"
