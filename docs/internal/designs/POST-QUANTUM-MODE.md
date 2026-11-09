# Design: post-quantum signing mode (CRYPTO_MODE=pq)

Status: **proposed, for decision.** No code is written. This document records what the code does today, what a
post-quantum-only mode would mean, the options, the evidence from a test run, and the decisions the owner needs to make.

Related: `docs/internal/runbooks/VALIDATION-RECORD-2026-11.md`, section 7 (`pq` refused at startup); G-121 in
`docs/internal/VERIFICATION-GAPS.md` (verifiers read only schema version 2); `packages/shared/src/config/CryptoAlgorithms.ts`.

---

## 1. Question

Should the product sign with a post-quantum algorithm only, and if so, through which setting?

Today `CRYPTO_MODE` accepts `single` and `hybrid`. It reserves `pq`, which is refused at startup with "CRYPTO_MODE=pq is not
implemented in this build". The `pq` value has no code behind it.

## 2. What the code does today

Checked on `main` at `e8d0b83` and later:

- **`single`**: exactly one signature provider, `PRIMARY_SIGNATURE_PROVIDER`, signs and verifies everything.
- **`hybrid`**: `PRIMARY_SIGNATURE_PROVIDER` and `SECONDARY_SIGNATURE_PROVIDER` both sign Execution Trust Records and
  Receipts. Verification requires both to pass (`HybridSignatureProvider`).
- **`pq`**: reserved. Refused by `parseCryptoMode` (`ConfigValidation.ts`), with the test `refuses CRYPTO_MODE=pq at startup`
  (`packages/shared/tests/unit/config-validation.test.ts`, passing).
- **Algorithms**: `CryptoAlgorithms.ts` defines `ed25519`, `dilithium3` (ML-DSA-65), `dilithium5` and `sphincs-plus`. The
  alias `ml-dsa-65` is accepted for `dilithium3` (`SIGNATURE_ALGORITHM_ALIASES`).

**The key finding.** A post-quantum-only deployment can already be expressed without a new mode:
`CRYPTO_MODE=single` with `PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65`. The `pq` value would add nothing new.

## 3. Evidence from a test run

Run on 2026-11-09 with `CRYPTO_MODE=single PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65`, under Node 24.22.1, after `npm run build`:

- 99 test files failed, 550 tests failed, 3099 passed, 120 skipped.
- The failures have one cause: `CryptoError: sign() expected a "ml-dsa-65" key but received "ed25519".`
- The cause is in the test setup. `vitest.setup.ts` writes an Ed25519 key as `default`, whatever the configured primary
  algorithm. The product correctly refuses to sign with a key of the wrong type.

So a pq-only deployment is blocked in the tests by the harness, not by the product. Making the setup generate the primary key
for the configured algorithm would remove that cause. That run is evidence that the path needs work, not that it works:
after the harness is fixed, the full suite has to be run again.

## 4. Options

| Option                             | What it is                                                   | Protects against                                           | Cost                                                                                           |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **A. Keep hybrid** (current)       | Ed25519 and ML-DSA-65 both sign; both must verify            | Either algorithm being broken                              | Two signatures per record; the verifier must read schema version 3 (G-121)                     |
| **B. ML-DSA-only, single mode**    | `CRYPTO_MODE=single`, `PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65` | A quantum break of Ed25519 (no Ed25519 signature to trust) | Only parties that verify ML-DSA-65 can check records; same G-121 dependency; larger signatures |
| **C. A separate `CRYPTO_MODE=pq`** | A new mode that means the same as B                          | Same as B                                                  | A second way to say the same thing; more configuration to validate; not recommended            |

**Recommendation:** keep option A as the default. Treat option B as a supported deployment, not a new mode, once its
prerequisites are met (section 5). Remove the reserved `pq` value, or document it as an alias for B, so the configuration
does not promise a mode that is not built.

## 5. Prerequisites before option B is offered

1. **G-121 closed.** The published verifier and the SDKs read schema version 3 and ML-DSA-65. Until then, a pq-only record
   cannot be verified outside this repository.
2. **The test harness generates the primary key for the configured algorithm.** Section 3 shows the blocker.
3. **The full suite passes in option B**, in the same way as the default and hybrid runs.
4. **KMS support confirmed.** Production may use `KEY_PROVIDER=aws-kms`. The code refuses hybrid with KMS, because the Ed25519
   key is in KMS. Whether KMS can hold an ML-DSA-65 key has not been checked. This is an open question.
5. **Performance and size checked.** ML-DSA-65 signatures are larger than Ed25519 signatures. The record size and the write
   path have not been measured.

## 6. Tests required before option B is offered

1. The harness generates an ML-DSA-65 primary key when `PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65`, and an Ed25519 key otherwise.
2. A record signed in option B verifies with the ML-DSA-65 public key, and fails with any other key.
3. A record signed in option B is refused by a verifier that does not support ML-DSA-65, with a named reason. It is not
   accepted as valid.
4. The full suite passes with `CRYPTO_MODE=single PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65`.
5. `CRYPTO_MODE=pq` remains refused, or is removed, as decided in section 4.

## 7. Open questions for the owner

1. **Is option B needed, or is option A enough?** Option A already protects against either algorithm being broken. Option B
   is needed only if the business requires that no Ed25519 signature is trusted at all.
2. **What happens to the reserved `pq` value?** Remove it, or keep it as an alias for option B.
3. **Can the production KMS hold an ML-DSA-65 key?** This decides whether option B is possible under `KEY_PROVIDER=aws-kms`.
4. **Timing.** Option B depends on G-121. When is G-121 to be closed?

## 8. Not decided here

- Whether the business needs post-quantum-only signing.
- The KMS question in section 7.3.
- Any change to the signature algorithms themselves.
