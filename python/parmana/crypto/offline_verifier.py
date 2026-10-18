"""
Standalone, offline verification of an Execution Trust Record.

Python counterpart to packages/crypto/src/OfflineVerifier.ts (PQC
audit RED-1, docs/VERIFICATION-GAPS.md) -- proves the canonical
serialization algorithm and Ed25519 verification are independently
reproducible in a second language, not just documented as "should be
portable." Zero network calls, zero disk reads (beyond files the
caller explicitly passes in), zero environment variables.

Large records (over 4096 bytes of canonical content) may have been
signed by AWS KMS as a fixed size commitment, because KMS caps a raw
Ed25519 message at 4096 bytes. This module accepts a raw signature for
any record, and additionally accepts the commitment form for a record
over that limit (see docs/adr/ADR-0010). A commitment signature over a
record at or below the limit is rejected.

ML-DSA-65 (Dilithium3) verification is intentionally out of scope
here: the `cryptography` package version this SDK currently depends
on does not yet expose `cryptography.hazmat.primitives.asymmetric.
ml_dsa`. A hybrid-signed record's `signatures` array cannot be
independently checked from Python until that support lands upstream
and this module is updated to use it -- stated plainly rather than
silently skipped or faked.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, is_dataclass
from typing import Any, cast

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.hashes import SHA256, Hash
from cryptography.hazmat.primitives.serialization import load_pem_public_key

from .canonical import canonical_serialize


def _as_json(value: Any) -> dict[str, Any]:
    """
    Accept either the plain dict of a JSON response or file, or the SDK's
    own decoded model (ExecutionTrustRecord, ExecutionIntent). A decoded
    model is turned back into the exact JSON the server sent, which it
    keeps from decoding, including any explicit `null` (G-85). A model built
    by hand is encoded from its fields: camelCase keys, unset optional
    fields left out, and timestamps in JavaScript's toISOString() form.
    """

    if is_dataclass(value) and not isinstance(value, type):
        from parmana.serialization import encode

        return cast("dict[str, Any]", encode(value))
    return cast("dict[str, Any]", value)


_SUPPORTED_ALGORITHMS = {"ed25519"}

# Large message commitment (v1), mirroring packages/crypto/src/
# SignatureCommitment.ts. AWS KMS caps a raw Ed25519 message at 4096
# bytes, so the KMS signer signs a longer message as a fixed size
# commitment: the prefix below followed by the SHA-512 digest of the
# message. The scheme depends only on message length, so no marker is
# stored on the record. A message at or below the limit must verify
# raw. A longer message verifies either raw (a local key signed it
# directly) or as a commitment. A commitment signature over a message at
# or below the limit is not accepted.
_KMS_RAW_MESSAGE_LIMIT_BYTES = 4096
_COMMITMENT_PREFIX = b"PARMANA-ED25519-LARGE-MESSAGE-V1\x00"


def _commitment_message(message: bytes) -> bytes:
    return _COMMITMENT_PREFIX + hashlib.sha512(message).digest()


def _verify_ed25519_with_commitment(
    public_key: Ed25519PublicKey, signature: bytes, message: bytes
) -> None:
    """Raises InvalidSignature unless the signature is valid for `message`."""

    try:
        public_key.verify(signature, message)
        return
    except InvalidSignature:
        if len(message) <= _KMS_RAW_MESSAGE_LIMIT_BYTES:
            raise

    public_key.verify(signature, _commitment_message(message))


def _canonical_execution_trust_record(record: dict[str, Any]) -> dict[str, Any]:
    """
    Mirrors ExecutionTrustRecordCanonicalView.ts's
    canonicalExecutionTrustRecord() field-for-field. A field absent
    from `record` (e.g. no `authorization`) is simply omitted here,
    the same as CanonicalSerializer.ts dropping an undefined key via
    JSON.stringify.
    """

    fields_in_order = (
        "trustRecordId",
        "businessTransactionId",
        "transaction",
        "authorization",
        "overrides",
        "executions",
        "createdAt",
    )

    return {key: record[key] for key in fields_in_order if key in record}


@dataclass(frozen=True)
class OfflineVerificationResult:
    valid: bool
    hash_valid: bool
    legacy_signature_valid: bool
    algorithms_checked: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def verify_execution_trust_record_offline(
    trust_record: Any,
    public_keys: dict[str, str],
) -> OfflineVerificationResult:
    """
    `trust_record` is a plain dict, exactly as `json.load()` would
    produce from a Trust Record JSON file or API response body, or the
    ExecutionTrustRecord that `client.trust_record()` returns.
    `public_keys` maps keyId -> PEM-encoded public key text.
    """

    trust_record = _as_json(trust_record)

    errors: list[str] = []
    algorithms_checked: list[str] = []

    canonical = _canonical_execution_trust_record(trust_record)
    digest = Hash(SHA256())
    digest.update(canonical_serialize(canonical))
    expected_hash = digest.finalize().hex()

    hash_valid = expected_hash == trust_record.get("trustRecordHash")

    if not hash_valid:
        errors.append(
            f"trustRecordHash mismatch: expected {expected_hash}, "
            f"got {trust_record.get('trustRecordHash')}."
        )

    signature_field = trust_record.get("signature") or {}
    algorithm = signature_field.get("algorithm")
    key_id = signature_field.get("keyId")
    signature_value = signature_field.get("value")

    legacy_signature_valid = False

    if algorithm not in _SUPPORTED_ALGORITHMS:
        errors.append(f"unsupported algorithm: {algorithm}.")
    elif key_id not in public_keys:
        errors.append(f'no public key supplied for keyId "{key_id}".')
    else:
        algorithms_checked.append(algorithm)

        try:
            public_key = load_pem_public_key(public_keys[key_id].encode("utf-8"))

            if not isinstance(public_key, Ed25519PublicKey):
                raise ValueError("supplied public key is not an Ed25519 key")

            if not isinstance(signature_value, str):
                raise ValueError("signature.value is missing or not a string")

            import base64

            signature_bytes = base64.b64decode(signature_value)
            message = canonical_serialize(canonical)

            _verify_ed25519_with_commitment(public_key, signature_bytes, message)
            legacy_signature_valid = True
        except InvalidSignature:
            errors.append(
                f'signature verification failed for keyId "{key_id}" ({algorithm}).'
            )
        except Exception as error:  # noqa: BLE001 -- reported, not swallowed
            errors.append(f'error verifying keyId "{key_id}" ({algorithm}): {error}')

    if trust_record.get("signatures"):
        errors.append(
            "this record carries a hybrid `signatures` array; ML-DSA-65 "
            "verification is not yet available from Python (see this "
            "module's own docstring) -- verify with the TypeScript "
            "reference implementation (packages/crypto/src/"
            "OfflineVerifier.ts) for a complete hybrid check."
        )

    valid = hash_valid and legacy_signature_valid and not trust_record.get("signatures")

    return OfflineVerificationResult(
        valid=valid,
        hash_valid=hash_valid,
        legacy_signature_valid=legacy_signature_valid,
        algorithms_checked=algorithms_checked,
        errors=errors,
    )


def _canonical_execution_intent(intent: dict[str, Any]) -> dict[str, Any]:
    """
    Mirrors packages/crypto/src/ExecutionIntentCanonicalView.ts's
    canonicalExecutionIntent() field for field (ADR-0012). The signature covers
    exactly these fields, never `intentHash` or `signature`. A field absent
    from `intent` (an optional one that was never set) is omitted, the same as
    CanonicalSerializer.ts dropping an undefined key.
    """

    fields_in_order = (
        "intentId",
        "businessTransactionId",
        "decisionId",
        "authorizationId",
        "policyName",
        "policyVersion",
        "policyContentHash",
        "signalsHash",
        "businessTransactionHash",
        "action",
        "target",
        "submittedBy",
        "grantedCapability",
        "createdAt",
    )

    return {key: intent[key] for key in fields_in_order if key in intent}


def verify_execution_intent_offline(
    intent: Any,
    public_keys: dict[str, str],
) -> OfflineVerificationResult:
    """
    Python counterpart to verifyExecutionIntentOffline() in
    packages/crypto/src/OfflineVerifier.ts (ADR-0012). No network call, no
    database, no environment variable: only the intent and the public key(s).

    `intent` is a plain dict, exactly as `json.load()` would produce from the
    `intent` field of GET /execution-intents/:id, or the ExecutionIntent at
    `client.execution_intent(id).intent`. `public_keys` maps keyId to
    PEM-encoded public key text.

    A valid result proves the intent was signed by the holder of that key and
    has not been altered. It does NOT prove the action was released, or what its
    result was: an intent is written BEFORE release.
    """

    intent = _as_json(intent)

    errors: list[str] = []
    algorithms_checked: list[str] = []

    canonical = _canonical_execution_intent(intent)
    digest = Hash(SHA256())
    digest.update(canonical_serialize(canonical))
    expected_hash = digest.finalize().hex()

    hash_valid = expected_hash == intent.get("intentHash")

    if not hash_valid:
        errors.append(
            f"intentHash mismatch: expected {expected_hash}, "
            f"got {intent.get('intentHash')}."
        )

    signature_field = intent.get("signature") or {}
    algorithm = signature_field.get("algorithm")
    key_id = signature_field.get("keyId")
    signature_value = signature_field.get("value")

    signature_valid = False

    if algorithm not in _SUPPORTED_ALGORITHMS:
        errors.append(f"unsupported algorithm: {algorithm}.")
    elif key_id not in public_keys:
        errors.append(f'no public key supplied for keyId "{key_id}".')
    else:
        algorithms_checked.append(algorithm)

        try:
            public_key = load_pem_public_key(public_keys[key_id].encode("utf-8"))

            if not isinstance(public_key, Ed25519PublicKey):
                raise ValueError("supplied public key is not an Ed25519 key")

            if not isinstance(signature_value, str):
                raise ValueError("signature.value is missing or not a string")

            import base64

            _verify_ed25519_with_commitment(
                public_key,
                base64.b64decode(signature_value),
                canonical_serialize(canonical),
            )
            signature_valid = True
        except InvalidSignature:
            errors.append(
                f'signature verification failed for keyId "{key_id}" ({algorithm}).'
            )
        except Exception as error:  # noqa: BLE001 -- reported, not swallowed
            errors.append(f'error verifying keyId "{key_id}" ({algorithm}): {error}')

    return OfflineVerificationResult(
        valid=hash_valid and signature_valid,
        hash_valid=hash_valid,
        legacy_signature_valid=signature_valid,
        algorithms_checked=algorithms_checked,
        errors=errors,
    )
