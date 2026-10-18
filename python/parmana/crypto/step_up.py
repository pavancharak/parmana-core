"""
Signs a policy governance step up authorization on the approver's own
machine.

The result is accepted by POST /policies/pending-changes/{id}/approve and
.../reject exactly as one made by the server's
PolicyChangeStepUpAuthorizationSigner (packages/crypto/src/
PolicyChangeStepUpAuthorizationCrypto.ts) or by the TypeScript SDK's
signPolicyChangeStepUp(): the same payload, the same canonical JSON, the same
Ed25519 signature. The private key never leaves the process that calls this
function.

Needs the optional `cryptography` dependency: `pip install "parmana[verify]"`.
"""

from __future__ import annotations

import base64
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key

from .canonical import canonical_serialize

DEFAULT_TTL_SECONDS = 120


def _iso(moment: datetime) -> str:
    """
    The exact form of JavaScript's Date.prototype.toISOString():
    YYYY-MM-DDTHH:MM:SS.sssZ, in UTC, with milliseconds.
    """

    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def sign_policy_change_step_up(
    *,
    pending_policy_change_id: str,
    action: str,
    private_key_pem: str,
    key_id: str,
    ttl_seconds: float = DEFAULT_TTL_SECONDS,
) -> dict[str, Any]:
    """
    Sign a step up authorization for one action on one policy change.

    Parameters
    ----------
    pending_policy_change_id:
        The change to approve or reject.

    action:
        "approve" or "reject".

    private_key_pem:
        The approver's Ed25519 step up private key, PEM (PKCS #8), as made
        by `openssl genpkey -algorithm ed25519`.

    key_id:
        A label for the key. It is recorded with the authorization; the
        server verifies with the public key registered on the approver's API
        key, not by this label.

    ttl_seconds:
        How long the authorization stays valid. Default 120.

    Returns
    -------
    The authorization as a JSON ready dict, to pass to
    `client.approve_policy_change()` or `client.reject_policy_change()`.
    It is valid once, until its `expiresAt`.
    """

    if not math.isfinite(ttl_seconds) or ttl_seconds <= 0:
        raise ValueError(f"Invalid step up authorization TTL: {ttl_seconds}")

    if action not in ("approve", "reject"):
        raise ValueError('action must be "approve" or "reject".')

    private_key = load_pem_private_key(private_key_pem.encode("utf-8"), password=None)

    if not isinstance(private_key, Ed25519PrivateKey):
        raise ValueError("the step up private key must be an Ed25519 key.")

    # Millisecond precision, like the JavaScript Date the server uses, so the
    # expiry the server reads back is exactly authorizedAt + TTL.
    authorized_at = datetime.now(timezone.utc)
    authorized_at = authorized_at.replace(
        microsecond=(authorized_at.microsecond // 1000) * 1000
    )
    expires_at = authorized_at + timedelta(seconds=ttl_seconds)

    payload = {
        "version": 1,
        "nonce": str(uuid.uuid4()),
        "pendingPolicyChangeId": pending_policy_change_id,
        "action": action,
        "authorizedAt": _iso(authorized_at),
        "expiresAt": _iso(expires_at),
    }

    signature = private_key.sign(canonical_serialize(payload))

    return {
        "payload": payload,
        "signature": base64.b64encode(signature).decode("ascii"),
        "keyId": key_id,
        "algorithm": "ed25519",
    }
