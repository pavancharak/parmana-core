"""
verify_parmana_release against releases signed by the real server code
(ADR-0013): scripts/generate-external-release-fixture.ts runs
GatewayExternalAdapter with the production file signer, and once more
signing over the commitment as KmsSigner does for a release over 4096
bytes. This test signs no release itself except to prove a wrong key is
refused.
"""

from __future__ import annotations

import base64
import copy
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from parmana.crypto import canonical_serialize, verify_parmana_release

REPO_ROOT = Path(__file__).resolve().parents[2]


def _npx_available() -> bool:
    return shutil.which("npx") is not None


pytestmark = pytest.mark.skipif(
    not _npx_available(), reason="npx not available on PATH"
)


@pytest.fixture(scope="module")
def fixture() -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as out_dir:
        completed = subprocess.run(
            ["npx", "tsx", "scripts/generate-external-release-fixture.ts", out_dir],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            shell=(sys.platform == "win32"),
        )

        assert completed.returncode == 0, completed.stderr

        out = Path(out_dir)
        meta = json.loads((out / "fixture.json").read_text(encoding="utf-8"))

        return {
            "release": json.loads((out / "release.json").read_text(encoding="utf-8")),
            "large": json.loads(
                (out / "release-large.json").read_text(encoding="utf-8")
            ),
            "keys": {
                "external-release-fixture": (out / "public-key.pem").read_text(
                    encoding="utf-8"
                )
            },
            "audience": meta["audience"],
            "now": datetime.fromisoformat(meta["now"].replace("Z", "+00:00")),
        }


def _verify(fixture: dict[str, Any], body: Any, **overrides: Any):
    options: dict[str, Any] = {
        "public_keys": fixture["keys"],
        "audience": fixture["audience"],
        "now": fixture["now"],
        "is_already_executed": lambda _id: False,
    }
    options.update(overrides)
    return verify_parmana_release(body, **options)


def test_accepts_a_release_the_server_signed(fixture):
    result = _verify(fixture, fixture["release"])

    assert result.valid is True, result.errors
    assert result.already_executed is False
    assert result.errors == []
    assert result.release["businessTransactionId"] == "fixture-bt-1"
    assert result.release["target"] == "customer-café-42"
    assert result.release["parameters"] == {"amount": 1200, "currency": "INR"}
    assert result.release["approvedBy"] == [
        {
            "approverId": "manager-x",
            "keyId": "manager-x-key-1",
            "approvalId": "fixture-approval",
        }
    ]


def test_accepts_a_release_over_4096_bytes_signed_over_the_commitment(fixture):
    assert len(canonical_serialize(fixture["large"]["release"])) > 4096

    result = _verify(fixture, fixture["large"])

    assert result.valid is True, result.errors


def test_reports_already_executed_asking_only_after_every_other_check(fixture):
    asked: list[str] = []

    def is_already_executed(business_transaction_id: str) -> bool:
        asked.append(business_transaction_id)
        return True

    result = _verify(
        fixture, fixture["release"], is_already_executed=is_already_executed
    )

    assert result.valid is True
    assert result.already_executed is True
    assert asked == ["fixture-bt-1"]

    _verify(
        fixture,
        fixture["release"],
        is_already_executed=is_already_executed,
        audience="https://other.example.com/r",
    )
    assert asked == ["fixture-bt-1"]


def test_refuses_a_changed_release(fixture):
    changed = copy.deepcopy(fixture["release"])
    changed["release"]["parameters"]["amount"] = 999999

    result = _verify(fixture, changed)

    assert result.valid is False
    assert result.errors == ["the signature does not verify"]


def test_refuses_a_release_signed_with_another_key(fixture):
    forged = copy.deepcopy(fixture["release"])
    forged["signature"]["value"] = base64.b64encode(
        Ed25519PrivateKey.generate().sign(canonical_serialize(forged["release"]))
    ).decode("ascii")

    result = _verify(fixture, forged)

    assert result.valid is False
    assert result.errors == ["the signature does not verify"]


def test_refuses_a_release_made_for_another_endpoint(fixture):
    result = _verify(
        fixture, fixture["release"], audience="https://erp.example.com/other"
    )

    assert result.valid is False
    assert result.errors == [
        'release.audience "https://erp.example.com/parmana/release" '
        "is not this endpoint (https://erp.example.com/other)"
    ]


def test_refuses_an_expired_release_allowing_30_seconds_of_skew(fixture):
    expires_at = datetime.fromisoformat(
        fixture["release"]["release"]["expiresAt"].replace("Z", "+00:00")
    )

    assert _verify(
        fixture, fixture["release"], now=expires_at + timedelta(seconds=29)
    ).valid

    late = _verify(fixture, fixture["release"], now=expires_at + timedelta(seconds=31))
    assert late.valid is False
    assert late.errors == ["the release expired at 2026-10-01T10:01:00.000Z"]

    assert _verify(
        fixture,
        fixture["release"],
        now=expires_at + timedelta(seconds=31),
        clock_skew_seconds=60,
    ).valid


def test_refuses_unknown_keys_algorithms_and_malformed_bodies_without_raising(fixture):
    assert _verify(fixture, fixture["release"], public_keys={}).errors == [
        "no public key supplied for keyId external-release-fixture"
    ]

    other = copy.deepcopy(fixture["release"])
    other["signature"]["algorithm"] = "ml-dsa-65"
    assert _verify(fixture, other).valid is False

    for body in (None, "x", [], {"release": {}}):
        assert _verify(fixture, body).valid is False


def test_lists_every_failed_check_in_order(fixture):
    changed = copy.deepcopy(fixture["release"])
    changed["release"]["audience"] = "https://evil.example.com/r"

    result = _verify(
        fixture,
        changed,
        now=datetime.fromisoformat("2030-01-01T00:00:00+00:00"),
    )

    assert result.valid is False
    assert result.errors == [
        "the signature does not verify",
        'release.audience "https://evil.example.com/r" '
        f'is not this endpoint ({fixture["audience"]})',
        "the release expired at 2026-10-01T10:01:00.000Z",
    ]


def test_refuses_another_release_version_and_missing_fields_naming_each(fixture):
    changed = copy.deepcopy(fixture["release"])
    changed["release"]["version"] = 2
    del changed["release"]["target"]
    changed["release"]["approvedBy"] = {}

    result = _verify(fixture, changed)

    assert result.valid is False
    for error in (
        "release.version is not 1",
        "release.target is not a string",
        "release.approvedBy is not an array",
    ):
        assert error in result.errors


def test_refuses_an_expiry_that_is_not_a_date(fixture):
    changed = copy.deepcopy(fixture["release"])
    changed["release"]["expiresAt"] = "soon"

    result = _verify(fixture, changed)

    assert "release.expiresAt is not a date" in result.errors
