import base64
import json
from datetime import datetime

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ec import SECP256R1, generate_private_key
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from parmana.crypto import canonical_serialize, sign_approval


def _key():
    private_key = Ed25519PrivateKey.generate()
    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode("ascii")
    return pem, private_key.public_key()


def _base(pem):
    return {
        "private_key_pem": pem,
        "approver_id": "manager-priya",
        "key_id": "manager-priya-key-1",
        "capability": "paytm:refund",
        "resource_id": "ORD-1042",
    }


def _parse(stamp):
    return datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%S.%fZ")


def test_signs_the_canonical_payload_scoped_to_an_amount():
    pem, public_key = _key()

    approval = sign_approval(**_base(pem), max_amount=75000)
    payload = approval["payload"]

    assert payload["version"] == 1
    assert payload["issuer"] == {
        "approverId": "manager-priya",
        "keyId": "manager-priya-key-1",
    }
    assert payload["scope"] == {"field": "value", "comparator": "lte", "value": 75000}
    assert approval["signature"]["algorithm"] == "ed25519"
    assert approval["signature"]["keyId"] == "manager-priya-key-1"
    assert (
        _parse(payload["expiresAt"]) - _parse(payload["issuedAt"])
    ).total_seconds() == 900

    public_key.verify(
        base64.b64decode(approval["signature"]["value"]),
        canonical_serialize(payload),
    )


def test_a_whole_float_amount_is_signed_as_the_server_serializes_it():
    pem, public_key = _key()

    approval = sign_approval(**_base(pem), max_amount=75000.0)

    # What the server sees after JSON transport, re-serialized its way.
    received = json.loads(json.dumps(approval["payload"]))
    assert b'"value":75000}' in canonical_serialize(received)
    public_key.verify(
        base64.b64decode(approval["signature"]["value"]),
        canonical_serialize(received),
    )


def test_names_exactly_the_resource_when_no_amount_is_given():
    pem, _ = _key()

    approval = sign_approval(
        **{**_base(pem), "capability": "github:pr-merge", "resource_id": "acme/api#42"}
    )

    assert approval["payload"]["scope"] == {
        "field": "resourceId",
        "comparator": "eq",
        "value": "acme/api#42",
    }


def test_every_approval_has_its_own_id_and_nonce():
    pem, _ = _key()

    first = sign_approval(**_base(pem), max_amount=10)
    second = sign_approval(**_base(pem), max_amount=10)

    assert first["payload"]["approvalId"] != second["payload"]["approvalId"]
    assert first["payload"]["nonce"] != second["payload"]["nonce"]


@pytest.mark.parametrize(
    "override, message",
    [
        ({"ttl_seconds": 0}, "ttl_seconds"),
        ({"ttl_seconds": 86_401}, "ttl_seconds"),
        ({"ttl_seconds": 1.5}, "ttl_seconds"),
        ({"capability": "refund"}, "capability"),
        ({"resource_id": ""}, "resource_id"),
        ({"max_amount": -1}, "max_amount"),
    ],
)
def test_refuses_bad_input(override, message):
    pem, _ = _key()

    with pytest.raises(ValueError, match=message):
        sign_approval(**{**_base(pem), **override})


def test_refuses_a_key_that_is_not_ed25519():
    pem = (
        generate_private_key(SECP256R1())
        .private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        .decode("ascii")
    )

    with pytest.raises(ValueError, match="Ed25519"):
        sign_approval(**_base(pem))
