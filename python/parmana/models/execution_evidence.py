"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/execution-evidence.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal


@dataclass(frozen=True)
class ExecutionEvidence:
    business_transaction_id: str

    action: str

    target: str

    parameters: dict[str, Any]

    success: bool

    executed_at: datetime

    attributes: dict[str, Any] | None = None

    correspondence: ExecutionCorrespondence | None = None


@dataclass(frozen=True)
class ExecutionCorrespondence:
    schema_version: Literal[1]

    authorization_nonce: str

    authorized_content_hash: str

    dispatched_content_hash: str

    policy_content_hash: str | None = None

    authority_grant_id: str | None = None

    dispatched_hash_source: Any | None = None
