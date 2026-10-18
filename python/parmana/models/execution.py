"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/decision.ts, domain/execution.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any

from .business_validation import DecisionAssessment
from .execution_evidence import ExecutionEvidence
from .policy import PolicyReference
from .signature import Signature


class DecisionOutcome(str, Enum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


@dataclass(frozen=True)
class Decision:
    decision_id: str

    intent_id: str

    policy: PolicyReference

    signals: dict[str, Any]

    outcome: DecisionOutcome

    evaluated_at: datetime

    reason: str | None = None

    matched_rule_id: str | None = None

    evaluated_rules: float | None = None

    matched_path: list[str] | None = None

    assessment: DecisionAssessment | None = None


class ExecutionStatus(str, Enum):
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ExecutionMode(str, Enum):
    SYNC = "SYNC"
    ASYNC = "ASYNC"


@dataclass(frozen=True)
class Execution:
    execution_id: str

    business_transaction_id: str

    decision: Decision

    status: ExecutionStatus

    mode: ExecutionMode

    started_at: datetime

    completed_at: datetime | None = None

    evidence: ExecutionEvidence | None = None

    metadata: dict[str, Any] | None = None

    previous_chain_hash: Any | None = None

    chain_hash: str | None = None

    chain_signature: Signature | None = None
