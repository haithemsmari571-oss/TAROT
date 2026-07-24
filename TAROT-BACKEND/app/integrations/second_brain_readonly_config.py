"""Fail-closed process configuration for the Second Brain read-only projection.

Required only when deliberately enabled:
- SECOND_BRAIN_READONLY_ENABLED must be exactly ``true``.
- SECOND_BRAIN_READONLY_TOKEN must be a dedicated 32+ character URL-safe token.
- SECOND_BRAIN_VALENTINA_PSYCHIC_IDS must list positive IDs, never ``*``.

Values come only from the current process environment; this module never loads
an env file and never supplies a credential or an unrestricted default.
"""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field

SECOND_BRAIN_READONLY_ENABLED_ENV = "SECOND_BRAIN_READONLY_ENABLED"
SECOND_BRAIN_READONLY_TOKEN_ENV = "SECOND_BRAIN_READONLY_TOKEN"
SECOND_BRAIN_VALENTINA_PSYCHIC_IDS_ENV = "SECOND_BRAIN_VALENTINA_PSYCHIC_IDS"

_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_-]{32,}\Z")


@dataclass(frozen=True, slots=True)
class SecondBrainReadonlyConfig:
    """Validated integration configuration loaded only from process variables."""

    enabled: bool
    token: str | None = field(repr=False, compare=False)
    allowed_psychic_ids: frozenset[int]
    validation_errors: tuple[str, ...] = field(default=(), repr=False)

    @property
    def ready(self) -> bool:
        """Return whether the projection may authenticate a request."""

        return (
            self.enabled
            and self.token is not None
            and bool(self.allowed_psychic_ids)
            and not self.validation_errors
        )


def _parse_enabled(raw_value: str | None) -> tuple[bool, str | None]:
    if raw_value is None:
        return False, None

    value = raw_value.strip()
    if value == "true":
        return True, None
    if value == "false":
        return False, None
    return False, "invalid_enabled_flag"


def _parse_token(raw_value: str | None) -> tuple[str | None, str | None]:
    if raw_value is None or raw_value == "":
        return None, "missing_token"
    if raw_value != raw_value.strip() or _TOKEN_PATTERN.fullmatch(raw_value) is None:
        return None, "invalid_token"
    return raw_value, None


def _parse_psychic_ids(
    raw_value: str | None,
) -> tuple[frozenset[int], str | None]:
    if raw_value is None or raw_value.strip() == "":
        return frozenset(), "missing_psychic_allowlist"

    raw_ids = raw_value.split(",")
    if any(part.strip() == "" for part in raw_ids):
        return frozenset(), "invalid_psychic_allowlist"

    psychic_ids: set[int] = set()
    for raw_id in raw_ids:
        value = raw_id.strip()
        if not value.isascii() or not value.isdecimal():
            return frozenset(), "invalid_psychic_allowlist"

        psychic_id = int(value)
        if psychic_id <= 0:
            return frozenset(), "invalid_psychic_allowlist"
        psychic_ids.add(psychic_id)

    if not psychic_ids:
        return frozenset(), "missing_psychic_allowlist"
    return frozenset(psychic_ids), None


def load_second_brain_readonly_config(
    environ: Mapping[str, str] | None = None,
) -> SecondBrainReadonlyConfig:
    """Load integration settings without invoking the application's env loader."""

    source = os.environ if environ is None else environ
    enabled, enabled_error = _parse_enabled(
        source.get(SECOND_BRAIN_READONLY_ENABLED_ENV)
    )
    token, token_error = _parse_token(source.get(SECOND_BRAIN_READONLY_TOKEN_ENV))
    psychic_ids, psychic_ids_error = _parse_psychic_ids(
        source.get(SECOND_BRAIN_VALENTINA_PSYCHIC_IDS_ENV)
    )
    validation_errors = tuple(
        error
        for error in (enabled_error, token_error, psychic_ids_error)
        if error is not None
    )

    return SecondBrainReadonlyConfig(
        enabled=enabled,
        token=token,
        allowed_psychic_ids=psychic_ids,
        validation_errors=validation_errors,
    )
