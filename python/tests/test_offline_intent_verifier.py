"""
Cross-language determinism proof for Execution Intents (ADR-0012).

Two independent proofs that the Python offline verifier agrees with the server:

1. A REAL intent signed by the real server code path, taken from a live run of
   the production Docker image against a real Postgres (the sandbox rig,
   2026-09-21), with its public key. Nothing in this repository fabricated it.
2. Intents signed by the real TypeScript signer (scripts/generate-offline-
   intent-fixture.ts) as a subprocess, including a non ASCII target and an
   intent with no optional fields, so the canonical serializer and the omission
   rule are both exercised.

If the two languages ever disagreed on byte representation, a genuinely valid
signature would fail to verify here.
"""

from __future__ import annotations

import copy
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

from parmana.crypto import verify_execution_intent_offline

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).parent / "fixtures"

SERVER_INTENT = json.loads(
    (FIXTURES / "execution-intent-server-signed.json").read_text(encoding="utf-8")
)
# The public key of that server. It is a public key, so it is safe to keep in the
# test itself. It is NOT a fixture file on purpose: the repository ignores *.pem,
# so a fixture with that name is silently left out of commits and only fails in CI.
SERVER_KEY = (
    "-----BEGIN PUBLIC KEY-----\n"
    "MCowBQYDK2VwAyEACk6S6j13E+EIdvTezLLwosO4fohNZkhF/j+6FTk6LVI=\n"
    "-----END PUBLIC KEY-----\n"
)


def _npx_available() -> bool:
    return shutil.which("npx") is not None


def test_a_real_server_signed_intent_verifies_with_only_the_public_key():
    result = verify_execution_intent_offline(SERVER_INTENT, {"default": SERVER_KEY})

    assert result.valid is True
    assert result.hash_valid is True
    assert result.legacy_signature_valid is True
    assert result.errors == []
    assert result.algorithms_checked == ["ed25519"]


@pytest.mark.parametrize(
    "field,value",
    [
        ("action", "paytm:cancel"),
        ("target", "ATTACKER-CONTROLLED-ACCOUNT"),
        ("authorizationId", "another-authorization"),
        ("businessTransactionHash", "0" * 64),
        ("policyVersion", "9.9.9"),
        ("createdAt", "2026-01-01T00:00:00.000Z"),
    ],
)
def test_altering_any_signed_field_fails_both_the_hash_and_the_signature(field, value):
    tampered = copy.deepcopy(SERVER_INTENT)
    tampered[field] = value

    result = verify_execution_intent_offline(tampered, {"default": SERVER_KEY})

    assert result.valid is False
    assert result.hash_valid is False
    assert result.legacy_signature_valid is False


def test_the_unsigned_fields_are_not_part_of_what_is_signed():
    # intentHash and signature are computed FROM the signed projection, and an
    # unrelated extra key on the object must not change the outcome.
    with_extra = copy.deepcopy(SERVER_INTENT)
    with_extra["somethingElse"] = "ignored"

    assert (
        verify_execution_intent_offline(with_extra, {"default": SERVER_KEY}).valid
        is True
    )


def test_a_different_public_key_fails_the_signature_but_not_the_hash():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import (
        Encoding,
        PublicFormat,
    )

    other = (
        Ed25519PrivateKey.generate()
        .public_key()
        .public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
        .decode("utf-8")
    )

    result = verify_execution_intent_offline(SERVER_INTENT, {"default": other})

    assert result.valid is False
    assert result.hash_valid is True
    assert result.legacy_signature_valid is False


def test_a_missing_public_key_for_the_key_id_is_reported():
    result = verify_execution_intent_offline(SERVER_INTENT, {})

    assert result.valid is False
    assert 'no public key supplied for keyId "default"' in " ".join(result.errors)


def test_an_unsupported_algorithm_is_reported_and_not_verified():
    other = copy.deepcopy(SERVER_INTENT)
    other["signature"]["algorithm"] = "dilithium3"

    result = verify_execution_intent_offline(other, {"default": SERVER_KEY})

    assert result.valid is False
    assert "unsupported algorithm: dilithium3." in result.errors


@pytest.mark.skipif(not _npx_available(), reason="npx not available on PATH")
def test_intents_signed_by_the_real_typescript_signer_verify_in_python():
    with tempfile.TemporaryDirectory() as out_dir:
        completed = subprocess.run(
            ["npx", "tsx", "scripts/generate-offline-intent-fixture.ts", out_dir],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=90,
            shell=(sys.platform == "win32"),
        )

        assert completed.returncode == 0, completed.stderr

        key = (Path(out_dir) / "public-key.pem").read_text(encoding="utf-8")
        keys = {"cross-language-intent-fixture": key}

        for name in ("intent.json", "intent-minimal.json"):
            intent = json.loads((Path(out_dir) / name).read_text(encoding="utf-8"))

            result = verify_execution_intent_offline(intent, keys)

            assert result.valid is True, (name, result.errors)

        full = json.loads((Path(out_dir) / "intent.json").read_text(encoding="utf-8"))

        # The fixture deliberately contains non ASCII text, which is exactly
        # where a canonical serializer written in a second language goes wrong.
        assert "café" in full["target"]

        tampered = copy.deepcopy(full)
        tampered["target"] = "order-cafe-1001"

        assert verify_execution_intent_offline(tampered, keys).valid is False
