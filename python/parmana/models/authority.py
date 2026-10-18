"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/authority.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class AuthorityType(str, Enum):
    USER = "USER"
    ROLE = "ROLE"
    SERVICE = "SERVICE"
    ORGANIZATION = "ORGANIZATION"


@dataclass(frozen=True)
class Authority:
    authority_id: str

    authority_type: AuthorityType

    principal_id: str

    issued_at: datetime

    display_name: str | None = None
