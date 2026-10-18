"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/execution-intent.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from .signature import Signature


class ExecutionIntentState(str, Enum):
    PREPARED = "PREPARED"
    RELEASED = "RELEASED"
    FINALIZED = "FINALIZED"
    ERRORED = "ERRORED"
    RESOLVED = "RESOLVED"


class ExecutionIntentResolution(str, Enum):
    NOT_EXECUTED = "NOT_EXECUTED"
    EXECUTED = "EXECUTED"


class ExecutionIntentFinalizationMode(str, Enum):
    INLINE = "INLINE"
    REPAIRED = "REPAIRED"


@dataclass(frozen=True)
class ExecutionIntent:
    intent_id: str

    business_transaction_id: str

    decision_id: str

    authorization_id: str

    policy_name: str

    policy_version: str

    business_transaction_hash: str

    action: str

    target: str

    created_at: datetime

    intent_hash: str

    signature: Signature

    policy_content_hash: str | None = None

    signals_hash: str | None = None

    submitted_by: str | None = None

    granted_capability: str | None = None


@dataclass(frozen=True)
class ExecutionIntentStatus:
    state: ExecutionIntentState

    released_at: datetime | None = None

    finalized_at: datetime | None = None

    finalization_mode: ExecutionIntentFinalizationMode | None = None

    trust_record_id: str | None = None

    failure_reason: str | None = None

    resolved_at: datetime | None = None

    resolved_by: str | None = None

    resolution: ExecutionIntentResolution | None = None

    resolution_note: str | None = None
