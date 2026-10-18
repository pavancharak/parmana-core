# ADR-0010: Large Message Signing Under AWS KMS

**Status:** Accepted, implemented, and verified live against the real AWS KMS service (2026-09-20), see "Verification status" below.

**Date:** 2026-09-20

**Relates to:** ADR-0009 (KMS backed signing), `docs/VERIFICATION-GAPS.md` gap 59 (this decision) and G-52 (a related gap this decision does not close), `docs/CLAIMS.md` section 2.37.

## Context

ADR-0009 moved the gateway signing key into AWS KMS with `ECC_NIST_EDWARDS25519` and the `ED25519_SHA_512` algorithm. `KmsSigner.sign()` called the KMS `Sign` API with `MessageType: RAW` and passed the full canonical bytes of whatever artifact was being signed.

KMS rejects a raw message longer than 4096 bytes:

```
ValidationException: Value at 'message' failed to satisfy constraint:
Member must have length less than or equal to 4096
```

The limit was found in production on 2026-09-20. A `POST /execute` for `paytm:refund` returned `500 Internal Server Error`. The runtime log stack was `VerificationCrypto.sign` calling `KmsSigner.sign`. The message being signed was the canonical form of the Execution Trust Record, which includes the bound authorization, connector evidence and governance anchor. A full record is well over 4096 bytes. Earlier KMS tests had only exercised the small `test:fixture-execute` record, so the limit had never been hit.

The same limit applies to every artifact signed through a `Signer`, including an execution authorization whose parameters are large.

The failure happened after the Paytm connector had already been called, which is a separate ordering concern recorded as G-52.

## Decision

A message longer than 4096 bytes is signed as a fixed size commitment. The signature is still an ordinary Ed25519 signature, so no new algorithm is introduced.

**Commitment message (version 1):**

```
"PARMANA-ED25519-LARGE-MESSAGE-V1" + 0x00 + SHA-512(message)
```

That is a 33 byte prefix followed by the 64 byte digest, 97 bytes in total, far under the KMS limit and independent of the size of the original message.

**The scheme is a pure function of message length. No marker is stored on any record.**

| Message length                         | Signing                | Verification accepts                     |
| -------------------------------------- | ---------------------- | ---------------------------------------- |
| 4096 bytes or fewer                    | Raw, exactly as before | Raw signature only                       |
| More than 4096 bytes, KMS signer       | Commitment             | Commitment signature, or a raw signature |
| More than 4096 bytes, local key signer | Raw, exactly as before | Commitment signature, or a raw signature |

A verifier tries the raw signature first. Only when that fails and the message is longer than 4096 bytes does it try the commitment form.

**Where it lives:**

- `packages/crypto/src/SignatureCommitment.ts`: the limit, `requiresCommitment()` and `commitmentMessage()`.
- `packages/crypto/src/providers/signer/KmsSigner.ts`: signs the commitment for a message over the limit.
- `packages/crypto/src/providers/signature/Ed25519SignatureProvider.ts`: the verifier fallback. Every TypeScript verification path (`SignatureVerifier`, `VerificationCrypto`, `AuthorizationVerifier`, `EnvelopeVerifier`, the offline verifier) goes through it.
- `python/parmana/crypto/offline_verifier.py`: the independent Python implementation of the same rule.

## Why this design

- **Existing signatures stay valid.** Every record signed before this change was signed raw, so a length triggered rule verifies all of them unchanged. Nothing has to be re-signed or migrated.
- **No schema change.** A stored marker, such as a `signatureScheme` field or a schema version bump, would change the record shape, the canonical view and every verifier's field mapping. The rule needs none of that.
- **Standard Ed25519.** Any Ed25519 library can verify the signature once it rebuilds the 97 byte commitment. Verifiers only need the SHA-512 function and the prefix.

## Alternatives considered

1. **Ed25519ph with `MessageType: DIGEST`.** KMS supports it for messages of any size. The signatures are Ed25519ph, not pure Ed25519, so every existing verifier and every third party implementation would reject them. Rejected.
2. **Sign trust records with a local key and keep KMS for the small authorization only.** Simple, but it puts the durable evidence signing key outside KMS custody and weakens the key custody story ADR-0009 set out to build. Rejected.
3. **Shrink the signed content.** Not reliable. Connector evidence and authorization parameters are not bounded, so a record can always exceed 4096 bytes. Rejected.
4. **Store a scheme marker on each record.** Requires a schema change, a migration story for old records, and an update to every verifier's field mapping. The length triggered rule gives the same result without those. Rejected.

## Security analysis

- **Domain separation.** The prefix includes a NUL byte. A canonical JSON message starts with `{`, so a raw signature over a real message can never start with the prefix, and a commitment signature cannot be replayed as a raw signature over a small message.
- **No downgrade.** A commitment signature over a message of 4096 bytes or fewer is rejected. An attacker cannot present a small message with a commitment signature. Tests cover the exact boundary at 4096 and 4097 bytes.
- **Binding.** The commitment covers SHA-512 of the entire message, so changing any byte breaks verification. Ed25519 already hashes its input internally, so signing the digest does not reduce the binding to the original message below the collision resistance of SHA-512.
- **Accepting both forms for large messages.** Accepting a raw signature over a large message is required, because a local key signer has always signed large messages raw and those records exist. Both forms are signed by the same key over the same message, so accepting either does not widen what an attacker can forge.

## Compatibility and obligations

- **Records and authorizations issued before this change** verify unchanged in every verifier.
- **Verifiers that do not implement the rule** will reject a record or authorization over 4096 bytes that was signed by KMS. The TypeScript packages and the Python SDK are updated in the same change. **Any third party verifier must implement the rule** to verify large KMS signed artifacts. The rule is fully specified above, and the Python module is a compact reference implementation.
- **`@parmana/envelope-verifier` consumers** at receiving systems only need an update when an authorization is larger than 4096 bytes, which requires large parameters.
- **The Python SDK** should be released with this change so Python consumers can verify large records.

## Verification status

Verified in tests:

- `packages/crypto/tests/unit/signature-commitment.test.ts`: the boundary, tamper, wrong key, wrong message, no downgrade, raw backward compatibility, and an end to end sign and verify of a 30,000 byte artifact through a signer that enforces the KMS limit exactly as the real service does. A naive signer fails on the same artifact, reproducing the production error.
- `packages/crypto/tests/unit/kms-signer.test.ts`: a message of exactly 4096 bytes is sent raw, a longer message is sent as the 97 byte commitment and never as the raw message.
- `python/tests/test_offline_verifier.py`: TypeScript signs a large record as a commitment and the independent Python verifier accepts it, rejects a tampered copy, and rejects a commitment signature over a small message.

Verified live: production commit 333786a, one synthetic `paytm:refund` through `/execute` returned `200` with a full Execution Trust Record. Its canonical form was 4965 bytes, over the 4096 byte KMS limit. The signature does not verify as a raw Ed25519 signature and does verify as the commitment signature, made by the real KMS key (keyId `default`). `verifyExecutionTrustRecordOffline` accepted the record against the public key served by the live `GET /keys/default`, with `hashValid` and `legacySignatureValid` both true. The response carried `verifications[0].status` of `VERIFIED`, a signed chain and a signed receipt, and the runtime log had no `ValidationException`. The same request path returned `500` on the build before this fix.

## Consequences

- A full Execution Trust Record can be signed under KMS.
- Signature verification for large messages does one extra SHA-512 and one extra Ed25519 verification only when the raw check fails.
- This does not address G-52: the connector can be called before the record is signed, so a signing failure after the connector call still leaves an executed action without a signed trust record. That needs its own decision.
