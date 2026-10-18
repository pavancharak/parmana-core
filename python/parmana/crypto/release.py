"""
Verifies a signed release from Parmana at an external connector
endpoint (ADR-0013).

When an operator registers an external connector, Parmana releases every
approved request for that capability to the endpoint as
``{"release": ..., "signature": ...}``. Before acting, the endpoint calls
``verify_parmana_release`` with the body, Parmana's public key (get it
once with ``client.public_key("default")``), its own URL as registered,
and a callback that says whether it already executed a
businessTransactionId.

TypeScript counterpart: typescript/src/crypto/release.ts,
``verifyParmanaRelease``, with the same checks in the same order and the
same error texts. No network call, no disk read.
"""

from __future__ import annotations

import base64
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key

from .canonical import canonical_serialize
from .offline_verifier import _verify_ed25519_with_commitment

DEFAULT_RELEASE_CLOCK_SKEW_SECONDS = 30
"""How far the endpoint's clock may be behind Parmana's before an expired
release is refused, in seconds."""

_STRING_FIELDS = (
    "connectorId",
    "audience",
    "businessTransactionId",
    "authorizationId",
    "capability",
    "target",
    "issuedAt",
    "expiresAt",
)


@dataclass(frozen=True)
class ParmanaReleaseVerification:
    """
    ``valid`` is True only when every check passed. Then ``release`` is
    what Parmana approved (act on capability, target and parameters
    only), and ``already_executed`` True means: answer with the result
    you stored the first time, and do not act again. Otherwise
    ``errors`` lists every failed check, in plain words, in the order
    checked: shape, signature, audience, expiry.
    """

    valid: bool
    release: dict[str, Any] | None = None
    already_executed: bool = False
    errors: list[str] = field(default_factory=list)


def _is_object(value: Any) -> bool:
    return isinstance(value, dict)


def _shape_errors(release: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    if release.get("version") != 1 or isinstance(release.get("version"), bool):
        errors.append("release.version is not 1")

    for name in _STRING_FIELDS:
        if not isinstance(release.get(name), str):
            errors.append(f"release.{name} is not a string")

    if not _is_object(release.get("parameters")):
        errors.append("release.parameters is not an object")

    if not _is_object(release.get("policy")):
        errors.append("release.policy is not an object")

    if not isinstance(release.get("approvedBy"), list):
        errors.append("release.approvedBy is not an array")

    return errors


def _json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None

    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def verify_parmana_release(
    body: Any,
    *,
    public_keys: dict[str, str],
    audience: str,
    is_already_executed: Callable[[str], bool],
    now: datetime | None = None,
    clock_skew_seconds: float = DEFAULT_RELEASE_CLOCK_SKEW_SECONDS,
) -> ParmanaReleaseVerification:
    """
    Checks, in order: the body's shape, the signature over the canonical
    JSON of ``release`` with the key named in ``signature.keyId``, that
    ``release.audience`` equals ``audience`` (this endpoint's URL exactly
    as Parmana stored it at registration), and that ``release.expiresAt``
    has not passed, allowing ``clock_skew_seconds``. Only then does it
    call ``is_already_executed(businessTransactionId)``.

    Keep the executed businessTransactionIds durably: Parmana may send the
    same release again after a timeout, and the endpoint must answer with
    its first result, not act twice.

    ``public_keys`` maps keyId to PEM public key text. Never raises for a
    bad body; returns ``valid=False`` with the errors.
    """

    if (
        not _is_object(body)
        or not _is_object(body.get("release"))
        or not _is_object(body.get("signature"))
    ):
        return ParmanaReleaseVerification(
            valid=False, errors=["the body is not { release, signature }"]
        )

    release: dict[str, Any] = body["release"]
    signature: dict[str, Any] = body["signature"]
    errors = _shape_errors(release)

    key_id = signature.get("keyId")
    value = signature.get("value")

    if signature.get("algorithm") != "ed25519":
        algorithm = _json_text(signature.get("algorithm"))
        errors.append(
            f"signature.algorithm {algorithm} is not supported; only ed25519 is"
        )
    elif not isinstance(key_id, str) or not isinstance(value, str):
        errors.append("signature.keyId or signature.value is not a string")
    elif key_id not in public_keys:
        errors.append(f"no public key supplied for keyId {key_id}")
    else:
        try:
            public_key = load_pem_public_key(public_keys[key_id].encode("utf-8"))

            if not isinstance(public_key, Ed25519PublicKey):
                raise ValueError(
                    "the public key for signature.keyId is not an Ed25519 key"
                )

            _verify_ed25519_with_commitment(
                public_key, base64.b64decode(value), canonical_serialize(release)
            )
        except InvalidSignature:
            errors.append("the signature does not verify")
        except Exception as error:  # noqa: BLE001 -- reported, not swallowed
            errors.append(f"the signature could not be checked: {error}")

    if release.get("audience") != audience:
        errors.append(
            f"release.audience {_json_text(release.get('audience'))} "
            f"is not this endpoint ({audience})"
        )

    expires_at = _parse_time(release.get("expiresAt"))
    current = now if now is not None else datetime.now(timezone.utc)

    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)

    if expires_at is None:
        errors.append("release.expiresAt is not a date")
    elif current > expires_at + timedelta(seconds=clock_skew_seconds):
        errors.append(f"the release expired at {release.get('expiresAt')}")

    if errors:
        return ParmanaReleaseVerification(valid=False, errors=errors)

    return ParmanaReleaseVerification(
        valid=True,
        release=release,
        already_executed=bool(is_already_executed(release["businessTransactionId"])),
    )
