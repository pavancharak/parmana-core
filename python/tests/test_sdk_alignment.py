"""
Tests for the methods added to align the Python SDK with the API and with the
TypeScript SDK (SDK 1.3.0): policy governance, caller identity, public keys,
Trust Record listing, the latest receipt shortcut, and step up signing.
"""

from __future__ import annotations

import base64
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.rsa import generate_private_key
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

from parmana import ParmanaClient
from parmana.crypto import canonical_serialize, sign_policy_change_step_up
from parmana.models.caller import CallerIdentity, PublicKeyInfo
from parmana.models.policy_change import PendingPolicyChange, PendingPolicyChangeStatus
from parmana.models.policy_change_results import PolicyChangeForReview
from parmana.models.policy_in_effect import PolicyInEffect
from parmana.serialization import decode

REPO_ROOT = Path(__file__).resolve().parents[2]


class FakeTransport:
    def __init__(self, response: Any = None) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def send(
        self,
        *,
        method,
        path,
        body=None,
        response_model=None,
        non_throwing_statuses=frozenset(),
    ):
        self.calls.append(
            {
                "method": method,
                "path": path,
                "body": body,
                "response_model": response_model,
            }
        )
        if response_model is not None and self.response is not None:
            return decode(self.response, response_model)
        return self.response


def client_with(response: Any = None) -> tuple[ParmanaClient, FakeTransport]:
    client = ParmanaClient(endpoint="http://127.0.0.1:3000")
    transport = FakeTransport(response)
    for api in (client.policy, client.callers, client.trust_records, client.receipt):
        api._transport = transport
    return client, transport


CHANGE = {
    "pendingPolicyChangeId": "c-1",
    "policyName": "customer-refund",
    "policyVersion": "1.0.0",
    "proposedContent": {"policyId": "customer-refund", "refund_limit": 1},
    "proposedBy": "alice",
    "proposedAt": "2026-09-25T08:00:00.000Z",
    "status": "PENDING_APPROVAL",
    "reason": "Adopt it.",
}


def _private_key_pem(key: Any) -> str:
    return key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()


# ---------------------------------------------------------------------------
# Policy governance
# ---------------------------------------------------------------------------


def test_propose_sends_the_content_exactly_as_given():
    client, transport = client_with(CHANGE)

    content = {"policyId": "customer-refund", "refund_limit": 1}
    result = client.propose_policy_change(
        "customer-refund", "1.0.0", proposed_content=content, reason="Adopt it."
    )

    call = transport.calls[0]
    assert call["method"] == "POST"
    assert call["path"] == "/policies/customer-refund/1.0.0/pending-changes"
    # A key with an underscore is not rewritten to camelCase: the policy
    # content is sent byte for byte.
    assert call["body"] == {"proposedContent": content, "reason": "Adopt it."}
    assert result.pending_policy_change_id == "c-1"
    assert result.status is PendingPolicyChangeStatus.PENDING_APPROVAL
    assert isinstance(result.proposed_at, datetime)


def test_list_unwraps_changes_and_decodes_the_diff():
    entry = {**CHANGE, "diff": {"current": None, "proposed": {"policyId": "x"}}}
    client, transport = client_with({"changes": [entry]})

    changes = client.policy_changes("PENDING_APPROVAL")

    assert (
        transport.calls[0]["path"]
        == "/policies/pending-changes?status=PENDING_APPROVAL"
    )
    assert len(changes) == 1
    assert isinstance(changes[0], PolicyChangeForReview)
    assert changes[0].diff.current is None
    assert changes[0].diff.proposed == {"policyId": "x"}

    client.policy_changes()
    assert transport.calls[1]["path"] == "/policies/pending-changes"


def test_approve_and_reject_send_the_step_up_authorization_unchanged():
    key = Ed25519PrivateKey.generate()
    client, transport = client_with({**CHANGE, "status": "APPROVED"})

    approve = sign_policy_change_step_up(
        pending_policy_change_id="c-1",
        action="approve",
        private_key_pem=_private_key_pem(key),
        key_id="bob",
    )
    result = client.approve_policy_change("c-1", approve)

    assert transport.calls[0]["path"] == "/policies/pending-changes/c-1/approve"
    assert transport.calls[0]["body"] == {"stepUpAuthorization": approve}
    assert isinstance(result, PendingPolicyChange)

    reject = sign_policy_change_step_up(
        pending_policy_change_id="c-1",
        action="reject",
        private_key_pem=_private_key_pem(key),
        key_id="bob",
    )
    client.reject_policy_change("c-1", "Not needed.", reject)

    assert transport.calls[1]["path"] == "/policies/pending-changes/c-1/reject"
    assert transport.calls[1]["body"] == {
        "rejectionReason": "Not needed.",
        "stepUpAuthorization": reject,
    }


# ---------------------------------------------------------------------------
# Caller, keys, trust records, receipts
# ---------------------------------------------------------------------------


def test_caller_and_public_key():
    client, transport = client_with(
        {
            "callerId": "local-operator",
            "allowedPrincipalIds": ["local-operator"],
            "allowedCapabilities": ["paytm:refund"],
            "unrestrictedCapabilities": False,
        }
    )
    caller = client.caller()
    assert transport.calls[0]["path"] == "/callers/me"
    assert isinstance(caller, CallerIdentity)
    assert caller.allowed_capabilities == ["paytm:refund"]

    client, transport = client_with(
        {"keyId": "default", "algorithm": "ed25519", "use": "sig", "pem": "PEM"}
    )
    key = client.public_key()
    assert transport.calls[0]["path"] == "/keys/default"
    assert isinstance(key, PublicKeyInfo)
    assert key.jwk is None
    client.public_key("gateway")
    assert transport.calls[1]["path"] == "/keys/gateway"


def test_trust_record_list_paging_and_dates():
    client, transport = client_with([])

    client.trust_records.list()
    assert transport.calls[0]["path"] == "/trust-records?page=1&pageSize=25"

    client.trust_records.list(
        page=2, page_size=10, since="2026-09-01T00:00:00Z", until="2026-09-30T00:00:00Z"
    )
    assert transport.calls[1]["path"] == (
        "/trust-records?page=2&pageSize=10"
        "&since=2026-09-01T00%3A00%3A00Z&until=2026-09-30T00%3A00%3A00Z"
    )


def test_latest_receipt_shortcut():
    client, transport = client_with(None)
    transport.response = None
    client.receipt._transport = transport
    client.latest_receipt("tx-1")
    assert transport.calls[0]["method"] == "GET"
    assert transport.calls[0]["path"] == "/receipt/latest/tx-1"


# ---------------------------------------------------------------------------
# Step up signing
# ---------------------------------------------------------------------------


def test_signature_is_over_the_canonical_payload_and_expires_in_120_seconds():
    key = Ed25519PrivateKey.generate()
    authorization = sign_policy_change_step_up(
        pending_policy_change_id="c-1",
        action="approve",
        private_key_pem=_private_key_pem(key),
        key_id="bob",
    )

    payload = authorization["payload"]
    assert payload["version"] == 1
    assert payload["action"] == "approve"
    assert authorization["algorithm"] == "ed25519"
    assert authorization["keyId"] == "bob"
    # Same timestamp form as JavaScript's toISOString().
    assert payload["authorizedAt"].endswith("Z") and len(payload["authorizedAt"]) == 24

    authorized = datetime.fromisoformat(payload["authorizedAt"].replace("Z", "+00:00"))
    expires = datetime.fromisoformat(payload["expiresAt"].replace("Z", "+00:00"))
    assert (expires - authorized).total_seconds() == 120

    key.public_key().verify(
        base64.b64decode(authorization["signature"]), canonical_serialize(payload)
    )


def test_signer_refuses_bad_input():
    key = _private_key_pem(Ed25519PrivateKey.generate())
    rsa = _private_key_pem(generate_private_key(public_exponent=65537, key_size=2048))

    with pytest.raises(ValueError, match="Ed25519"):
        sign_policy_change_step_up(
            pending_policy_change_id="c-1",
            action="approve",
            private_key_pem=rsa,
            key_id="b",
        )
    with pytest.raises(ValueError, match="approve"):
        sign_policy_change_step_up(
            pending_policy_change_id="c-1",
            action="delete",
            private_key_pem=key,
            key_id="b",
        )
    with pytest.raises(ValueError, match="TTL"):
        sign_policy_change_step_up(
            pending_policy_change_id="c-1",
            action="approve",
            private_key_pem=key,
            key_id="b",
            ttl_seconds=0,
        )


VERIFY_WITH_SERVER = """
import { readFileSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { PolicyChangeStepUpAuthorizationVerifier } from "@parmana/crypto";

const dir = process.argv[2];
const authorization = JSON.parse(readFileSync(dir + "/authorization.json", "utf8"));
const publicKey = createPublicKey(readFileSync(dir + "/public.pem", "utf8"));
const result = await new PolicyChangeStepUpAuthorizationVerifier().verify(
  authorization,
  publicKey,
  { pendingPolicyChangeId: "c-1", action: "approve" },
);
console.log(JSON.stringify(result));
"""


@pytest.mark.skipif(shutil.which("npx") is None, reason="npx not available on PATH")
def test_the_server_verifier_accepts_a_python_signed_authorization():
    key = Ed25519PrivateKey.generate()
    authorization = sign_policy_change_step_up(
        pending_policy_change_id="c-1",
        action="approve",
        private_key_pem=_private_key_pem(key),
        key_id="bob",
    )
    public_pem = key.public_key().public_bytes(
        Encoding.PEM, PublicFormat.SubjectPublicKeyInfo
    )

    # The script lives inside the repository so Node resolves @parmana/crypto
    # from the workspace.
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / "authorization.json").write_text(json.dumps(authorization))
        (Path(tmp) / "public.pem").write_bytes(public_pem)
        script = REPO_ROOT / "python" / ".verify-step-up.tmp.mts"
        script.write_text(VERIFY_WITH_SERVER)
        try:
            result = subprocess.run(
                ["npx", "tsx", str(script), tmp],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                timeout=120,
                shell=(sys.platform == "win32"),
            )
        finally:
            script.unlink(missing_ok=True)

    assert result.returncode == 0, result.stderr
    verdict = json.loads(result.stdout.strip().splitlines()[-1])
    assert verdict["valid"] is True, verdict


def test_offline_verifier_accepts_the_sdk_model_as_well_as_raw_json():
    from parmana.crypto import verify_execution_intent_offline
    from parmana.models.execution_intent import ExecutionIntent

    fixture = json.loads(
        (
            Path(__file__).parent / "fixtures" / "execution-intent-server-signed.json"
        ).read_text(encoding="utf-8")
    )
    server_key = (
        "-----BEGIN PUBLIC KEY-----\n"
        "MCowBQYDK2VwAyEACk6S6j13E+EIdvTezLLwosO4fohNZkhF/j+6FTk6LVI=\n"
        "-----END PUBLIC KEY-----\n"
    )

    model = decode(fixture, ExecutionIntent)

    assert verify_execution_intent_offline(fixture, {"default": server_key}).valid
    assert verify_execution_intent_offline(model, {"default": server_key}).valid


def test_policy_in_effect():
    body = {
        "capability": "paytm:refund",
        "policy": {
            "name": "customer-refund",
            "version": "1.2.0",
            "schemaVersion": "1.0.0",
        },
        "description": "Every refund needs a signed manager approval.",
        "signals": {
            "facts": ["managerApproved", "refundAmount"],
            "schema": {"managerApproved": "boolean", "refundAmount": "number"},
            "bound": {"refundAmount": "parameters.amount"},
            "approval": {
                "managerApproved": {
                    "resourceId": "parameters.orderId",
                    "value": "parameters.amount",
                }
            },
        },
    }
    client, transport = client_with(body)

    result = client.policy_in_effect("paytm:refund")

    assert transport.calls[0]["method"] == "GET"
    assert transport.calls[0]["path"] == "/policies/in-effect?capability=paytm%3Arefund"
    assert isinstance(result, PolicyInEffect)
    assert result.policy.version == "1.2.0"
    assert result.policy.schema_version == "1.0.0"
    assert result.description == "Every refund needs a signed manager approval."
    # Signal names keep the policy's own spelling, never snake_case.
    assert result.signals.facts == ["managerApproved", "refundAmount"]
    assert result.signals.bound == {"refundAmount": "parameters.amount"}
    assert result.signals.approval["managerApproved"]["resourceId"] == (
        "parameters.orderId"
    )
