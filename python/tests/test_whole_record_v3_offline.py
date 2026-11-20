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


def test_require_full_coverage_accepts_a_full_coverage_record():
    result = verify_execution_trust_record_offline(
        _load("record.json"), _public_keys(), require_full_coverage=True
    )

    assert result.valid, result.errors
    assert result.coverage == "full"


def test_a_legacy_record_is_valid_by_default_and_refused_with_require_full_coverage():
    # The record's own legacy signature still covers its seven fields, so
    # without the hybrid array it is a genuine schema 2 record.
    record = {**_load("record.json"), "schemaVersion": 2}
    record.pop("signatures", None)

    default = verify_execution_trust_record_offline(record, _public_keys())
    assert default.valid is True
    assert default.coverage == "legacy"

    strict = verify_execution_trust_record_offline(
        record, _public_keys(), require_full_coverage=True
    )
    assert strict.valid is False
    assert strict.coverage == "legacy"
    assert any("require_full_coverage" in error for error in strict.errors)
