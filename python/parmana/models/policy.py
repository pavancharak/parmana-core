"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/policy-reference.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class PolicyGovernanceAnchorStatus(str, Enum):
    VERIFIED = "VERIFIED"
    NO_APPROVAL_RECORD = "NO_APPROVAL_RECORD"
    SIGNATURE_INVALID = "SIGNATURE_INVALID"
    CONTENT_MISMATCH = "CONTENT_MISMATCH"


@dataclass(frozen=True)
class PolicyGovernanceAnchor:
    status: PolicyGovernanceAnchorStatus

    approval_record_id: str | None = None


@dataclass(frozen=True)
class PolicyReference:
    name: str

    version: str

    schema_version: str

    content_hash: str | None = None

    governance_anchor: PolicyGovernanceAnchor | None = None
