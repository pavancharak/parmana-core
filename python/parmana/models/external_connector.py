"""
Parmana external connectors: your own HTTPS endpoint registered for a
capability through maker checker, with no Parmana code change.

Hand-maintained: the response bodies of the /external-connectors routes
(packages/api/src/routes/external-connectors.ts).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .policy_change import PendingPolicyChangeStatus


@dataclass(frozen=True)
class ExternalConnector:
    """
    A capability registered to an HTTPS endpoint, active or revoked.
    """

    #: The change_id of the approved register change that created it.
    registration_id: str

    capability: str

    endpoint_url: str

    #: The policy that governs the capability. A request must declare the
    #: version approved through policy governance.
    policy: str

    #: The intent parameters Parmana forwards to the endpoint.
    allowed_parameters: list[str]

    timeout_ms: int

    #: "active" or "revoked". At most one active registration per capability.
    status: str

    registered_at: datetime

    revoked_by_change_id: str | None = None

    revoked_at: datetime | None = None


@dataclass(frozen=True)
class ExternalConnectorChange:
    """
    A proposal to register or revoke an external connector, and its
    resolution. Sign the step up authorization for approve or reject with
    `change_id` as `pending_policy_change_id`.
    """

    change_id: str

    #: "register" or "revoke".
    action: str

    capability: str

    reason: str

    proposed_by: str

    proposed_at: datetime

    status: PendingPolicyChangeStatus

    endpoint_url: str | None = None

    policy: str | None = None

    allowed_parameters: list[str] | None = None

    timeout_ms: int | None = None

    resolved_by: str | None = None

    resolved_at: datetime | None = None

    rejection_reason: str | None = None
