# 2.37 Large Message Signing Under AWS KMS (Commitment Scheme)

Source: CLAIMS.md (commit d1d63c6), lines 1263-1286.

## Exact claim text

## 2.37 Large Message Signing Under AWS KMS (Commitment Scheme)

An Execution Trust Record, an execution authorization, or any other artifact whose canonical form is longer than 4096 bytes can be signed with a KMS held Ed25519 key and verified independently. AWS KMS refuses a raw Ed25519 message over 4096 bytes, so a larger artifact is signed through a fixed-size commitment.

The decision is recorded in `docs/internal/adr/ADR-0010-Large-Message-Signing-Under-KMS.md`:

- A message of 4096 bytes or fewer is signed and verified raw, exactly as before, so every signature issued before this change stays valid.
- A longer message is signed by the KMS signer as a fixed 97 byte commitment, the prefix `PARMANA-ED25519-LARGE-MESSAGE-V1` and a NUL byte followed by the SHA-512 digest of the message. The signature is an ordinary Ed25519 signature.
- The scheme depends only on message length, so no marker or schema change is stored on any record.
- A verifier accepts a raw signature for any message, and additionally the commitment form only for a message over 4096 bytes. A commitment signature over a message at or below the limit is rejected, so a small message cannot be downgraded to the commitment form.

Scope, stated plainly:

- The TypeScript packages and the Python SDK implement the rule. A third party verifier must implement it to verify a large KMS signed artifact. It is fully specified in the ADR and the Python module is a compact reference.
- This makes signing possible. It does not change the ordering in which a request is processed. The connector can still be called before the trust record is signed, so a signing failure after the connector call leaves an executed action without a signed record (G-52 in `docs/internal/VERIFICATION-GAPS.md`).

Evidence

- `packages/crypto/src/SignatureCommitment.ts`, `providers/signer/KmsSigner.ts`, `providers/signature/Ed25519SignatureProvider.ts`
- `packages/crypto/tests/unit/signature-commitment.test.ts` (boundary at 4096 and 4097 bytes, tamper, wrong key, wrong message, no downgrade, raw backward compatibility, end to end sign and verify of a 30,000 byte artifact through a signer that enforces the KMS limit, and a naive signer that fails on the same artifact)
- `packages/crypto/tests/unit/kms-signer.test.ts` (exactly 4096 bytes sent raw, longer sent as the 97 byte commitment and never raw)
- Live evidence, 2026-09-20, production commit 333786a: canonical record 4965 bytes, raw signature check false, commitment signature check true, offline verifier `valid: true` against `GET /keys/default`, `verifications[0].status` `VERIFIED`, no `ValidationException` in the runtime log
- `python/parmana/crypto/offline_verifier.py`, `python/tests/test_offline_verifier.py` (TypeScript signs a large record as a commitment and the independent Python verifier accepts it, rejects a tampered copy, and rejects a commitment signature over a small message), `scripts/generate-offline-verifier-fixture.ts`

## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `docs/internal/adr/ADR-0010-Large-Message-Signing-Under-KMS.md`: EXISTS
- `packages/crypto/src/SignatureCommitment.ts`: EXISTS
- `packages/crypto/tests/unit/kms-signer.test.ts`: EXISTS
- `packages/crypto/tests/unit/signature-commitment.test.ts`: EXISTS
- `python/parmana/crypto/offline_verifier.py`: EXISTS
- `python/tests/test_offline_verifier.py`: EXISTS
- `scripts/generate-offline-verifier-fixture.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                 | Status | Tests | Passed | Skipped |
| --------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/crypto/tests/unit/kms-signer.test.ts`           | passed | 31    | 31     | 0       |
| `packages/crypto/tests/unit/signature-commitment.test.ts` | passed | 12    | 12     | 0       |
| `python/tests/test_offline_verifier.py`                   | passed | 5     | 5      | 0       |
