"""
The local test approver, for tests that run a real server.

No agent action is authorized without a signed human approval
(docs/CLAIMS.md 2.47), so a test that expects an approved action signs
one. A server started with NODE_ENV=test trusts the approver
``local-test-approver`` with the public key in the file
PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE names
(packages/api/src/bootstrap/codeApprovalIssuers.ts). Any other NODE_ENV
refuses to start with that variable set.
"""

from __future__ import annotations

import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from parmana.crypto import sign_approval

LOCAL_TEST_APPROVER_ID = "local-test-approver"
LOCAL_TEST_APPROVER_KEY_ID = "local-test-approver-key-1"


@lru_cache(maxsize=1)
def _keys() -> tuple[str, str]:
    private_key = Ed25519PrivateKey.generate()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    public_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )

    directory = Path(tempfile.mkdtemp(prefix="parmana-local-approver-"))
    public_file = directory / "local-test-approver.public.pem"
    public_file.write_text(public_pem)

    return str(public_file), private_pem


def local_approver_env() -> dict[str, str]:
    """The environment a test server needs to trust the local approver."""

    return {"PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE": _keys()[0]}


def sign_local_approval(
    *,
    capability: str,
    resource_id: str,
    max_amount: float | None = None,
) -> dict[str, Any]:
    """A signed approval from the local test approver."""

    return sign_approval(
        private_key_pem=_keys()[1],
        approver_id=LOCAL_TEST_APPROVER_ID,
        key_id=LOCAL_TEST_APPROVER_KEY_ID,
        capability=capability,
        resource_id=resource_id,
        max_amount=max_amount,
    )
