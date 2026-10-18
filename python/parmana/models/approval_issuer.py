"""
Parmana approvers managed without a deploy.

Hand-maintained: the response bodies of the /approval-issuers routes
(packages/api/src/routes/approval-issuers.ts).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .policy_change import PendingPolicyChangeStatus


@dataclass(frozen=True)
class ApprovalIssuer:
    """
    A key the server trusts, or trusted, to sign approvals.
    """

    approver_id: str

    key_id: str

    #: Ed25519 public key, PEM (SPKI).
    public_key_pem: str

    #: True: every approval signed with this key is refused.
    revoked: bool

    #: "code": listed in the server code, changed only by a deploy.
    #: "governed": added through an approver change.
    source: str

    added_by_change_id: str | None = None

    added_at: datetime | None = None

    revoked_by_change_id: str | None = None

    revoked_at: datetime | None = None


@dataclass(frozen=True)
class ApprovalIssuerChange:
    """
    A proposal to add or revoke an approver key, and its resolution. Sign
    the step up authorization for approve or reject with `change_id` as
    `pending_policy_change_id`.
    """

    change_id: str

    #: "add" or "revoke".
    action: str

    approver_id: str

    key_id: str

    reason: str

    proposed_by: str

    proposed_at: datetime

    status: PendingPolicyChangeStatus

    public_key_pem: str | None = None

    resolved_by: str | None = None

    resolved_at: datetime | None = None

    rejection_reason: str | None = None
