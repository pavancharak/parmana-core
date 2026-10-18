"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/evidence-anchor.ts, domain/execution-trust-record.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .business_transaction import BusinessTransaction
from .execution import Execution
from .execution_authorization import SignedExecutionAuthorization
from .override import Override
from .policy import PolicyGovernanceAnchorStatus
from .receipt import Receipt
from .signature import Signature, SignatureEntry
from .verification import Verification


@dataclass(frozen=True)
class EvidenceAnchor:
    anchor_hash: str

    policy_content_hash: str | None = None

    governance_anchor_status: PolicyGovernanceAnchorStatus | None = None

    connector_evidence_hash: str | None = None


@dataclass(frozen=True)
class ExecutionTrustRecord:
    trust_record_id: str

    business_transaction_id: str

    transaction: BusinessTransaction

    overrides: list[Override]

    executions: list[Execution]

    verifications: list[Verification]

    receipts: list[Receipt]

    trust_record_hash: str

    signature: Signature

    created_at: datetime

    updated_at: datetime

    authorization: SignedExecutionAuthorization | None = None

    schema_version: float | None = None

    signatures: list[SignatureEntry] | None = None

    evidence_anchor: EvidenceAnchor | None = None
