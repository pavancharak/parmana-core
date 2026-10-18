"""
Parmana business signal sources (RFC-0023): a business system, such as an
ERP, an order system or a CRM, registered through maker checker so
Parmana can ask it for the facts a policy declares in `signalSources`
instead of trusting what the agent proposed.

Hand-maintained: the response bodies of the /business-signal-sources
routes (packages/api/src/routes/business-signal-sources.ts).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .policy_change import PendingPolicyChangeStatus


@dataclass(frozen=True)
class BusinessSignalSource:
    """
    A business system registered under a name, active or revoked.
    """

    #: The change_id of the approved register change that created it.
    registration_id: str

    #: The name a policy's signalSources uses in `source`.
    name: str

    #: The HTTPS endpoint Parmana posts each signed query to.
    endpoint_url: str

    timeout_ms: int

    #: "active" or "revoked". At most one active registration per name.
    status: str

    registered_at: datetime

    #: The Ed25519 public key (SPKI PEM) the source signs its answers with.
    #: When present, an answer without a valid signature is refused.
    public_key_pem: str | None = None

    key_id: str | None = None

    revoked_by_change_id: str | None = None

    revoked_at: datetime | None = None


@dataclass(frozen=True)
class BusinessSignalSourceChange:
    """
    A proposal to register or revoke a business signal source, and its
    resolution. Sign the step up authorization for approve or reject with
    `change_id` as `pending_policy_change_id`.
    """

    change_id: str

    #: "register" or "revoke".
    action: str

    name: str

    reason: str

    proposed_by: str

    proposed_at: datetime

    status: PendingPolicyChangeStatus

    endpoint_url: str | None = None

    timeout_ms: int | None = None

    public_key_pem: str | None = None

    key_id: str | None = None

    resolved_by: str | None = None

    resolved_at: datetime | None = None

    rejection_reason: str | None = None
