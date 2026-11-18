from __future__ import annotations

from parmana import ParmanaClient
from parmana.api.policy_v2_api import PolicyV2Api
from parmana.models.policy_v2 import (
    PolicyV2Decision,
    PolicyV2ReviewDecision,
    PolicyV2ReviewView,
)


class FakeTransport:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def send(
        self,
        *,
        method,
        path,
        body=None,
        response_model=None,
        non_throwing_statuses=frozenset(),
    ):
        self.calls.append((method, path, body))
        return self.response


def client_with(response):
    """A client whose policy version 2 API sends through a fake transport."""
    transport = FakeTransport(response)
    client = ParmanaClient(endpoint="http://127.0.0.1:3000")
    client.policy_v2 = PolicyV2Api(transport)
    return client, transport


def test_decide_posts_camel_case_body_and_decodes_the_outcome():
    client, transport = client_with(
        {
            "outcome": "REVIEW",
            "reason": "Above the approval threshold.",
            "tier": "review",
            "recordId": "rec_1",
            "released": False,
            "reviewId": "item_1",
        }
    )

    decision = client.decide_policy_v2(
        capability="erp:pay-invoice",
        transaction_id="txn_1",
        target="erp",
        parameters={"amount": 100},
        signals={"vendor": "acme"},
    )

    assert isinstance(decision, PolicyV2Decision)
    assert decision.outcome == "REVIEW"
    assert decision.review_id == "item_1"
    assert decision.released is False
    assert transport.calls == [
        (
            "POST",
            "/v2/decisions",
            {
                "capability": "erp:pay-invoice",
                "transactionId": "txn_1",
                "target": "erp",
                "parameters": {"amount": 100},
                "signals": {"vendor": "acme"},
            },
        )
    ]


def test_decide_decodes_a_refusal_without_releasing():
    client, _ = client_with(
        {
            "outcome": "REJECT",
            "reason": "No approved policy.",
            "refusal": {
                "code": "NO_APPROVED_POLICY",
                "detail": "erp:pay-invoice",
            },
            "recordId": "rec_2",
            "released": False,
        }
    )

    decision = client.decide_policy_v2(
        capability="erp:pay-invoice",
        transaction_id="txn_2",
        target="erp",
    )

    assert decision.released is False
    assert decision.refusal is not None
    assert decision.refusal.code == "NO_APPROVED_POLICY"
    assert decision.refusal.errors is None


def test_review_reads_the_status_for_the_requester():
    client, transport = client_with({"status": "pending", "reasonCode": "UNDER_REVIEW"})

    view = client.policy_v2_review("item_1")

    assert view == PolicyV2ReviewView(status="pending", reason_code="UNDER_REVIEW")
    assert transport.calls == [("GET", "/v2/reviews/item_1", None)]


def test_review_encodes_the_item_id_in_the_path():
    client, transport = client_with({"status": "pending", "reasonCode": "UNDER_REVIEW"})

    client.policy_v2_review("a/b c")

    assert transport.calls[0][1] == "/v2/reviews/a%2Fb%20c"


def test_reviewer_approval_posts_the_decision():
    client, transport = client_with(
        {
            "itemId": "item_1",
            "status": "approved",
            "final": False,
            "decisionsRecorded": 1,
        }
    )

    result = client.decide_policy_v2_review("item_1", "approve")

    assert isinstance(result, PolicyV2ReviewDecision)
    assert result.final is False
    assert result.decisions_recorded == 1
    assert transport.calls == [
        ("POST", "/v2/reviews/item_1/decision", {"decision": "approve"})
    ]


def test_reviewer_rejection_decodes_the_final_outcome():
    client, _ = client_with(
        {
            "itemId": "item_1",
            "status": "refused",
            "final": True,
            "outcome": "REFUSED",
            "decisionsRecorded": 1,
        }
    )

    result = client.decide_policy_v2_review("item_1", "reject")

    assert result.final is True
    assert result.outcome == "REFUSED"
