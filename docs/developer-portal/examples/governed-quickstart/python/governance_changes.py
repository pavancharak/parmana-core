"""
Governance changes (Python): approver keys, authority grants and external connectors, using the
public `parmana` package against a local server started by ../start-server.sh.

Each change is a maker-checker change, like a policy change:

  A. Authority grant. The maker proposes that the demo caller may have fixture executions decided,
     up to an amount limit, until a date. The checker approves it with a step-up signature.
  B. External connector. The maker proposes an endpoint on localhost. The server refuses it at
     proposal, because an endpoint must be https and name a public domain.

Not covered here: adding an approver key. The Python SDK's propose_add does not send the
`capabilities` list that the server requires, so it is refused. See the finding in FINDINGS.md.

Each approval changes the state of the local test server. Run this on a fresh setup if you want
to see the same results again, and delete the configuration directory to start over.

Install the SDK with its verification extra (the signers need `cryptography`):

  pip install "parmana[verify]"

Run after `node docs/developer-portal/examples/governed-quickstart/setup.mjs`, with the server
running, from any directory:

  python docs/developer-portal/examples/governed-quickstart/python/governance_changes.py

Test configuration only. The keys it reads are local secrets created by setup.mjs.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import UTC, datetime, timedelta
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


def step_up(change_id: str, action: str, step_up_private_pem: str) -> dict[str, Any]:
    """The checker's step-up authorization for one change, signed on this machine."""
    return sign_policy_change_step_up(
        pending_policy_change_id=change_id,
        action=action,
        private_key_pem=step_up_private_pem,
        key_id=STEP_UP_KEY_ID,
    )


def main() -> int:
    raw_keys = json.loads((CONFIG_DIR / "raw-keys.json").read_text())
    step_up_private_pem = (CONFIG_DIR / "stepup-private.pem").read_text()
    maker = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["maker"])
    checker = ParmanaClient(endpoint=ENDPOINT, api_key=raw_keys["checker"])

    # B. Authority grant.
    print("A. authority grant")
    valid_until = datetime.now(UTC) + timedelta(days=30)
    grant = maker.authority_grants.propose_grant(
        caller_id="demo",
        capability="test:fixture-execute",
        valid_until=valid_until,
        limits={"parameters.amount": {"max": 1000}},
        reason="Governance example: the demo caller may have fixture executions decided up to 1000",
    )
    print(f"   maker proposes the grant: change {grant.change_id}")
    applied_grant = checker.authority_grants.approve_change(
        grant.change_id, step_up(grant.change_id, "approve", step_up_private_pem)
    )
    print(
        f"   checker approves: status {getattr(applied_grant.status, 'value', applied_grant.status)}"
    )

    # B. External connector to a localhost endpoint: refused at proposal.
    print("B. external connector to localhost (expected to be refused)")
    try:
        maker.external_connectors.propose_register(
            capability="erp:create-invoice",
            endpoint_url="https://localhost/parmana/release",
            policy="erp-invoice",
            allowed_parameters=["amount", "currency"],
            reason="Governance example: a connector pointed at a local address",
        )
    except ParmanaError as error:
        print(f"   refused as expected: {explain(error)}")
    else:
        raise SystemExit(
            "The server accepted a localhost endpoint. This must not happen."
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ParmanaError as error:
        print(explain(error), file=sys.stderr)
        sys.exit(1)
