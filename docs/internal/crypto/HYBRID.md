# Hybrid signing (Ed25519 and ML-DSA-65): current state, limits, progress and next steps

Status as of 2026-11-09. This document covers hybrid signing, where two signatures are made over the same record: Ed25519
and ML-DSA-65. It is one of three documents: `ED25519.md`, `HYBRID.md` and `ML-DSA-65.md`.

## 1. What hybrid is in this product

The configuration values are `CRYPTO_MODE=single` (default) and `CRYPTO_MODE=hybrid`. The reserved `pq` value is removed (PR #544).

With `CRYPTO_MODE=hybrid`, every signed record carries two signatures, from two providers:

- `PRIMARY_SIGNATURE_PROVIDER` (default `ed25519`).
- `SECONDARY_SIGNATURE_PROVIDER`, which must be set (for example `dilithium3`, the internal name of ML-DSA-65).

Verification requires both to pass. A record is valid only when both signatures verify against their own keys.

The purpose is to protect against either algorithm being broken. A forger would need to break both.

Hybrid needs both key pairs in `PARMANA_KEY_DIR`: `default` (Ed25519) and `default-secondary` (ML-DSA-65). The API refuses to start
without them.

Records written in hybrid mode use schema version 3: the signature covers every field except the signature envelope,
`verifications` and `receipts`. Schema version 2 covers only seven fields, which is weaker. The verifier refuses version 2
unless `allowLegacyV2` is set in the trust file.

## 2. Current limits

| #   | Limit                                                                                                                                | Where it applies                        | Effect                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Hybrid is refused with `KEY_PROVIDER=aws-kms`.                                                                                       | `assertSigningKeyMaterialConfigured.ts` | A hybrid deployment must use local key files. The Ed25519 key cannot be in KMS while the secondary key is local.                                                                                                                                      |
| L2  | Both key pairs must exist locally before start.                                                                                      | Startup check                           | A missing `default-secondary` stops the server, by design.                                                                                                                                                                                            |
| L3  | Third-party verifiers may not read schema version 3. Gap G-121 says the published verifier and the SDKs read only version 2.         | Consumers outside this repository       | A hybrid record can be unreadable to them. The verifier repository (`parmana-verifier`, commit `64a2950`) reads version 3, and its own changelog says so. **These two statements disagree**, and the published package's version is not checked here. |
| L4  | Records written before hybrid was switched on have no secondary signature, and are verified under the rules of their schema version. | Verification of older records           | A `HYBRID_REQUIRED_FROM` cutover is needed to refuse records created after a date that have no hybrid envelope.                                                                                                                                       |
| L5  | The test harness is hybrid-capable as of PR #541, but the hybrid-only tests depend on the harness.                                   | `vitest.setup.ts`                       | Tests that assume single mode need `useSingleSignatureMode()`. Any new test that changes the mode must restore it.                                                                                                                                    |
| L6  | Performance and record size are not measured. Two signatures make each record larger and each write slower.                          | Write path, storage                     | Not known; not measured.                                                                                                                                                                                                                              |

## 3. Progress

- Hybrid signing is implemented in the crypto package (`HybridSignatureProvider`) and the record path.
- The full suite passes in hybrid mode, after the harness fixes in PR #541: 367 files passed, 24 skipped; 3682 tests passed,
  89 skipped (Node 24.22.1). Before those fixes it failed in 43 files.
- The validation record (`docs/internal/runbooks/VALIDATION-RECORD-2026-11.md`, section 7) records this result.
- The verifier repository has tests for hybrid signatures, schema version 3 and the trust rules; they pass under Node 24
  (72 of 72).

## 4. Next steps

1. **Merge PR #541**, which contains the hybrid harness fixes.
2. **Resolve the verifier discrepancy (L3).** Check the published verifier package's version, and whether it reads schema
   version 3, then update G-121 to match.
3. **Measure record size and write time** for hybrid records, against single mode, using the same workload.
4. **Decide whether hybrid is the default** or stays optional. The post-quantum decision says ML-DSA-only must be available;
   it does not say hybrid is the default.
5. **Run hybrid against the sandbox** once the sandbox has the migrations applied, and record the result.

## 5. Not covered here

- Ed25519 alone (see `ED25519.md`).
- ML-DSA-65 alone, which is a different configuration: `CRYPTO_MODE=single` with `PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65` (see
- The hybrid suite passes on `main` only after PR #541 (the test-harness fixes) is merged.
  `ML-DSA-65.md`).
