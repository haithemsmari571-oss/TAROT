"""Dedicated authentication gate for the Second Brain read-only projection."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.integrations.second_brain_readonly_config import (
    SecondBrainReadonlyConfig,
    load_second_brain_readonly_config,
)

second_brain_readonly_bearer = HTTPBearer(
    auto_error=False,
    scheme_name="SecondBrainReadonlyBearer",
)

_NO_STORE_HEADERS = {"Cache-Control": "no-store"}
_UNAUTHORIZED_HEADERS = {
    "Cache-Control": "no-store",
    "WWW-Authenticate": "Bearer",
}


@dataclass(frozen=True, slots=True)
class SecondBrainReadonlyScope:
    """Token-free authorization scope safe to pass to projection services."""

    allowed_psychic_ids: frozenset[int]


def get_second_brain_readonly_config() -> SecondBrainReadonlyConfig:
    """Load current process configuration for each request."""

    return load_second_brain_readonly_config()


def require_second_brain_readonly_access(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(second_brain_readonly_bearer),
    ],
    config: Annotated[
        SecondBrainReadonlyConfig,
        Depends(get_second_brain_readonly_config),
    ],
) -> SecondBrainReadonlyScope:
    """Fail closed, then compare the dedicated bearer token in constant time."""

    if not config.ready or config.token is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found",
            headers=_NO_STORE_HEADERS,
        )

    if credentials is None or credentials.scheme.casefold() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
            headers=_UNAUTHORIZED_HEADERS,
        )

    presented_token = credentials.credentials.encode("utf-8")
    configured_token = config.token.encode("ascii")
    if not secrets.compare_digest(presented_token, configured_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
            headers=_UNAUTHORIZED_HEADERS,
        )

    return SecondBrainReadonlyScope(
        allowed_psychic_ids=config.allowed_psychic_ids,
    )
