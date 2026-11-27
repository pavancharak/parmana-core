"""
Schema version 3 (whole-record) verification in the Python SDK, under decision D24.

The fixture under tests/fixtures/server-signed-v3/ was written by
parmana-core's scripts/generate-whole-record-v3-fixture.ts, which signs with the
server's own signing code (VerificationCrypto.signWholeRecord), not by hand.
Schema version 3 only: there is no legacy signature, and schema version 2 is refused.
"""

import json
from pathlib import Path

from parmana.crypto.offline_verifier import verify_execution_trust_record_offline

FIXTURE = Path(__file__).parent / "fixtures" / "server-signed-v3"
CUTOVER_BEFORE_RECORD = "2000-01-01T00:00:00Z"
CUTOVER_AFTER_RECORD = "2999-01-01T00:00:00Z"


def _load(name: str):
    return json.loads((FIXTURE / name).read_text(encoding="utf-8"))


def _public_keys():
    trust = _load("trust.json")
    return {key["keyId"]: key["publicKeyPem"] for key in trust["keys"]}


def test_server_signed_v3_record_verifies():
    result = verify_execution_trust_record_offline(_load("record.json"), _public_keys())

    assert result.valid, result.errors
    assert result.hybrid_signatures_valid is True
    assert set(result.algorithms_checked) == {"ed25519", "dilithium3"}


def test_a_field_added_after_signing_is_rejected():
    record = {**_load("record.json"), "addedAfterSigning": "x"}

    result = verify_execution_trust_record_offline(record, _public_keys())

    assert result.valid is False
    assert result.hybrid_signatures_valid is False


def test_a_changed_value_is_rejected():
    record = _load("record.json")
    record["transaction"]["signals"]["amount"] = 999

    result = verify_execution_trust_record_offline(record, _public_keys())

    assert result.valid is False


def test_a_schema_version_2_record_is_refused():
    record = {**_load("record.json"), "schemaVersion": 2}

    result = verify_execution_trust_record_offline(record, _public_keys())

    assert result.valid is False
    assert any("only schemaVersion 3" in error for error in result.errors)


def test_a_two_entry_record_at_or_after_the_cutover_is_accepted():
    result = verify_execution_trust_record_offline(
        _load("record.json"),
        _public_keys(),
        hybrid_required_from=CUTOVER_BEFORE_RECORD,
    )

    assert result.valid, result.errors


def test_a_single_entry_record_at_or_after_the_cutover_is_refused():
    record = _load("record.json")
    record["signatures"] = record["signatures"][:1]

    result = verify_execution_trust_record_offline(
        record, _public_keys(), hybrid_required_from=CUTOVER_BEFORE_RECORD
    )

    assert result.valid is False
    assert any("must carry both hybrid signatures" in e for e in result.errors)


def test_a_single_valid_entry_before_the_cutover_is_accepted():
    record = _load("record.json")
    record["signatures"] = record["signatures"][:1]

    result = verify_execution_trust_record_offline(
        record, _public_keys(), hybrid_required_from=CUTOVER_AFTER_RECORD
    )

    assert result.valid, result.errors
