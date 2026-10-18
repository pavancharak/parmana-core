from __future__ import annotations

import json
from pathlib import Path

from parmana.api.execution_intent_api import ExecutionIntentApi
from parmana.models.execution_intent import (
    ExecutionIntentFinalizationMode,
    ExecutionIntentResolution,
    ExecutionIntentState,
)
from parmana.models.execution_intent_results import (
    ExecutionIntentView,
    FinalizeExecutionIntentResult,
    ResolveExecutionIntentResult,
    UnfinalizedExecutionIntents,
)
from parmana.serialization import decode, encode

FIXTURES = Path(__file__).parent / "fixtures"

# A real intent, signed by the real server code path (see the fixture's origin
# in python/tests/test_offline_intent_verifier.py), wrapped the way
# GET /execution-intents/{id} returns it.
SERVER_INTENT = json.loads(
    (FIXTURES / "execution-intent-server-signed.json").read_text(encoding="utf-8")
)

VIEW_JSON = {
    "intent": SERVER_INTENT,
    "status": {
        "state": "FINALIZED",
        "releasedAt": "2026-09-21T05:40:32.743Z",
        "finalizedAt": "2026-09-21T05:40:32.855Z",
        "finalizationMode": "INLINE",
        "trustRecordId": "a3c8d068-af6a-46c7-9976-e43612d5ab9c",
    },
}


class FakeTransport:
    def __init__(self, response=None):
        self.method = None
        self.path = None
        self.body = None
        self.response_model = None
        self._response = response

    def send(self, *, method, path, body=None, response_model=None):
        self.method = method
        self.path = path
        self.body = body
        self.response_model = response_model

        return self._response


def _decoded_view() -> ExecutionIntentView:
    return decode(VIEW_JSON, ExecutionIntentView)


def test_decoding_a_real_response_gives_typed_enums_and_datetimes():
    view = _decoded_view()

    assert view.status.state is ExecutionIntentState.FINALIZED
    assert view.status.finalization_mode is ExecutionIntentFinalizationMode.INLINE
    assert view.status.released_at.isoformat().startswith("2026-09-21T05:40:32.743")
    assert view.intent.business_transaction_id == SERVER_INTENT["businessTransactionId"]
    assert view.intent.signature.key_id == "default"


def test_a_decoded_intent_encodes_back_to_exactly_what_the_server_signed():
    # verify() sends a decoded intent straight back to the server, which
    # re-hashes whatever bytes it receives. Any formatting difference in a
    # timestamp, or a stray null, would fail a genuine intent. This proves the
    # round trip is exact for a real, server signed intent.
    view = _decoded_view()

    assert encode(view.intent) == SERVER_INTENT


def test_verify_sends_post_execution_intents_verify_with_the_intent_as_body():
    transport = FakeTransport(response={"valid": True})

    valid = ExecutionIntentApi(transport).verify(_decoded_view().intent)

    assert transport.method == "POST"
    assert transport.path == "/execution-intents/verify"
    assert transport.body == SERVER_INTENT
    assert transport.response_model is None
    assert valid is True


def test_verify_returns_false_not_just_a_truthy_body_for_an_invalid_signature():
    transport = FakeTransport(response={"valid": False})

    assert ExecutionIntentApi(transport).verify(_decoded_view().intent) is False


def test_get_sends_get_and_decodes_into_an_intent_view():
    transport = FakeTransport(response="decoded")

    result = ExecutionIntentApi(transport).get("tx-1")

    assert transport.method == "GET"
    assert transport.path == "/execution-intents/tx-1"
    assert transport.response_model is ExecutionIntentView
    assert result == "decoded"


def test_get_quotes_an_id_that_is_not_safe_in_a_path():
    transport = FakeTransport()

    ExecutionIntentApi(transport).get("a/b c")

    assert transport.path == "/execution-intents/a%2Fb%20c"


def test_list_unfinalized_sends_get_with_no_limit_by_default():
    transport = FakeTransport()

    ExecutionIntentApi(transport).list_unfinalized()

    assert transport.method == "GET"
    assert transport.path == "/execution-intents/unfinalized"
    assert transport.response_model is UnfinalizedExecutionIntents


def test_list_unfinalized_passes_the_limit_as_a_query_parameter():
    transport = FakeTransport()

    ExecutionIntentApi(transport).list_unfinalized(25)

    assert transport.path == "/execution-intents/unfinalized?limit=25"


def test_finalize_sends_post_finalize_and_decodes_the_result():
    transport = FakeTransport()

    ExecutionIntentApi(transport).finalize("tx-1")

    assert transport.method == "POST"
    assert transport.path == "/execution-intents/tx-1/finalize"
    assert transport.body is None
    assert transport.response_model is FinalizeExecutionIntentResult


def test_resolve_sends_the_resolution_and_the_note():
    transport = FakeTransport()

    ExecutionIntentApi(transport).resolve(
        "tx-1",
        resolution=ExecutionIntentResolution.NOT_EXECUTED,
        note="Checked the connector.",
    )

    assert transport.method == "POST"
    assert transport.path == "/execution-intents/tx-1/resolve"
    assert transport.body == {
        "resolution": "NOT_EXECUTED",
        "note": "Checked the connector.",
    }
    assert transport.response_model is ResolveExecutionIntentResult


def test_resolve_accepts_the_resolution_as_a_plain_string():
    transport = FakeTransport()

    ExecutionIntentApi(transport).resolve("tx-1", resolution="EXECUTED", note="It ran.")

    assert transport.body == {"resolution": "EXECUTED", "note": "It ran."}


def test_resolve_result_decodes_a_resolved_status():
    body = {
        "outcome": "RESOLVED",
        "businessTransactionId": "tx-1",
        "intent": SERVER_INTENT,
        "status": {
            "state": "RESOLVED",
            "failureReason": "fetch failed",
            "resolution": "NOT_EXECUTED",
            "resolutionNote": "Nothing was released.",
            "resolvedBy": "operator-1",
            "resolvedAt": "2026-09-21T06:20:25.903Z",
        },
    }

    result = decode(body, ResolveExecutionIntentResult)

    assert result.outcome == "RESOLVED"
    assert result.status.state is ExecutionIntentState.RESOLVED
    assert result.status.resolution is ExecutionIntentResolution.NOT_EXECUTED
    assert result.status.resolved_by == "operator-1"
    assert result.status.resolved_at.isoformat().startswith("2026-09-21T06:20:25.903")
