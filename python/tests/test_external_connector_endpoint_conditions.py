"""
RFC-0023 phase 4 in examples/13_external_connector_endpoint.py: a
release that carries business conditions is acted on only when
``conditions_hold`` says they still hold; otherwise the endpoint answers
conditionsNotMet, keeps that as its first answer, and does not act.
"""

from __future__ import annotations

import base64
import importlib.util
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

pytest.importorskip("cryptography")

from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.ed25519 import (  # noqa: E402
    Ed25519PrivateKey,
)

from parmana.crypto.canonical import canonical_serialize  # noqa: E402

EXAMPLE = (
    Path(__file__).resolve().parents[1]
    / "examples"
    / "13_external_connector_endpoint.py"
)
AUDIENCE = "https://erp.example.com/parmana/release"
NOW = datetime(2026, 10, 11, 10, 0, 0, tzinfo=timezone.utc)
CONDITION = {
    "signalKey": "invoicePaid",
    "source": "erp",
    "claim": "invoice.paid",
    "subject": "INV-1",
    "value": True,
    "validUntil": "2026-10-11T10:00:20.000Z",
}


def _load_example() -> ModuleType:
    spec = importlib.util.spec_from_file_location("endpoint_conditions", EXAMPLE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _signed_release(key: Ed25519PrivateKey) -> dict[str, Any]:
    release = {
        "version": 1,
        "connectorId": "ext-erp:release-goods",
        "audience": AUDIENCE,
        "businessTransactionId": "bt-7",
        "authorizationId": "auth-7",
        "capability": "erp:release-goods",
        "target": "invoices/INV-1",
        "parameters": {"invoiceId": "INV-1"},
        "policy": {"name": "release-goods", "version": "1.0.0"},
        "approvedBy": [],
        "issuedAt": "2026-10-11T10:00:00.000Z",
        "expiresAt": "2026-10-11T10:00:20.000Z",
        "conditions": [CONDITION],
    }
    signature = key.sign(canonical_serialize(release))
    return {
        "release": release,
        "signature": {
            "algorithm": "ed25519",
            "keyId": "default",
            "value": base64.b64encode(signature).decode("ascii"),
        },
    }


@pytest.mark.parametrize("hold", [True, False])
def test_acts_only_when_the_conditions_still_hold(hold: bool) -> None:
    example = _load_example()
    key = Ed25519PrivateKey.generate()
    public_pem = (
        key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("ascii")
    )
    acted: list[str] = []
    checked: list[Any] = []

    def act(release: dict[str, Any]) -> dict[str, Any]:
        acted.append(release["businessTransactionId"])
        return {"released": True}

    def conditions_hold(
        conditions: list[dict[str, Any]], _release: dict[str, Any]
    ) -> bool:
        checked.append(conditions)
        return hold

    handle = example.create_release_handler(
        public_keys={"default": public_pem},
        audience=AUDIENCE,
        act=act,
        conditions_hold=conditions_hold,
        now=lambda: NOW,
    )

    body = _signed_release(key)
    status, answer = handle(body)

    assert status == 200
    assert checked == [[CONDITION]]
    if hold:
        assert answer["success"] is True
        assert acted == ["bt-7"]
    else:
        assert answer["success"] is False
        assert answer["conditionsNotMet"] is True
        assert acted == []

    # A repeat of the same release gets the first answer, and does not act.
    status, again = handle(body)
    assert (status, again) == (200, answer)
    assert len(acted) == (1 if hold else 0)
