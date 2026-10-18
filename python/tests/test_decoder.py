from __future__ import annotations

from datetime import datetime

from parmana.models.execution import Execution
from parmana.models.override import Override
from parmana.models.signature import SignatureAlgorithm
from parmana.models.trust_record import ExecutionTrustRecord
from parmana.models.verification import VerificationStatus
from parmana.serialization import decode


def test_decode_execution_trust_record():
    """
    Decodes a full real wire-shape Execution Trust Record, as returned by
    POST /execute and POST /transactions (see BusinessTransactionMapper and
    ExecutionTrustApplication.execute in packages/runtime).

    This fixture intentionally includes every field the current
    @parmana/shared ExecutionTrustRecord requires -- including `signature`,
    which the SDK previously had no model field for at all (silently
    dropped on decode).
    """

    payload = {
        "trustRecordId": "tr-001",
        "businessTransactionId": "tx-001",
        "transaction": {
            "businessTransactionId": "tx-001",
            "metadata": {
                "businessTransactionId": "tx-001",
                "correlationId": "corr-001",
                "tenantId": None,
                "sourceSystem": "pytest",
                "submittedBy": "tester",
                "submittedAt": "2026-07-01T00:00:00Z",
            },
            "authority": {
                "authorityId": "authority-001",
                "authorityType": "SERVICE",
                "principalId": "pytest",
                "displayName": "PyTest",
                "issuedAt": "2026-07-01T00:00:00Z",
            },
            "authorization": {
                "authorizationId": "authz-001",
                "authorityId": "authority-001",
                "purpose": "Unit Test",
                "issuedAt": "2026-07-01T00:00:00Z",
            },
            "intent": {
                "intentId": "intent-001",
                "authorizationId": "authz-001",
                "action": "VendorPayment",
                "target": "vendor/1",
                "parameters": {
                    "amount": 100,
                },
                "createdAt": "2026-07-01T00:00:00Z",
            },
            "policy": {
                "name": "vendor-payment",
                "version": "1.0.0",
                "schemaVersion": "1.0.0",
            },
            "signals": {
                "approved": True,
            },
            "status": "RECEIVED",
            "createdAt": "2026-07-01T00:00:00Z",
        },
        "overrides": [],
        "executions": [],
        "verifications": [
            {
                "verificationId": "verification-001",
                "businessTransactionId": "tx-001",
                "status": "VERIFIED",
                "message": "Execution Trust Record verified successfully.",
                "verifiedAt": "2026-07-01T00:05:00Z",
                "trustRecordHash": "abc123",
            },
        ],
        "receipts": [],
        "trustRecordHash": "abc123",
        #
        # Required per packages/shared/src/domain/execution-trust-record.ts:84.
        # A previous SDK version had no model field for this at all, so it
        # was silently dropped on every decode.
        #
        "signature": {
            "algorithm": "ed25519",
            "keyId": "parmana-signing-key-001",
            "value": "c2lnbmF0dXJlLWJ5dGVzLWJhc2U2NA==",
            "signedAt": "2026-07-01T00:05:01Z",
        },
        "createdAt": "2026-07-01T00:00:00Z",
        "updatedAt": "2026-07-01T00:00:00Z",
    }

    record = decode(
        payload,
        ExecutionTrustRecord,
    )

    assert isinstance(
        record,
        ExecutionTrustRecord,
    )

    assert record.trust_record_id == "tr-001"

    assert record.business_transaction_id == "tx-001"

    assert record.transaction.business_transaction_id == "tx-001"

    assert record.transaction.metadata.correlation_id == "corr-001"

    assert record.transaction.authority.authority_id == "authority-001"

    assert record.transaction.authorization.authorization_id == "authz-001"

    assert record.transaction.intent.intent_id == "intent-001"

    assert record.transaction.policy.schema_version == "1.0.0"

    assert record.trust_record_hash == "abc123"

    #
    # The trust record signature must survive decoding.
    #
    assert record.signature is not None

    assert record.signature.algorithm == SignatureAlgorithm.ED25519

    #
    # Must be a real enum member, not the raw wire string -- otherwise
    # isinstance() checks downstream silently fail even though string
    # equality happens to still hold for str-mixin enums.
    #
    assert isinstance(record.signature.algorithm, SignatureAlgorithm)

    assert record.signature.key_id == "parmana-signing-key-001"

    assert record.signature.value == "c2lnbmF0dXJlLWJ5dGVzLWJhc2U2NA=="

    assert isinstance(
        record.signature.signed_at,
        datetime,
    )

    assert record.verifications[0].status == VerificationStatus.VERIFIED

    assert isinstance(record.verifications[0].status, VerificationStatus)

    assert isinstance(
        record.created_at,
        datetime,
    )

    assert isinstance(
        record.updated_at,
        datetime,
    )


def test_decode_override_maps_approved_by():
    """
    Real wire shape per packages/shared/src/domain/override.ts.

    Regression test: a previous SDK version modeled this field as
    `authority_id`, which does not exist on the wire (the real field is
    `approvedBy`) -- so `decode()` silently produced `authority_id=None`
    on every real response, discarding who actually approved the override.
    """

    payload = {
        "overrideId": "override-001",
        "businessTransactionId": "tx-001",
        "approvedBy": "manager-001",
        "reason": "Regional manager approved the exception.",
        "justification": "Vendor delivery deadline required an exception.",
        "approvedAt": "2026-07-01T00:10:00Z",
    }

    override = decode(
        payload,
        Override,
    )

    assert isinstance(
        override,
        Override,
    )

    assert override.approved_by == "manager-001"

    assert override.reason == ("Regional manager approved the exception.")

    assert override.justification == ("Vendor delivery deadline required an exception.")

    assert isinstance(
        override.approved_at,
        datetime,
    )


def test_decode_execution_includes_evidence_and_metadata():
    """
    Real wire shape per packages/shared/src/domain/execution.ts and
    execution-evidence.ts.

    Regression test: a previous SDK version had no `completed_at`,
    `evidence`, or `metadata` fields on Execution at all, so this
    information -- what the enterprise execution system actually did --
    was unreachable from the decoded model.
    """

    payload = {
        "executionId": "exec-001",
        "businessTransactionId": "tx-001",
        "decision": {
            "decisionId": "decision-001",
            "intentId": "intent-001",
            "policy": {
                "name": "vendor-payment",
                "version": "1.0.0",
                "schemaVersion": "1.0.0",
            },
            "signals": {
                "approved": True,
            },
            "outcome": "APPROVED",
            "reason": "Signals satisfied policy.",
            "evaluatedAt": "2026-07-01T00:02:00Z",
        },
        "status": "COMPLETED",
        "mode": "SYNC",
        "startedAt": "2026-07-01T00:02:01Z",
        "completedAt": "2026-07-01T00:02:03Z",
        "evidence": {
            "businessTransactionId": "tx-001",
            "action": "VendorPayment",
            "target": "vendor/1",
            "parameters": {
                "amount": 100,
            },
            "success": True,
            "executedAt": "2026-07-01T00:02:02Z",
            "attributes": {
                "paymentReference": "PG-000001",
            },
        },
        "metadata": {
            "executor": "payment-service",
        },
    }

    execution = decode(
        payload,
        Execution,
    )

    assert isinstance(
        execution,
        Execution,
    )

    assert isinstance(
        execution.completed_at,
        datetime,
    )

    assert execution.evidence is not None

    assert execution.evidence.success is True

    assert execution.evidence.attributes == {
        "paymentReference": "PG-000001",
    }

    assert execution.metadata == {
        "executor": "payment-service",
    }
