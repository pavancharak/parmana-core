"""
examples/13_external_connector_endpoint.py against releases signed by the
real server code (scripts/generate-external-release-fixture.ts): the
endpoint acts once, answers a repeat with its first answer, and acts on
nothing it cannot verify.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = REPO_ROOT / "python" / "examples" / "13_external_connector_endpoint.py"

pytestmark = pytest.mark.skipif(
    shutil.which("npx") is None, reason="npx not available on PATH"
)


def _load_example() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "external_connector_endpoint", EXAMPLE
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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
            "key": (out / "public-key.pem").read_text(encoding="utf-8"),
            "audience": meta["audience"],
            "now": datetime.fromisoformat(meta["now"].replace("Z", "+00:00")),
        }


def _endpoint(fixture: dict[str, Any], audience: str | None = None):
    example = _load_example()
    acted: list[str] = []

    def act(release: dict[str, Any]) -> dict[str, Any]:
        acted.append(release["businessTransactionId"])
        return {"invoiceId": "INV-1", "amount": release["parameters"]["amount"]}

    handle = example.create_release_handler(
        public_keys={"external-release-fixture": fixture["key"]},
        audience=audience or fixture["audience"],
        act=act,
        now=lambda: fixture["now"],
    )

    return handle, acted


def test_acts_on_a_verified_release_and_answers_what_parmana_accepts(fixture):
    handle, acted = _endpoint(fixture)

    status, body = handle(fixture["release"])

    assert status == 200
    assert body["businessTransactionId"] == "fixture-bt-1"
    assert body["capability"] == "erp:create-invoice"
    assert body["success"] is True
    assert body["result"] == {"invoiceId": "INV-1", "amount": 1200}
    assert isinstance(body["executedAt"], str)
    assert acted == ["fixture-bt-1"]


def test_answers_a_repeated_release_with_its_first_answer_and_acts_once(fixture):
    handle, acted = _endpoint(fixture)

    first = handle(fixture["release"])
    again = handle(fixture["release"])

    assert again == first
    assert acted == ["fixture-bt-1"]


def test_acts_on_nothing_it_cannot_verify(fixture):
    handle, acted = _endpoint(fixture)

    changed = copy.deepcopy(fixture["release"])
    changed["release"]["parameters"]["amount"] = 999999

    for body in (changed, {"release": {}}, "not json", None):
        status, answer = handle(body)

        assert status == 401
        assert isinstance(answer["errors"], list)

    assert acted == []


def test_refuses_a_release_made_for_another_endpoint(fixture):
    handle, acted = _endpoint(
        fixture, audience="https://erp.example.com/another-endpoint"
    )

    status, answer = handle(fixture["release"])

    assert status == 401
    assert "is not this endpoint" in answer["errors"][0]
    assert acted == []
