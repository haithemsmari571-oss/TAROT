"""The owner's reader routes (routers/owner_readers.py): what the phone sends to
add or change a reader, and what it reads back. The phone sends the fields as
one JSON text in a multipart form beside the photo, so a bio's line breaks
reach the server as typed."""

from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.enums.zodiac_sign import ZODIAC_SIGNS
from app.models.user import ETHNICITY_MAX_LENGTH
from app.schemas.psychic import PsychicCategoryRead

# A new reader's price per message when the phone sends none, and what its form
# starts at: every reader on the site is priced at £2.50 a message (ROUND54
# research; no default existed in code).
DEFAULT_PRICE_PER_MESSAGE = 2.5
# The languages a new reader speaks unless the owner says otherwise.
DEFAULT_LANGUAGES = ("English",)
# Years reading: 0 to this.
YEARS_EXPERIENCE_MAX = 60
# The longest language name the form's "Add another" keeps.
LANGUAGE_NAME_MAX_LENGTH = 40

# Fields an edit may leave out but never send as null.
_NOT_NULL_ON_EDIT = ("name", "price_per_message", "categories_ids", "languages", "show_ethnicity", "is_listed")


def _single_spaced(value: str) -> str:
    return " ".join(value.split())


class _ReaderProfile(BaseModel):
    """Her profile, the same rules on create and edit. Empty text is no value."""

    name: Optional[str] = None
    bio: Optional[str] = None
    price_per_message: Optional[float] = Field(default=None, gt=0)
    categories_ids: Optional[List[int]] = None
    ethnicity: Optional[str] = None
    show_ethnicity: Optional[bool] = None
    years_experience: Optional[int] = Field(default=None, ge=0, le=YEARS_EXPERIENCE_MAX)
    zodiac_sign: Optional[str] = None
    languages: Optional[List[str]] = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        name = _single_spaced(value)
        if not name:
            raise ValueError("Write her name.")
        return name

    @field_validator("bio")
    @classmethod
    def _bio(cls, value: Optional[str]) -> Optional[str]:
        # Kept as written, line breaks included; no cap here (the phone's form
        # stops new typing at 300, and a longer bio already stored is kept).
        if value is None:
            return None
        return value.strip() or None

    @field_validator("price_per_message")
    @classmethod
    def _pennies(cls, value: Optional[float]) -> Optional[float]:
        return None if value is None else round(value, 2)

    @field_validator("categories_ids")
    @classmethod
    def _distinct_categories(cls, value: Optional[List[int]]) -> Optional[List[int]]:
        return None if value is None else list(dict.fromkeys(value))

    @field_validator("ethnicity")
    @classmethod
    def _ethnicity(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        ethnicity = _single_spaced(value)
        if len(ethnicity) > ETHNICITY_MAX_LENGTH:
            raise ValueError(f"At most {ETHNICITY_MAX_LENGTH} characters.")
        return ethnicity or None

    @field_validator("zodiac_sign")
    @classmethod
    def _sign(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if value not in ZODIAC_SIGNS:
            raise ValueError("Not one of the twelve signs.")
        return value

    @field_validator("languages")
    @classmethod
    def _languages(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        """Each name single-spaced, empty ones dropped, each kept once (the first
        spelling), in the owner's order."""
        if value is None:
            return None
        kept: dict[str, str] = {}
        for raw in value:
            name = _single_spaced(raw)
            if not name:
                continue
            if len(name) > LANGUAGE_NAME_MAX_LENGTH:
                raise ValueError(f"A language name has at most {LANGUAGE_NAME_MAX_LENGTH} characters.")
            kept.setdefault(name.casefold(), name)
        return list(kept.values())


class OwnerReaderCreate(_ReaderProfile):
    """A new reader: her name (her username, which clients see), the email she
    signs in with, her photo (beside this, in the form), and her profile."""

    name: str
    email: EmailStr
    price_per_message: float = Field(default=DEFAULT_PRICE_PER_MESSAGE, gt=0)
    categories_ids: List[int] = []
    show_ethnicity: bool = False
    languages: List[str] = list(DEFAULT_LANGUAGES)

    @field_validator("email")
    @classmethod
    def _lower_email(cls, value: str) -> str:
        return value.lower()


class OwnerReaderUpdate(_ReaderProfile):
    """An edit: only the fields sent change. A null clears ethnicity, years
    reading, zodiac sign or the bio. is_listed hides her from clients (false)
    or shows her again (true)."""

    is_listed: Optional[bool] = None

    @model_validator(mode="after")
    def _no_null_where_a_value_is_needed(self):
        for field in _NOT_NULL_ON_EDIT:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be empty.")
        return self


class OwnerReaderRead(BaseModel):
    id: int
    name: str
    email: str
    picture_url: Optional[str] = None
    bio: Optional[str] = None
    price_per_message: Optional[float] = None
    categories: List[PsychicCategoryRead]
    is_listed: bool
    ethnicity: Optional[str] = None
    # Whether she agreed to show her ethnicity on her profile.
    show_ethnicity: bool
    years_experience: Optional[int] = None
    zodiac_sign: Optional[str] = None
    languages: List[str]


class OwnerReaderDefaults(BaseModel):
    """What a new reader's form starts at, so the phone holds no copy of it."""

    price_per_message: float = DEFAULT_PRICE_PER_MESSAGE
    languages: List[str] = list(DEFAULT_LANGUAGES)


class OwnerReaderLimits(BaseModel):
    """The form's limits, from the rules above, so the phone holds no copy of them."""

    ethnicity_max_length: int = ETHNICITY_MAX_LENGTH
    years_experience_max: int = YEARS_EXPERIENCE_MAX
    language_name_max_length: int = LANGUAGE_NAME_MAX_LENGTH


class OwnerReaderList(BaseModel):
    items: List[OwnerReaderRead]
    defaults: OwnerReaderDefaults
    limits: OwnerReaderLimits


class OwnerReaderCreated(OwnerReaderRead):
    # Whether the email with her set-your-password link went out.
    password_email_sent: bool
