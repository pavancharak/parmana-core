"""
Example 13

An external connector endpoint (ADR-0013).

The HTTPS endpoint an operator registers for a capability, for example
``erp:create-invoice``. Parmana POSTs each approved request here as a
signed release. The endpoint checks it with ``verify_parmana_release``,
acts in its own system with its own credentials, and answers with the
result. A release Parmana sends again after a timeout is answered with
the first result, never acted on twice.

Run it (``pip install "parmana[verify]"``)::

    PARMANA_PUBLIC_KEY_PEM="$(cat parmana-default.pem)" \\
    ENDPOINT_URL=https://erp.example.com/parmana/release \\
    PORT=8080 python examples/13_external_connector_endpoint.py

``PARMANA_PUBLIC_KEY_PEM`` is the key from ``client.public_key("default")``.
``ENDPOINT_URL`` is this endpoint's URL exactly as Parmana stored it at
registration (GET /external-connectors). Serve it over HTTPS: put it
behind your TLS terminating proxy, since Parmana releases only to https.
"""

from __future__ import annotations

import json
import os
import sys
from collections.abc import Callable
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from parmana.crypto import verify_parmana_release

Answer = tuple[int, dict[str, Any]]


def create_release_handler(
    *,
    public_keys: dict[str, str],
    audience: str,
    act: Callable[[dict[str, Any]], dict[str, Any]],
    answers: dict[str, dict[str, Any]] | None = None,
    conditions_hold: (
        Callable[[list[dict[str, Any]], dict[str, Any]], bool] | None
    ) = None,
    now: Callable[[], datetime] | None = None,
) -> Callable[[Any], Answer]:
    """
    The whole endpoint, independent of any HTTP framework: give it the
    parsed JSON body, send back the status and body it returns.

    ``act`` performs the action in your system, using only capability,
    target and parameters from the verified release, and returns its
    result. ``answers`` keeps first answers by businessTransactionId; the
    default lives in memory for this example. Use your database, so a
    restart cannot make the endpoint act twice.

    ``conditions_hold`` (RFC-0023 phase 4) says whether every business
    fact the release rests on still holds in your records. It is called
    only when the release carries conditions. Check them in the same
    transaction as the action; when one no longer holds, the endpoint
    does not act and answers ``conditionsNotMet``.
    """

    stored: dict[str, dict[str, Any]] = answers if answers is not None else {}

    def handle(body: Any) -> Answer:
        verification = verify_parmana_release(
            body,
            public_keys=public_keys,
            audience=audience,
            is_already_executed=lambda business_transaction_id: (
                business_transaction_id in stored
            ),
            now=now() if now is not None else None,
        )

        if not verification.valid or verification.release is None:
            # Parmana records anything but 200 as an unknown outcome;
            # nothing was done here, and the errors say why.
            return 401, {"errors": verification.errors}

        release = verification.release
        first = stored.get(release["businessTransactionId"])

        if verification.already_executed and first is not None:
            return 200, first

        conditions = release.get("conditions") or []

        if (
            conditions
            and conditions_hold is not None
            and not conditions_hold(conditions, release)
        ):
            # Not acted on. Kept as the first answer, so a repeat of this
            # release gets the same one.
            declined = {
                "businessTransactionId": release["businessTransactionId"],
                "capability": release["capability"],
                "success": False,
                "conditionsNotMet": True,
                "result": {
                    "reason": "A condition the release rests on no longer holds."
                },
            }
            stored[release["businessTransactionId"]] = declined
            return 200, declined

        answer = {
            "businessTransactionId": release["businessTransactionId"],
            "capability": release["capability"],
            "success": True,
            "result": act(release),
            "executedAt": datetime.now(timezone.utc).isoformat(),
        }
        stored[release["businessTransactionId"]] = answer

        return 200, answer

    return handle


def create_invoice(release: dict[str, Any]) -> dict[str, Any]:
    """
    The action this example performs: it only makes up an invoice id.
    Replace it with the call into your system.
    """

    return {
        "invoiceId": f"INV-{release['businessTransactionId'][:8]}",
        "customer": release["target"],
        "amount": release["parameters"].get("amount"),
        "currency": release["parameters"].get("currency"),
    }


def main() -> None:
    public_key_pem = os.environ.get("PARMANA_PUBLIC_KEY_PEM")
    audience = os.environ.get("ENDPOINT_URL")
    port = int(os.environ.get("PORT", "8080"))

    if public_key_pem is None or audience is None:
        print("Set PARMANA_PUBLIC_KEY_PEM and ENDPOINT_URL.", file=sys.stderr)
        sys.exit(2)

    handle = create_release_handler(
        public_keys={"default": public_key_pem},
        audience=audience,
        act=create_invoice,
    )

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802 -- http.server's name
            length = int(self.headers.get("Content-Length", "0"))

            try:
                body = json.loads(self.rfile.read(length))
            except ValueError:
                status, answer = 400, {"errors": ["the body is not JSON"]}
            else:
                status, answer = handle(body)

            payload = json.dumps(answer).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    print(f"External connector endpoint for {audience} on port {port}")
    HTTPServer(("", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
