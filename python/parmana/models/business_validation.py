"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/business-validation.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Literal


class AuthorityStatus(str, Enum):
    AUTHORIZED = "AUTHORIZED"
    NOT_AUTHORIZED = "NOT_AUTHORIZED"
    AUTHORITY_UNCLEAR = "AUTHORITY_UNCLEAR"
    AUTHORITY_EXPIRED = "AUTHORITY_EXPIRED"


class BusinessValidationStatus(str, Enum):
    VALID = "VALID"
    INVALID = "INVALID"
    MISSING_DATA = "MISSING_DATA"
    CONFLICTING_DATA = "CONFLICTING_DATA"
    SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE"
    VALIDATION_EXPIRED = "VALIDATION_EXPIRED"
    NOT_EVALUATED = "NOT_EVALUATED"


class ExecutionAssessmentStatus(str, Enum):
    EXECUTED = "EXECUTED"
    NOT_EXECUTED = "NOT_EXECUTED"
    EXECUTION_FAILED = "EXECUTION_FAILED"
    EXECUTION_UNKNOWN = "EXECUTION_UNKNOWN"


@dataclass(frozen=True)
class TrustedSignalIntegrityProof:
    algorithm: Literal["sha256"]

    digest: str

    source_proof: str | None = None

    source_key_id: str | None = None

    source_proof_verified: bool | None = None


@dataclass(frozen=True)
class TrustedSignal:
    signal_id: str

    signal_key: str

    source: str

    source_identity: str

    claim: str

    subject: str

    subject_path: str

    observed_value: Any

    observed_at: datetime

    valid_until: datetime

    action: str

    business_transaction_id: str

    integrity_proof: TrustedSignalIntegrityProof

    verification_status: Literal["VERIFIED"]


@dataclass(frozen=True)
class BusinessValidationFailure:
    signal_key: str

    status: BusinessValidationStatus

    reason: str


@dataclass(frozen=True)
class AuthorityGrantLimit:
    min: float | None = None

    max: float | None = None

    one_of: list[Any] | None = None


@dataclass(frozen=True)
class AuthorityGrantReference:
    grant_id: str

    caller_id: str

    capability: str

    valid_from: datetime

    valid_until: datetime

    limits: dict[str, Any] | None = None


@dataclass(frozen=True)
class AuthorityAssessment:
    status: AuthorityStatus

    reason: str

    grant: AuthorityGrantReference | None = None


@dataclass(frozen=True)
class BusinessValidationAssessment:
    status: BusinessValidationStatus

    reason: str

    signals: list[TrustedSignal] | None = None

    failures: list[BusinessValidationFailure] | None = None


@dataclass(frozen=True)
class ExecutionAssessment:
    status: ExecutionAssessmentStatus

    reason: str


@dataclass(frozen=True)
class DecisionAssessment:
    authority: AuthorityAssessment

    business_validation: BusinessValidationAssessment

    execution: ExecutionAssessment | None = None
