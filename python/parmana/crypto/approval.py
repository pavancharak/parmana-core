"""
Signs an Approval Artifact on the approver's own machine: one approver
approving one action on one resource, optionally up to an amount, for a
limited time, once.

The result is accepted by any policy that declares approvalSignals exactly as
one made by the server's ApprovalArtifactSigner (packages/crypto/src/
ApprovalArtifactCrypto.ts), scripts/sign-approval.ts or the TypeScript SDK's
signApproval(): the same payload, the same canonical JSON, the same Ed25519
signature. The agent sends it in the signal the policy names (by default
signals.approvalArtifact), with the approval signal set to true. The private
key never leaves the process that calls this function.

Needs the optional `cryptography` dependency: `pip install "parmana[verify]"`.
"""

from __future__ import annotations

import base64
import math
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key

from .canonical import canonical_serialize
from .step_up import _iso

DEFAULT_APPROVAL_TTL_SECONDS = 900
MAX_APPROVAL_TTL_SECONDS = 86_400

_CAPABILITY = re.compile(r"^[A-Za-z0-9_-]+:[A-Za-z0-9_.-]+$")


def sign_approval(
    *,
    private_key_pem: str,
    approver_id: str,
    key_id: str,
    capability: str,
    resource_id: str,
    max_amount: float | None = None,
    ttl_seconds: int = DEFAULT_APPROVAL_TTL_SECONDS,
) -> dict[str, Any]:
    """
    Sign an approval of one action on one resource.

    Parameters
    ----------
    private_key_pem:
        The approver's Ed25519 private key, PEM (PKCS #8), as made by
        scripts/generate-approver-key.ts.

    approver_id, key_id:
        The approver and key as registered on the server.

    capability:
        The action approved, such as "paytm:refund" or "github:pr-merge".

    resource_id:
        The value at the policy's approvalSignals resourceId path: an order
        id, or for "target" the Intent's target, such as "acme/api#42".

    max_amount:
        The largest amount approved. Give it when the policy declares a value
        path (an amount), and leave it out when it does not: the approval
        then names exactly this resource.

    ttl_seconds:
        How long the approval stays valid. Default 900, at most 86400.

    Returns
    -------
    The signed approval as a JSON ready dict, to send in the policy's
    approval signal. It is valid once, until its `expiresAt`.
    """

    if (
        isinstance(ttl_seconds, bool)
        or not isinstance(ttl_seconds, int)
        or ttl_seconds <= 0
        or ttl_seconds > MAX_APPROVAL_TTL_SECONDS
    ):
        raise ValueError(
            f"ttl_seconds must be a whole number from 1 to {MAX_APPROVAL_TTL_SECONDS}."
        )

    if not _CAPABILITY.match(capability):
        raise ValueError(
            "capability must be an action such as paytm:refund or "
            f"github:pr-merge: {capability}"
        )

    if len(resource_id) == 0:
        raise ValueError("resource_id must not be empty.")

    if max_amount is not None and (
        isinstance(max_amount, bool) or not math.isfinite(max_amount) or max_amount <= 0
    ):
        raise ValueError("max_amount must be a positive number.")

    # JavaScript writes 75000.0 as 75000, and the server checks the signature
    # over its own serialization, so sign a whole number as an int.
    if isinstance(max_amount, float) and max_amount.is_integer():
        max_amount = int(max_amount)

    private_key = load_pem_private_key(private_key_pem.encode("utf-8"), password=None)

    if not isinstance(private_key, Ed25519PrivateKey):
        raise ValueError("the approver private key must be an Ed25519 key.")

    # Millisecond precision, like the JavaScript Date the server uses.
    issued_at = datetime.now(timezone.utc)
    issued_at = issued_at.replace(microsecond=(issued_at.microsecond // 1000) * 1000)
    expires_at = issued_at + timedelta(seconds=ttl_seconds)

    scope: dict[str, Any] = (
        {"field": "value", "comparator": "lte", "value": max_amount}
        if max_amount is not None
        else {"field": "resourceId", "comparator": "eq", "value": resource_id}
    )

    payload = {
        "version": 1,
        "approvalId": str(uuid.uuid4()),
        "issuer": {"approverId": approver_id, "keyId": key_id},
        "issuedAt": _iso(issued_at),
        "expiresAt": _iso(expires_at),
        "capability": capability,
        "resourceId": resource_id,
        "scope": scope,
        "nonce": str(uuid.uuid4()),
    }

    signature = private_key.sign(canonical_serialize(payload))

    return {
        "payload": payload,
        "signature": {
            "algorithm": "ed25519",
            "keyId": key_id,
            "value": base64.b64encode(signature).decode("ascii"),
            "signedAt": _iso(issued_at),
        },
    }
