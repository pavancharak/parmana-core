"""
Schema version 3 (whole-record) hybrid verification in the Python SDK.

The fixture under tests/fixtures/server-signed-v3/ was written by
parmana-core's scripts/generate-whole-record-v3-fixture.ts, which signs with the
server's own signing code, not by hand.
"""

import json
from pathlib import Path

from parmana.crypto.offline_verifier import verify_execution_trust_record_offline

FIXTURE = Path(__file__).parent / "fixtures" / "server-signed-v3"


def _load(name: str):
    return json.loads((FIXTURE / name).read_text(encoding="utf-8"))


def _public_keys():
    trust = _load("trust.json")
    return {key["keyId"]: key["publicKeyPem"] for key in trust["keys"]}


def test_server_signed_v3_hybrid_record_verifies_with_full_coverage():
    result = verify_execution_trust_record_offline(_load("record.json"), _public_keys())

    assert result.valid, result.errors
    assert result.hybrid_signatures_valid is True
    assert result.coverage == "full"
    assert set(result.algorithms_checked) == {"ed25519", "dilithium3"}


def test_a_field_added_after_signing_is_rejected():
    record = {**_load("record.json"), "addedAfterSigning": "x"}

    result = verify_execution_trust_record_offline(record, _public_keys())

    assert result.valid is False
    assert result.hybrid_signatures_valid is False
    assert result.coverage == "legacy"


def test_a_changed_value_is_rejected():
    record = _load("record.json")
    record["transaction"]["signals"]["amount"] = 999

    result = verify_execution_trust_record_offline(record, _public_keys())

    assert result.valid is False
