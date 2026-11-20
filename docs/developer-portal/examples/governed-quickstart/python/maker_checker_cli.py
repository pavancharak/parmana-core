"""
Maker-checker with a policy file and a locally signed envelope (Python). The same steps as the
`parmana-ops` flow in docs/developer-portal/sdk/cli.md, using the public `parmana` package
against a local server started by ../start-server.sh:

  1. The maker proposes vendor-payment@2.1.1 from a policy file.
  2. The maker submits a step-up envelope for its own change. The server refuses it.
  3. The checker signs the envelope locally, writes it to a file, and submits that file with
     the checker's own key. The change is approved.

The step-up private key never leaves this machine. The script writes the envelope to
CONFIG_DIR/envelope.json, which is what `parmana-ops approval submit --envelope` reads.

This approves 2.1.1, so 2.1.0 is superseded. Run it on a fresh configuration, and set
GOVERNED_POLICY_VERSION=2.1.1 for the other examples afterwards. Delete CONFIG_DIR to start over.

Install the SDK with its verification extra (the signers need `cryptography`):

  pip install "parmana[verify]"

Run after `node docs/developer-portal/examples/governed-quickstart/setup.mjs`, with the server
running, from any directory:

  python docs/developer-portal/examples/governed-quickstart/python/maker_checker_cli.py

Test configuration only. The keys it reads are local secrets created by setup.mjs.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from parmana import ParmanaClient, ParmanaError
from parmana.crypto import sign_policy_change_step_up

CONFIG_DIR = Path(
    os.environ.get(
        "GOVERNED_CONFIG_DIR", str(Path.home() / ".parmana" / "governed-quickstart")
    )
)
ENDPOINT = os.environ.get("PARMANA_ENDPOINT", "http://localhost:3000")
POLICY_NAME = "vendor-payment"
BASE_VERSION = "2.1.0"
NEW_VERSION = "2.1.1"
STEP_UP_KEY_ID = "checker-step-up-key"


def value_of(enum_or_text: object) -> str:
    return str(getattr(enum_or_text, "value", enum_or_text))


def explain(error: BaseException) -> str:
    if isinstance(error, ParmanaError):
        status = getattr(error, "status_code", None)
        suffix = f" (HTTP {status})" if status else ""
        return f"{type(error).__name__}{suffix}: {error}"
    return str(error)


def write_policy_file(path: Path) -> dict[str, Any]:
    """Write the new version as a file, the way `parmana-ops policy propose <file>` reads it."""
    document = json.loads(
        (
            CONFIG_DIR / "policies" / POLICY_NAME / BASE_VERSION / "policy.json"
        ).read_text()
    )
    document["policyVersion"] = NEW_VERSION
    path.write_text(json.dumps(document, indent=2) + "\n")
    return document


def main() -> int:
    raw_keys = json.loads((CONFIG_DIR / "raw-keys.json").read_text())
    step_up_private_pem = (CONFIG_DIR / "stepup-private.pem").read_text()
    maker = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["maker"])
    checker = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["checker"])

    policy_file = CONFIG_DIR / f"{POLICY_NAME}-{NEW_VERSION}.json"
    document = write_policy_file(policy_file)
    print(f"0. wrote {policy_file.name} (policyVersion {NEW_VERSION})")

    # 1. The maker proposes the version from the file.
    print(f"1. maker proposes {POLICY_NAME}@{NEW_VERSION} from the file")
    proposal = maker.propose_policy_change(
        POLICY_NAME,
        NEW_VERSION,
        proposed_content=document,
        reason="Maker-checker from a policy file",
    )
    pending_id = proposal.pending_policy_change_id
    print(f"   pending change: {pending_id}")

    def envelope_for(action: str) -> dict[str, Any]:
        return sign_policy_change_step_up(
            pending_policy_change_id=pending_id,
            action=action,
            private_key_pem=step_up_private_pem,
            key_id=STEP_UP_KEY_ID,
        )

    # 2. The maker submits an approval for its own change. The server refuses it.
    envelope_file = CONFIG_DIR / "envelope.json"
    print("2. maker submits an approval for its own change (expected to be refused)")
    try:
        maker.approve_policy_change(pending_id, envelope_for("approve"))
    except ParmanaError as error:
        print(f"   refused as expected: {explain(error)}")
    else:
        raise SystemExit("The server accepted a self-approval. This must not happen.")

    # 3. The checker signs the envelope locally, writes it to a file, then submits that file.
    envelope = envelope_for("approve")
    envelope_file.write_text(json.dumps(envelope, indent=2) + "\n")
    print(f"3. checker signs the envelope locally: {envelope_file.name}")
    loaded = json.loads(envelope_file.read_text())
    resolved = checker.approve_policy_change(pending_id, loaded)
    print(f"   checker submits it: status {value_of(resolved.status)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ParmanaError as error:
        print(explain(error), file=sys.stderr)
        sys.exit(1)
