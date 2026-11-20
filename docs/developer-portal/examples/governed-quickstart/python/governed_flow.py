"""
Governed quickstart (Python). The same flow as ../typescript/governed-flow.ts,
using the public `parmana` package against a local server started by
../start-server.sh:

  1. The maker proposes vendor-payment@2.1.0 (maker-checker: propose).
  2. The maker tries to approve its own proposal. The server refuses it.
  3. The checker approves with a step-up signature. The policy version takes effect.
  4. The demo caller executes a Business Transaction with a signed human approval.
  5. The server verifies the Execution Trust Record, and the SDK verifies it offline.
  6. Submitting the same businessTransactionId again is refused.

Install the SDK with its verification extra (the signers need `cryptography`):

  pip install "parmana[verify]"

Run after `node docs/developer-portal/examples/governed-quickstart/setup.mjs`,
with the server running, from any directory:

  python docs/developer-portal/examples/governed-quickstart/python/governed_flow.py

Test configuration only. The keys it reads are local secrets created by setup.mjs.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from parmana import (
    ParmanaClient,
    ParmanaError,
    PolicyReference,
    create_business_transaction,
)
from parmana.crypto import (
    sign_approval,
    sign_policy_change_step_up,
    verify_execution_trust_record_offline,
)

CONFIG_DIR = Path(
    os.environ.get(
        "GOVERNED_CONFIG_DIR", str(Path.home() / ".parmana" / "governed-quickstart")
    )
)
ENDPOINT = os.environ.get("PARMANA_ENDPOINT", "http://localhost:3000")
POLICY_NAME = "vendor-payment"
POLICY_VERSION = "2.1.0"


def value_of(enum_or_text: object) -> str:
    """Enum members print as their value (for example APPROVED), not as the class name."""
    return str(getattr(enum_or_text, "value", enum_or_text))


def explain(error: BaseException) -> str:
    if isinstance(error, ParmanaError):
        status = getattr(error, "status_code", None)
        suffix = f" (HTTP {status})" if status else ""
        return f"{type(error).__name__}{suffix}: {error}"
    return str(error)


def main() -> int:
    raw_keys = json.loads((CONFIG_DIR / "raw-keys.json").read_text())
    step_up_private_pem = (CONFIG_DIR / "stepup-private.pem").read_text()
    approver_private_pem = (
        CONFIG_DIR / "local-test-approver__local-test-approver-key-1.private.pem"
    ).read_text()
    policy_content = json.loads(
        (CONFIG_DIR / "policies" / POLICY_NAME / POLICY_VERSION / "policy.json").read_text()
    )

    maker = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["maker"])
    checker = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["checker"])
    demo = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["demo"])

    # 1. Maker proposes the policy version.
    print(f"1. maker proposes {POLICY_NAME}@{POLICY_VERSION}")
    proposal = maker.propose_policy_change(
        POLICY_NAME, POLICY_VERSION, proposed_content=policy_content, reason="Governed quickstart"
    )
    pending_id = proposal.pending_policy_change_id
    print(f"   pending change: {pending_id}")

    def step_up() -> dict:
        return sign_policy_change_step_up(
            pending_policy_change_id=pending_id,
            action="approve",
            private_key_pem=step_up_private_pem,
            key_id="checker-step-up-key",
        )

    # 2. The maker may not approve its own change.
    print("2. maker tries to approve its own change (expected to be refused)")
    try:
        maker.approve_policy_change(pending_id, step_up())
    except ParmanaError as error:
        print(f"   refused as expected: {explain(error)}")
    else:
        raise SystemExit("The server accepted a self-approval. This must not happen.")

    # 3. A distinct checker approves with a step-up signature.
    print("3. checker approves with a step-up signature")
    resolved = checker.approve_policy_change(pending_id, step_up())
    print(f"   status: {value_of(resolved.status)}")

    # 4. The demo caller executes with a signed human approval for this action, target and amount.
    print("4. demo caller executes an approved action")
    approval = sign_approval(
        private_key_pem=approver_private_pem,
        approver_id="local-test-approver",
        key_id="local-test-approver-key-1",
        capability="test:fixture-execute",
        resource_id="vendor://payments",
        max_amount=1000,
    )
    transaction = create_business_transaction(
        principal_id="demo",
        purpose="Governed quickstart",
        action="test:fixture-execute",
        target="vendor://payments",
        parameters={"amount": 1000, "currency": "USD"},
        policy=PolicyReference(name=POLICY_NAME, version=POLICY_VERSION, schema_version="1.0.0"),
        signals={
            "humanApproved": True,
            "approvalArtifact": approval,
            "vendorVerified": True,
            "invoiceVerified": True,
            "paymentApproved": True,
            "sufficientFunds": True,
            "paymentAmount": 1000,
            "riskScore": 5,
            "vendorId": "vendor://payments",
        },
    )
    record = demo.execute(transaction)
    print(f"   trust record: {record.trust_record_id}")
    print(f"   outcome: {value_of(record.executions[0].decision.outcome)}")

    # 5. Verify: by the server, then offline with the deployment's published public key.
    print("5. verification")
    server_verification = demo.verify(record.business_transaction_id)
    print(f"   server verification: {value_of(server_verification.status)}")
    published = demo.public_key("default")
    offline = verify_execution_trust_record_offline(record, {"default": published.pem})
    print(
        f"   offline (SDK): valid={offline.valid} coverage={offline.coverage} "
        f"hash_valid={offline.hash_valid} legacy_signature_valid={offline.legacy_signature_valid}"
    )
    if not offline.valid:
        raise SystemExit(f"Offline verification failed: {'; '.join(offline.errors)}")

    # 6. Replay: the same businessTransactionId is never executed twice.
    print("6. the same transaction is submitted again (expected to be refused)")
    try:
        demo.execute(transaction)
    except ParmanaError as error:
        print(f"   refused as expected: {explain(error)}")
    else:
        raise SystemExit("The server accepted a repeated transaction. This must not happen.")

    print("")
    print("Governed flow complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
