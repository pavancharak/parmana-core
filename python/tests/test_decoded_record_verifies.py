"""
G-85: a record decoded by the SDK verifies offline exactly as its raw JSON does.

The server sends `executions[0].previousChainHash: null`. The decoded model
used to drop that null when encoded again, which changed the canonical hash,
so verify_execution_trust_record_offline() rejected an intact record. The
record below is the real one from the public sandbox's live check
(deploy/sandbox/evidence/check-record.json), with the sandbox's public key
from GET https://parmana-sandbox.vercel.app/keys/default.
"""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path

from parmana import ExecutionTrustRecord
from parmana.crypto import verify_execution_trust_record_offline
from parmana.serialization import decode, encode

REPO_ROOT = Path(__file__).resolve().parents[2]
RECORD = json.loads(
    (REPO_ROOT / "deploy" / "sandbox" / "evidence" / "check-record.json").read_text(
        encoding="utf-8"
    )
)
SANDBOX_DEFAULT_PUBLIC_KEY = (
    "-----BEGIN PUBLIC KEY-----\n"
    "MCowBQYDK2VwAyEAST3Fm9eSnXiX6XERfqlXW1zXtfHwFWUEgmZbPxPcjLc=\n"
    "-----END PUBLIC KEY-----\n"
)
KEYS = {"default": SANDBOX_DEFAULT_PUBLIC_KEY}


def test_the_record_carries_an_explicit_null() -> None:
    assert "previousChainHash" in RECORD["executions"][0]
    assert RECORD["executions"][0]["previousChainHash"] is None


def test_the_raw_json_verifies() -> None:
    assert verify_execution_trust_record_offline(RECORD, KEYS).valid


def test_the_decoded_model_verifies() -> None:
    model = decode(RECORD, ExecutionTrustRecord)

    result = verify_execution_trust_record_offline(model, KEYS)

    assert result.valid, result.errors


def test_a_decoded_model_encodes_back_to_the_servers_json() -> None:
    assert encode(decode(RECORD, ExecutionTrustRecord)) == RECORD


def test_encoding_returns_a_copy_so_the_model_cannot_be_changed_through_it() -> None:
    model = decode(RECORD, ExecutionTrustRecord)

    encode(model)["trustRecordHash"] = "0" * 64

    assert verify_execution_trust_record_offline(model, KEYS).valid


def test_a_changed_model_is_encoded_from_its_fields_and_fails() -> None:
    model = decode(RECORD, ExecutionTrustRecord)
    changed = dataclasses.replace(model, trust_record_hash="0" * 64)

    assert not verify_execution_trust_record_offline(changed, KEYS).valid
