"""
GENERATED FILE -- DO NOT EDIT BY HAND.

Generated from packages/shared/src/domain/execution-authorization.ts by
python/scripts/generate_models.ts. Run "npm run
generate:python-models" to regenerate.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


@dataclass(frozen=True)
class AuthorizationBusinessCondition:
    signal_id: str

    signal_key: str

    source: str

    claim: str

    subject: str

    value: Any

    valid_until: str


@dataclass(frozen=True)
class AuthorizationGrantBound:
    grant_id: str

    valid_until: str


@dataclass(frozen=True)
class ExecutionAuthorizationPayload:
    version: Literal[1]

    authorization_id: str

    nonce: str

    decision_id: str

    business_transaction_id: str

    policy_name: str

    policy_version: str

    authorized_at: str

    expires_at: str

    business_transaction_hash: str

    decision_outcome: Literal["APPROVED"] | None = None

    policy_content_hash: str | None = None

    signals_hash: str | None = None

    submitted_by: str | None = None

    granted_capability: str | None = None

    business_conditions: list[AuthorizationBusinessCondition] | None = None

    authority_grant: AuthorizationGrantBound | None = None


@dataclass(frozen=True)
class SignedExecutionAuthorization:
    payload: ExecutionAuthorizationPayload

    signature: str

    key_id: str

    algorithm: str
