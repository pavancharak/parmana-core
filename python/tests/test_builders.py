"""
create_business_transaction unit tests.

Proves the one property this builder exists for: every id pair
BusinessTransactionValidator cross-checks server-side
(packages/runtime/src/validators/BusinessTransactionValidator.ts) is
structurally consistent in the object this function produces, for
every call, not just by convention.
"""

from __future__ import annotations

import re

from parmana import (
    AuthorityType,
    PolicyReference,
    create_business_transaction,
)

BASE_KWARGS = dict(
    principal_id="e2e-test-agent",
    purpose="Unit test",
    action="paytm:refund",
    target="order-1",
    parameters={"orderId": "order-1", "transactionId": "txn-1", "amount": 5},
    policy=PolicyReference(
        name="customer-refund", version="1.0.0", schema_version="1.0.0"
    ),
    signals={
        "refundEligible": True,
        "managerApproved": True,
        "fraudCheckPassed": True,
        "refundAmount": 5,
    },
)

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def test_sets_metadata_business_transaction_id_equal_to_business_transaction_id():
    transaction = create_business_transaction(**BASE_KWARGS)

    assert (
        transaction.metadata.business_transaction_id
        == transaction.business_transaction_id
    )


def test_sets_authorization_authority_id_equal_to_authority_authority_id():
    transaction = create_business_transaction(**BASE_KWARGS)

    assert transaction.authorization.authority_id == transaction.authority.authority_id


def test_sets_intent_authorization_id_equal_to_authorization_authorization_id():
    transaction = create_business_transaction(**BASE_KWARGS)

    assert (
        transaction.intent.authorization_id
        == transaction.authorization.authorization_id
    )


def test_generates_a_fresh_valid_uuid_business_transaction_id_when_none_supplied():
    a = create_business_transaction(**BASE_KWARGS)
    b = create_business_transaction(**BASE_KWARGS)

    assert UUID_PATTERN.match(a.business_transaction_id)
    assert a.business_transaction_id != b.business_transaction_id


def test_uses_a_caller_supplied_business_transaction_id_verbatim():
    transaction = create_business_transaction(
        business_transaction_id="11111111-1111-4111-8111-111111111111",
        **BASE_KWARGS,
    )

    assert transaction.business_transaction_id == "11111111-1111-4111-8111-111111111111"
    assert (
        transaction.metadata.business_transaction_id
        == "11111111-1111-4111-8111-111111111111"
    )


def test_defaults_authority_type_to_service_never_agent():
    transaction = create_business_transaction(**BASE_KWARGS)

    assert transaction.authority.authority_type == AuthorityType.SERVICE


def test_accepts_an_explicit_authority_type_override():
    transaction = create_business_transaction(
        authority_type=AuthorityType.USER, **BASE_KWARGS
    )

    assert transaction.authority.authority_type == AuthorityType.USER


def test_passes_action_target_parameters_policy_signals_through_unchanged():
    transaction = create_business_transaction(**BASE_KWARGS)

    assert transaction.intent.action == "paytm:refund"
    assert transaction.intent.target == "order-1"
    assert transaction.intent.parameters == BASE_KWARGS["parameters"]
    assert transaction.policy == BASE_KWARGS["policy"]
    assert transaction.signals == BASE_KWARGS["signals"]


def test_includes_optional_metadata_fields_when_supplied():
    transaction = create_business_transaction(
        correlation_id="corr-1",
        tenant_id="tenant-1",
        source_system="unit-test",
        submitted_by="e2e-test-agent",
        **BASE_KWARGS,
    )

    assert transaction.metadata.correlation_id == "corr-1"
    assert transaction.metadata.tenant_id == "tenant-1"
    assert transaction.metadata.source_system == "unit-test"
    assert transaction.metadata.submitted_by == "e2e-test-agent"
