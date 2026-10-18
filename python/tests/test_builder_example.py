"""
Proves the documented builder example (python/examples/builder/run.py)
actually works against a real running server -- not just that it
imports the SDK and compiles. Spawns the real @parmana/api server as a
subprocess, identically to test_quickstart_example.py (same fixture
shape, deliberately not shared/refactored together -- see that file's
own reasoning for why each example gets its own from-scratch proof
rather than a shared harness that could silently stop covering one of
them).
"""

from __future__ import annotations

import contextlib
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import pytest
import requests

from examples.builder.run import run_builder_example
from tests.local_approver import local_approver_env, sign_local_approval

REPO_ROOT = Path(__file__).resolve().parents[2]


def _free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _generate_keypair(key_dir: str, key_id: str) -> None:
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
def builder_example_server() -> str:
    port = _free_port()

    with tempfile.TemporaryDirectory(prefix="parmana-builder-example-keys-") as key_dir:
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
                        f"builder example server process exited early "
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
                raise RuntimeError(
                    "builder example server did not become healthy in time"
                )

            yield endpoint
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


def test_builder_example_runs_end_to_end_against_a_real_server(builder_example_server):
    approval = sign_local_approval(
        capability="test:fixture-execute",
        resource_id="vendor://payments",
        max_amount=1000,
    )
    trust_record = run_builder_example(
        endpoint=builder_example_server, approval=approval
    )

    assert trust_record.trust_record_id
    assert len(trust_record.executions) == 1
    assert trust_record.executions[0].decision.outcome.value == "APPROVED"
    assert trust_record.signature.algorithm.value == "ed25519"

    # The property this example exists to prove: every id pair the
    # builder derives round-trips correctly through a real server, not
    # just in isolated unit tests (tests/test_builders.py).
    assert (
        trust_record.transaction.metadata.business_transaction_id
        == trust_record.business_transaction_id
    )
    assert (
        trust_record.transaction.authorization.authority_id
        == trust_record.transaction.authority.authority_id
    )
    assert (
        trust_record.transaction.intent.authorization_id
        == trust_record.transaction.authorization.authorization_id
    )
