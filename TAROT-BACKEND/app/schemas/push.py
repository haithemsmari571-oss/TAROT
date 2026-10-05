from typing import Literal

from pydantic import BaseModel, Field

from app.models.push_subscription import PUSH_APP_CLIENT, PUSH_APP_OWNER

# A push service address is a URL of a few hundred characters at most.
ENDPOINT_MAX_LENGTH = 2048


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=255)
    auth: str = Field(min_length=1, max_length=255)


class PushSubscriptionIn(BaseModel):
    """The browser's PushSubscription.toJSON() (endpoint and keys; its
    expirationTime is ignored), and which app it was made in."""

    endpoint: str = Field(min_length=1, max_length=ENDPOINT_MAX_LENGTH)
    keys: PushKeys
    app: Literal[PUSH_APP_CLIENT, PUSH_APP_OWNER]


class PushSubscriptionOut(BaseModel):
    app: str
    created: bool


class PushSubscriptionDelete(BaseModel):
    endpoint: str = Field(min_length=1, max_length=ENDPOINT_MAX_LENGTH)


class PushPublicKey(BaseModel):
    """The server's VAPID public key, or null while push is off."""

    public_key: str | None
