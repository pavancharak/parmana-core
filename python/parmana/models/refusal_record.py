"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/refusal-record.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .execution import Decision
from .signature import Signature


@dataclass(frozen=True)
class RefusalIntentSnapshot:
    target: str | None = None

    parameters: dict[str, Any] | None = None


@dataclass(frozen=True)
class RefusalBindingViolation:
    signal_key: str

    intent_path: str

    signal_value: Any

    intent_value: Any


@dataclass(frozen=True)
class RefusalRecord:
    refusal_record_id: str

    business_transaction_id: str

    decision: Decision

    evaluated_intent: RefusalIntentSnapshot

    refusal_record_hash: str

    signature: Signature

    created_at: datetime

    binding_violations: list[RefusalBindingViolation] | None = None

    submitted_by: str | None = None

    policy_content_hash: str | None = None
