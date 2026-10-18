"""
Proves the documented quickstart (python/examples/quickstart/run.py)
actually works against a real running server -- not just that it
imports the SDK and compiles. Spawns the real @parmana/api server as a
subprocess, exactly like test_live_server_integration.py, but with
caller-auth disabled (PARMANA_AUTH_DISABLED=true): run_quickstart()
constructs its ParmanaClient with no api_key, matching exactly how the
README documents running this example locally.
"""

from __future__ import annotations

import contextlib
import json
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import pytest
import requests

from examples.quickstart.run import run_quickstart
from tests.local_approver import local_approver_env, sign_local_approval

REPO_ROOT = Path(__file__).resolve().parents[2]


def _free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _generate_keypair(key_dir: str, key_id: str) -> None:
    # See test_live_server_integration.py's identical helper for why
    # this reuses the repo's own key-generation script.
    subprocess.run(
        f"npx tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id {key_id}",
        cwd=str(REPO_ROOT),
        env={**os.environ, "PARMANA_KEY_DIR": key_dir},
        shell=True,
        check=True,
        capture_output=True,
        text=True,
    )


@pytest.fixture(scope="module")
def quickstart_server() -> str:
    port = _free_port()

    with tempfile.TemporaryDirectory(prefix="parmana-quickstart-keys-") as key_dir:
        _generate_keypair(key_dir, "default")
        _generate_keypair(key_dir, "gateway")

        env = {
            **os.environ,
            "NODE_ENV": "test",
            # Test-only: skip the approval-record check for vendor-payment, which these
            # tests run without maker-checker records. Never set in a deployment.
            "PARMANA_ALLOW_UNGOVERNED_POLICY": "true",
            # Trusts the local test approver (tests/local_approver.py).
            **local_approver_env(),
            "PARMANA_STORAGE": "memory",
            "PARMANA_POLICY_DIR": str(REPO_ROOT / "policies"),
            "PARMANA_KEY_DIR": key_dir,
            # No PARMANA_API_KEYS: this fixture matches the README's
            # documented local server, which runs with auth disabled --
            # run_quickstart() never supplies an api_key.
            "PARMANA_AUTH_DISABLED": "true",
            "PORT": str(port),
        }

        process = subprocess.Popen(
            "npx tsx packages/api/src/server.ts",
            cwd=str(REPO_ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            shell=True,
            text=True,
        )

        endpoint = f"http://127.0.0.1:{port}"

        try:
            healthy = False
            for _ in range(120):
                if process.poll() is not None:
                    output = process.stdout.read() if process.stdout else ""
                    raise RuntimeError(
                        f"quickstart server process exited early "
                        f"(code {process.returncode}):\n{output}"
                    )
                try:
                    response = requests.get(f"{endpoint}/health", timeout=1)
                    if response.status_code == 200:
                        healthy = True
                        break
                except requests.exceptions.RequestException:
                    pass
                time.sleep(0.5)

            if not healthy:
                process.terminate()
                raise RuntimeError("quickstart server did not become healthy in time")

            yield endpoint
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


def test_quickstart_runs_end_to_end_against_a_real_server(quickstart_server, capsys):
    approval = sign_local_approval(
        capability="test:fixture-execute",
        resource_id="vendor://payments",
        max_amount=1000,
    )
    trust_record = run_quickstart(endpoint=quickstart_server, approval=approval)

    assert trust_record.trust_record_id
    assert len(trust_record.executions) == 1
    assert trust_record.executions[0].decision.outcome.value == "APPROVED"
    assert trust_record.signature.algorithm.value == "ed25519"

    # The example's own printed output is part of what it documents
    # (README.md's "Expected output" section) -- proves that output
    # shape didn't silently drift too, not just the return value.
    printed = capsys.readouterr().out
    assert "Business Transaction ID:" in printed
    assert "Full Execution Trust Record:" in printed
    parsed = json.loads(printed.split("Full Execution Trust Record:\n", 1)[1])
    assert parsed["trust_record_id"] == trust_record.trust_record_id
