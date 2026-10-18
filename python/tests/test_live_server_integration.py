"""
Real-server integration test.

Spawns the actual @parmana/api Express application (real
StaticKeyAuthenticator, real PolicyEngine, real Ed25519 signing, the
real NODE_ENV=test-only generic test-fixture connector
(createTestFixtureConnector.ts)) as a subprocess -- the same `npx tsx
packages/api/src/server.ts` the documented `npm run dev` workflow runs --
bound to a real OS-assigned TCP port, and drives it with the real
ParmanaClient over real HTTP. Not a mock.

Covers, against real responses:
- Bearer-key auth: an authenticated request succeeds, an unauthenticated
  one gets a genuine 401.
- Error taxonomy: a real 400, a real 403 (principal-scoping, not policy
  rejection), a real 404, a real 409, and a real policy rejection (403,
  code POLICY_DENIED -- distinct from the principal-scoping 403 above by
  that code, see build_http_error) each raise the correct typed
  exception, built from what the server actually returned.
"""

from __future__ import annotations

import contextlib
import dataclasses
import hashlib
import json
import os
import socket
import subprocess
import tempfile
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
import requests

from parmana import (
    AuthenticationError,
    Authority,
    Authorization,
    AuthorizationError,
    BusinessTransaction,
    BusinessTransactionMetadata,
    ConflictError,
    ExecutionRejectedError,
    Intent,
    NotFoundError,
    ParmanaClient,
    PolicyReference,
    Signature,
    SignatureAlgorithm,
    ValidationError,
)
from tests.local_approver import local_approver_env, sign_local_approval

REPO_ROOT = Path(__file__).resolve().parents[2]

RAW_API_KEY = "python-sdk-integration-test-key"
CALLER_ID = "python-sdk-integration-test"


def _free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _hash_api_key(raw_key: str) -> str:
    # Must match packages/api/src/auth/hashApiKey.ts exactly:
    # createHash("sha256").update(rawKey, "utf8").digest("hex").
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _generate_keypair(key_dir: str, key_id: str) -> None:
    # Reuses the repo's own key-generation script (also what `npm run
    # generate:gateway-keys` runs) rather than re-implementing PEM export in
    # Python, so the test fixture can't drift from how real key material is
    # produced. Mirrors vitest.setup.ts's hermetic-keypair-per-run approach.
    subprocess.run(
        f"npx tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id {key_id}",
        cwd=str(REPO_ROOT),
        env={**os.environ, "PARMANA_KEY_DIR": key_dir},
        shell=True,
        check=True,
        capture_output=True,
        text=True,
    )


@pytest.fixture(scope="session")
def live_server() -> str:
    port = _free_port()

    api_keys = json.dumps(
        [
            {
                "callerId": CALLER_ID,
                "keyHash": _hash_api_key(RAW_API_KEY),
                # Capability grants are fail-closed by default
                # (isCapabilityAllowed.ts) -- mirrors
                # typescript/test/integration/parmana-client.integration.test.ts's
                # identical grant for the same fixture action.
                "allowedCapabilities": ["test:fixture-execute"],
            }
        ]
    )

    with tempfile.TemporaryDirectory(prefix="parmana-pytest-keys-") as key_dir:
        # "default" is the authorization-verification keypair
        # (createGatewayPublicKey.ts); "gateway" is the Execution Gateway's
        # separate attestation-signing keypair (createGatewayKeyPair.ts).
        # Neither is generated automatically by the server -- both must
        # exist in PARMANA_KEY_DIR before it will start.
        _generate_keypair(key_dir, "default")
        _generate_keypair(key_dir, "gateway")

        env = {
            **os.environ,
            "NODE_ENV": "test",
            # Test-only: skip the approval-record check for vendor-payment, which these
            # tests run without maker-checker records. Never set in a deployment.
            "PARMANA_ALLOW_UNGOVERNED_POLICY": "true",
            # Trusts the local test approver (tests/local_approver.py).
            **local_approver_env(),
            "PARMANA_STORAGE": "memory",
            "PARMANA_POLICY_DIR": str(REPO_ROOT / "policies"),
            "PARMANA_API_KEYS": api_keys,
            "PARMANA_KEY_DIR": key_dir,
            # Explicit, not inherited: this test exercises real caller-auth
            # enforcement (unauthenticated -> 401, principal scoping -> 403),
            # which a developer's own .env may have set PARMANA_AUTH_DISABLED=true
            # for locally. dotenv's override:false means Config.ts only fills in
            # what's *not already set* in the subprocess's env, so leaving this
            # unset here would silently let an ambient .env's convenience default
            # defeat exactly what this test suite is checking.
            "PARMANA_AUTH_DISABLED": "false",
            "PORT": str(port),
        }

        process = subprocess.Popen(
            "npx tsx packages/api/src/server.ts",
            cwd=str(REPO_ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            shell=True,
            text=True,
        )

        endpoint = f"http://127.0.0.1:{port}"

        try:
            healthy = False
            for _ in range(120):
                if process.poll() is not None:
                    output = process.stdout.read() if process.stdout else ""
                    raise RuntimeError(
                        f"live server process exited early "
                        f"(code {process.returncode}):\n{output}"
                    )
                try:
                    response = requests.get(f"{endpoint}/health", timeout=1)
                    if response.status_code == 200:
                        healthy = True
                        break
                except requests.exceptions.RequestException:
                    pass
                time.sleep(0.5)

            if not healthy:
                process.terminate()
                raise RuntimeError("live server did not become healthy in time")

            yield endpoint
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


def _transaction(
    *,
    principal_id: str = CALLER_ID,
    business_transaction_id: str | None = None,
    risk_score: int = 10,
    target: str = "vendor/V-python-sdk",
) -> BusinessTransaction:
    now = datetime.now(UTC)
    btx_id = business_transaction_id or str(uuid.uuid4())
    authority_id = str(uuid.uuid4())
    authorization_id = str(uuid.uuid4())
    intent_id = str(uuid.uuid4())

    return BusinessTransaction(
        business_transaction_id=btx_id,
        metadata=BusinessTransactionMetadata(
            business_transaction_id=btx_id,
            correlation_id=str(uuid.uuid4()),
            source_system="python-sdk-integration-test",
            submitted_by="pytest",
            submitted_at=now,
        ),
        authority=Authority(
            authority_id=authority_id,
            authority_type="SERVICE",
            principal_id=principal_id,
            display_name="Python SDK Integration Test",
            issued_at=now,
        ),
        authorization=Authorization(
            authorization_id=authorization_id,
            authority_id=authority_id,
            purpose="Python SDK integration test",
            issued_at=now,
        ),
        intent=Intent(
            intent_id=intent_id,
            authorization_id=authorization_id,
            # test:fixture-execute (not payments:execute/vendor-payment,
            # removed per docs/VERIFICATION-GAPS.md G-27) -- mirrors
            # typescript/test/integration/parmana-client.integration.test.ts's
            # identical fixture update.
            action="test:fixture-execute",
            target=target,
            parameters={"amount": 4200, "currency": "USD"},
            created_at=now,
        ),
        policy=PolicyReference(
            name="vendor-payment", version="2.1.0", schema_version="1.0.0"
        ),
        signals={
            # Signed by the local test approver: no agent action is
            # authorized without a signed human approval.
            "humanApproved": True,
            "approvalArtifact": sign_local_approval(
                capability="test:fixture-execute",
                resource_id=target,
                max_amount=4200,
            ),
            "vendorVerified": True,
            "invoiceVerified": True,
            "paymentApproved": True,
            "sufficientFunds": True,
            "paymentAmount": 4200,
            "riskScore": risk_score,
            "vendorId": target,
        },
        status="RECEIVED",
        created_at=now,
    )


def _authenticated_client(endpoint: str) -> ParmanaClient:
    return ParmanaClient(endpoint=endpoint, api_key=RAW_API_KEY)


def _unauthenticated_client(endpoint: str) -> ParmanaClient:
    return ParmanaClient(endpoint=endpoint)


class TestBearerKeyAuthentication:
    def test_health_succeeds_with_no_api_key(self, live_server):
        health = _unauthenticated_client(live_server).execution.health()
        assert health["status"] == "UP"

    def test_authenticated_request_succeeds(self, live_server):
        transaction = _transaction()
        record = _authenticated_client(live_server).execution.execute(transaction)

        assert record.business_transaction_id == transaction.business_transaction_id
        assert len(record.executions) == 1
        assert record.executions[0].decision.outcome.value == "APPROVED"

    def test_unauthenticated_request_raises_authentication_error(self, live_server):
        with pytest.raises(AuthenticationError) as excinfo:
            _unauthenticated_client(live_server).execution.execute(_transaction())

        assert str(excinfo.value) == "authentication required"


class TestErrorTaxonomyAgainstRealResponses:
    def test_real_validation_error(self, live_server):
        transaction = _transaction(business_transaction_id="not-a-uuid")

        with pytest.raises(ValidationError) as excinfo:
            _authenticated_client(live_server).execution.execute(transaction)

        assert str(excinfo.value) == "businessTransactionId must be a valid UUID."

    def test_real_authorization_error_principal_scoping(self, live_server):
        transaction = _transaction(principal_id="someone-else-entirely")

        with pytest.raises(AuthorizationError) as excinfo:
            _authenticated_client(live_server).execution.execute(transaction)

        assert str(excinfo.value) == (
            "Caller is not permitted to assert this authority.principalId."
        )

    def test_real_policy_rejection_raises_execution_rejected_error(self, live_server):
        transaction = _transaction(risk_score=999)

        with pytest.raises(ExecutionRejectedError) as excinfo:
            _authenticated_client(live_server).execution.execute(transaction)

        assert excinfo.value.status_code == 403
        assert str(excinfo.value) == (
            "Execution rejected: Vendor payment rejected because the assessed "
            "payment risk exceeds the maximum permitted threshold."
        )

    def test_real_not_found_error(self, live_server):
        with pytest.raises(NotFoundError) as excinfo:
            _authenticated_client(live_server).trust_records.get(str(uuid.uuid4()))

        assert str(excinfo.value) == "Execution Trust Record not found."

    def test_real_conflict_error_duplicate(self, live_server):
        transaction = _transaction()
        client = _authenticated_client(live_server)

        client.execution.execute(transaction)

        with pytest.raises(ConflictError) as excinfo:
            client.execution.execute(transaction)

        assert str(excinfo.value) == (
            f"Business Transaction '{transaction.business_transaction_id}' "
            "already exists."
        )

    def test_policy_validate_404_returns_result_not_raise(self, live_server):
        result = _authenticated_client(live_server).policy.validate(
            "does-not-exist", "9.9.9"
        )

        assert result["valid"] is False
        assert result["errors"] == [
            "Policy 'does-not-exist' version '9.9.9' was not found."
        ]


class TestCompletenessGapsClosedThisAudit:
    """version(), verify(), and transactions.create() previously had zero
    SDK coverage in this file (verify() and version() already existed on
    the Python SDK before this audit; transactions.create() did not)."""

    def test_version(self, live_server):
        version = _authenticated_client(live_server).execution.version()
        assert version["name"] == "Parmana"
        assert version["api"] == "v1"

    def test_verify_runs_a_fresh_verification(self, live_server):
        transaction = _transaction()
        client = _authenticated_client(live_server)

        record = client.execution.execute(transaction)
        assert len(record.verifications) == 1

        verification = client.verification.verify(transaction.business_transaction_id)
        assert verification.status.value == "VERIFIED"

        record_after = client.trust_records.get(transaction.business_transaction_id)
        assert len(record_after.verifications) == 2

    def test_transactions_create_executes_via_post_transactions(self, live_server):
        transaction = _transaction()

        record = _authenticated_client(live_server).transactions.create(transaction)

        assert record.business_transaction_id == transaction.business_transaction_id
        assert record.executions[0].decision.outcome.value == "APPROVED"
        # status/created_at supplied by the client are always ignored;
        # Parmana assigns RECEIVED and the current server time.
        assert record.transaction.status.value == "RECEIVED"


class TestRefusalAndAuditVerifyRouteCoverage:
    """refusal.get()/refusal.verify()/audit.verify() previously had zero
    SDK coverage of any kind (RFC-0021's Refusal Record routes and the
    audit-sink signing milestone's POST /audit/verify)."""

    def test_policy_rejected_transaction_produces_a_verifiable_refusal_record(
        self, live_server
    ):
        transaction = _transaction(risk_score=999)
        client = _authenticated_client(live_server)

        with pytest.raises(ExecutionRejectedError):
            client.execution.execute(transaction)

        record = client.refusal_record(transaction.business_transaction_id)
        assert record.business_transaction_id == transaction.business_transaction_id
        assert record.decision.outcome.value == "REJECTED"

        assert client.verify_refusal_record(record) is True

    def test_unauthenticated_caller_can_still_verify_a_refusal_record(
        self, live_server
    ):
        transaction = _transaction(risk_score=999)
        auth_client = _authenticated_client(live_server)

        with pytest.raises(ExecutionRejectedError):
            auth_client.execution.execute(transaction)

        record = auth_client.refusal_record(transaction.business_transaction_id)

        assert (
            _unauthenticated_client(live_server).verify_refusal_record(record) is True
        )

    def test_tampered_refusal_record_fails_verification(self, live_server):
        transaction = _transaction(risk_score=999)
        client = _authenticated_client(live_server)

        with pytest.raises(ExecutionRejectedError):
            client.execution.execute(transaction)

        record = client.refusal_record(transaction.business_transaction_id)
        tampered_decision = dataclasses.replace(
            record.decision, reason="tampered after the fact"
        )
        tampered = dataclasses.replace(record, decision=tampered_decision)

        assert client.verify_refusal_record(tampered) is False

    def test_audit_verify_rejects_a_fabricated_signature_against_the_real_server(
        self, live_server
    ):
        # A genuine signed-event round trip needs the Runtime's own key
        # material, which this fixture's server subprocess holds
        # in-process and does not expose -- see
        # typescript/test/integration/parmana-client.integration.test.ts's
        # equivalent test for that in-process round trip. This still
        # exercises the real POST /audit/verify route end-to-end: a
        # structurally valid but cryptographically wrong signature must
        # come back False, not raise.
        client = _unauthenticated_client(live_server)

        event = {
            "type": "caller.authenticated",
            "occurredAt": datetime.now(UTC).isoformat(),
            "route": "/execute",
            "callerId": CALLER_ID,
        }

        signature = Signature(
            algorithm=SignatureAlgorithm.ED25519,
            key_id="default",
            value="not-a-real-signature",
            signed_at=datetime.now(UTC),
        )

        assert client.verify_audit_event(event, signature) is False

    def test_audit_verify_raises_validation_error_on_a_malformed_body(
        self, live_server
    ):
        client = _unauthenticated_client(live_server)

        with pytest.raises(ValidationError):
            client.audit.verify({"type": "caller.authenticated"}, None)
