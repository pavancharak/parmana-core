"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/metadata.ts, domain/business-transaction.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any

from .authority import Authority
from .authorization import Authorization
from .intent import Intent
from .policy import PolicyReference


@dataclass(frozen=True)
class BusinessTransactionMetadata:
    business_transaction_id: str

    correlation_id: str | None = None

    tenant_id: str | None = None

    source_system: str | None = None

    submitted_by: str | None = None

    granted_capability: str | None = None

    submitted_at: datetime | None = None


class BusinessTransactionStatus(str, Enum):
    RECEIVED = "RECEIVED"
    POLICY_EVALUATED = "POLICY_EVALUATED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    OVERRIDDEN = "OVERRIDDEN"
    EXECUTING = "EXECUTING"
    EXECUTED = "EXECUTED"
    FAILED = "FAILED"
    VERIFIED = "VERIFIED"


@dataclass(frozen=True)
class BusinessTransaction:
    business_transaction_id: str

    metadata: BusinessTransactionMetadata

    authority: Authority

    authorization: Authorization

    intent: Intent

    policy: PolicyReference

    signals: dict[str, Any]

    status: BusinessTransactionStatus

    created_at: datetime
