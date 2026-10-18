"""
Cross-language determinism proof (PQC audit Layer 5).

Spawns the real TypeScript signer (scripts/generate-offline-verifier-
fixture.ts -- the real VerificationCrypto, the real CanonicalSerializer,
a real Ed25519 signature) as a subprocess, then verifies its output
using ONLY this SDK's own Python OfflineVerifier -- a completely
independent reimplementation of the canonical serialization algorithm
and Ed25519 verification. If the two languages ever disagreed on byte
representation (the exact AMBER gap this test closes), the signature
would fail to verify here even though it is genuinely valid.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

from parmana.crypto import verify_execution_trust_record_offline

REPO_ROOT = Path(__file__).resolve().parents[2]


def _npx_available() -> bool:
    return shutil.which("npx") is not None


def _run_fixture_generator(out_dir: str) -> subprocess.CompletedProcess[str]:
    # shell=True on Windows is what actually resolves "npx" to
    # npx.cmd; without it, CreateProcess cannot find the executable
    # even though shutil.which() locates it.
    return subprocess.run(
        ["npx", "tsx", "scripts/generate-offline-verifier-fixture.ts", out_dir],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
        shell=(sys.platform == "win32"),
    )


@pytest.mark.skipif(not _npx_available(), reason="npx not available on PATH")
def test_python_verifier_accepts_a_typescript_signed_record() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        result = _run_fixture_generator(tmp)

        assert result.returncode == 0, result.stderr

        record = json.loads((Path(tmp) / "record.json").read_text(encoding="utf-8"))
        public_key_pem = (Path(tmp) / "public-key.pem").read_text(encoding="utf-8")

        verification = verify_execution_trust_record_offline(
            record,
            {"cross-language-fixture": public_key_pem},
        )

        assert verification.valid is True
        assert verification.hash_valid is True
        assert verification.legacy_signature_valid is True
        assert verification.errors == []
        assert "ed25519" in verification.algorithms_checked


@pytest.mark.skipif(not _npx_available(), reason="npx not available on PATH")
def test_python_verifier_rejects_a_tampered_typescript_signed_record() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        result = _run_fixture_generator(tmp)

        assert result.returncode == 0, result.stderr

        record = json.loads((Path(tmp) / "record.json").read_text(encoding="utf-8"))
        public_key_pem = (Path(tmp) / "public-key.pem").read_text(encoding="utf-8")

        record["transaction"]["signals"]["amount"] = 999999

        verification = verify_execution_trust_record_offline(
            record,
            {"cross-language-fixture": public_key_pem},
        )

        assert verification.valid is False
        assert verification.hash_valid is False


@pytest.mark.skipif(not _npx_available(), reason="npx not available on PATH")
def test_python_verifier_accepts_a_large_record_signed_as_a_kms_commitment() -> None:
    # The TypeScript fixture signs this record the way the KMS signer signs a
    # message over 4096 bytes (a fixed size commitment, not the raw bytes).
    with tempfile.TemporaryDirectory() as tmp:
        result = _run_fixture_generator(tmp)

        assert result.returncode == 0, result.stderr

        record = json.loads(
            (Path(tmp) / "record-large.json").read_text(encoding="utf-8")
        )
        public_key_pem = (Path(tmp) / "public-key.pem").read_text(encoding="utf-8")

        verification = verify_execution_trust_record_offline(
            record,
            {"cross-language-fixture": public_key_pem},
        )

        assert verification.valid is True
        assert verification.hash_valid is True
        assert verification.legacy_signature_valid is True
        assert verification.errors == []


@pytest.mark.skipif(not _npx_available(), reason="npx not available on PATH")
def test_python_verifier_rejects_a_tampered_large_commitment_signed_record() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        result = _run_fixture_generator(tmp)

        assert result.returncode == 0, result.stderr

        record = json.loads(
            (Path(tmp) / "record-large.json").read_text(encoding="utf-8")
        )
        public_key_pem = (Path(tmp) / "public-key.pem").read_text(encoding="utf-8")

        record["transaction"]["signals"]["amount"] = 999999

        verification = verify_execution_trust_record_offline(
            record,
            {"cross-language-fixture": public_key_pem},
        )

        assert verification.valid is False


def test_commitment_signature_over_a_small_message_is_rejected() -> None:
    # No downgrade: a commitment signature is only accepted for a message
    # over the KMS raw limit.
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from parmana.crypto.offline_verifier import (
        _commitment_message,
        _verify_ed25519_with_commitment,
    )

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    small = b"x" * 4096
    large = b"x" * 4097

    _verify_ed25519_with_commitment(public_key, private_key.sign(small), small)
    _verify_ed25519_with_commitment(public_key, private_key.sign(large), large)
    _verify_ed25519_with_commitment(
        public_key, private_key.sign(_commitment_message(large)), large
    )

    with pytest.raises(InvalidSignature):
        _verify_ed25519_with_commitment(
            public_key, private_key.sign(_commitment_message(small)), small
        )

    with pytest.raises(InvalidSignature):
        _verify_ed25519_with_commitment(
            public_key, private_key.sign(_commitment_message(large)), large + b"y"
        )
