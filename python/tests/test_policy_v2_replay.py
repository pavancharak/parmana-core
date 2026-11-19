from __future__ import annotations

from parmana import ParmanaClient
from parmana.api.policy_v2_api import PolicyV2Api
from parmana.models.policy_v2 import PolicyV2ReplayResult


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


def test_replay_reads_the_result_of_a_recorded_decision():
    client, transport = client_with(
        {
            "reproduced": True,
            "differences": [],
            "replayed": {"outcome": "APPROVE", "recordId": "rec_1"},
        }
    )

    result = client.policy_v2_replay("rec_1")

    assert isinstance(result, PolicyV2ReplayResult)
    assert result.reproduced is True
    assert result.differences == []
    assert result.replayed == {"outcome": "APPROVE", "recordId": "rec_1"}
    assert transport.calls == [("GET", "/v2/evidence/rec_1/replay", None)]


def test_replay_reports_what_differed_when_it_did_not_reproduce():
    client, _ = client_with(
        {"reproduced": False, "differences": ["outcome changed from APPROVE to REJECT"]}
    )

    result = client.policy_v2_replay("rec_2")

    assert result.reproduced is False
    assert result.replayed is None
    assert len(result.differences) == 1


def test_replay_encodes_the_record_id_in_the_path():
    client, transport = client_with({"reproduced": True, "differences": []})

    client.policy_v2_replay("a/b c")

    assert transport.calls[0][1] == "/v2/evidence/a%2Fb%20c/replay"
