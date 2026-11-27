"""
External connectors and business signal sources (Python). Each is a maker-checker change, like the
governance changes in governance_changes.py, using the public `parmana` package against a local
server started by ../start-server.sh:

  A. External connector. The maker proposes releasing a capability to an https endpoint. The
     maker's own approval is refused. The checker approves with a step-up signature. The server
     checks the endpoint again on approval, and resolves it to public addresses only.
  B. Business signal source. The maker proposes a business system as a source of signals. The
     checker approves it the same way.

The endpoints below are placeholders on a public domain. Approval checks that the name resolves to
public addresses, so what the server answers depends on the network the server runs on. The
script prints the outcome as the server gives it, and does not assume one.

Each approval changes the state of the local test server. Run this on a fresh setup to repeat the
same results, and delete the configuration directory to start over.

Install the SDK with its verification extra (the signers need `cryptography`):

  pip install "parmana[verify]"

Run after `node docs/developer-portal/examples/governed-quickstart/setup.mjs`, with the server
running, from any directory:

  python docs/developer-portal/examples/governed-quickstart/python/connector_and_signal_source.py

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
STEP_UP_KEY_ID = "checker-step-up-key"


def explain(error: BaseException) -> str:
    if isinstance(error, ParmanaError):
        status = getattr(error, "status_code", None)
        suffix = f" (HTTP {status})" if status else ""
        return f"{type(error).__name__}{suffix}: {error}"
    return str(error)


def step_up(change_id: str, step_up_private_pem: str) -> dict[str, Any]:
    return sign_policy_change_step_up(
        pending_policy_change_id=change_id,
        action="approve",
        private_key_pem=step_up_private_pem,
        key_id=STEP_UP_KEY_ID,
    )


def status_of(value: object) -> str:
    return str(getattr(value, "value", value))


def main() -> int:
    raw_keys = json.loads((CONFIG_DIR / "raw-keys.json").read_text())
    step_up_private_pem = (CONFIG_DIR / "stepup-private.pem").read_text()
    maker = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["maker"])
    checker = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["checker"])

    # A. External connector.
    print("A. external connector")
    proposal = maker.external_connectors.propose_register(
        capability="erp:create-invoice",
        endpoint_url="https://example.com/parmana/release",
        policy="erp-invoice",
        allowed_parameters=["amount", "currency"],
        reason="Governance example: release invoice creation to the ERP",
    )
    print(f"   maker proposes the connector: change {proposal.change_id}")
    try:
        maker.external_connectors.approve_change(
            proposal.change_id, step_up(proposal.change_id, step_up_private_pem)
        )
    except ParmanaError as error:
        print(f"   maker's own approval refused as expected: {explain(error)}")
    else:
        raise SystemExit("The server accepted the maker's own approval. This must not happen.")
    try:
        applied = checker.external_connectors.approve_change(
            proposal.change_id, step_up(proposal.change_id, step_up_private_pem)
        )
        print(f"   checker approves: status {status_of(applied.status)}")
    except ParmanaError as error:
        print(f"   checker's approval refused by the server: {explain(error)}")

    # B. Business signal source.
    print("B. business signal source")
    source = maker.business_signal_sources.propose_register(
        name="erp-ledger",
        endpoint_url="https://example.com/parmana/signals",
        reason="Governance example: the ERP ledger reports payment signals",
    )
    print(f"   maker proposes the signal source: change {source.change_id}")
    try:
        applied_source = checker.business_signal_sources.approve_change(
            source.change_id, step_up(source.change_id, step_up_private_pem)
        )
        print(f"   checker approves: status {status_of(applied_source.status)}")
    except ParmanaError as error:
        print(f"   checker's approval refused by the server: {explain(error)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ParmanaError as error:
        print(explain(error), file=sys.stderr)
        sys.exit(1)
