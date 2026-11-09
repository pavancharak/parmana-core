# Design: post-quantum signing

Status: **decided in part.** The owner has decided three points (section 7): ML-DSA-only signing is required, the reserved
`pq` value is discarded, and KMS support was checked (section 5). No code is written. This document records the decisions,
the state of the code, the evidence from a test run, and the work that remains.

Related: `docs/internal/runbooks/VALIDATION-RECORD-2026-11.md`, section 7 (`pq` refused at startup); G-121 in
`docs/internal/VERIFICATION-GAPS.md` (verifiers read only schema version 2); G-59 (KMS and the 4 KB message limit);
`packages/shared/src/config/CryptoAlgorithms.ts`; `packages/crypto/src/providers/signer/KmsSigner.ts`.

---

## 1. Decisions

| #   | Question                                      | Decision                                                                                                                                             |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Is ML-DSA-only signing needed?                | **Yes, required.** The business requires signing that does not depend on Ed25519. This is option B (section 3). Option A (hybrid) remains available. |
| 2   | What happens to the reserved `pq` value?      | **Discarded.** It is removed, with no alias. ML-DSA-only is configured with `CRYPTO_MODE=single` and `PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65`.         |
| 3   | Can the production KMS hold an ML-DSA-65 key? | **Yes, checked.** AWS KMS supports ML-DSA keys. Signing needs care (section 5). The repo's KMS signer does not support it yet.                       |

## 2. What the code does today

Checked on `main`:

- **`single`**: exactly one signature provider, `PRIMARY_SIGNATURE_PROVIDER`, signs and verifies everything.
- **`hybrid`**: both `PRIMARY_SIGNATURE_PROVIDER` and `SECONDARY_SIGNATURE_PROVIDER` sign. Verification requires both.
- **`pq`**: reserved. Refused by `parseCryptoMode` (`ConfigValidation.ts`), asserted by
  `packages/shared/tests/unit/config-validation.test.ts`. Discarded by decision 2.
- **Algorithms**: `CryptoAlgorithms.ts` defines `ed25519`, `dilithium3` (ML-DSA-65), `dilithium5` and `sphincs-plus`. The
  alias `ml-dsa-65` is accepted for `dilithium3`.
- **KMS**: `KmsSigner` supports one key spec, `ECC_NIST_EDWARDS25519`, with `ED25519_SHA_512`. It supports no ML-DSA key spec.

## 3. Options

| Option                  | What it is                                                   | Protects against                                          | Cost                                                                                           |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **A. Hybrid** (current) | Ed25519 and ML-DSA-65 both sign; both must verify            | Either algorithm being broken                             | Two signatures per record; verifiers must read schema version 3 (G-121)                        |
| **B. ML-DSA-only**      | `CRYPTO_MODE=single`, `PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65` | A break of Ed25519, since no Ed25519 signature is trusted | Only parties that verify ML-DSA-65 can check records; same G-121 dependency; larger signatures |

Option B is required (decision 1). Option A remains. Which one is the default is not decided here.

## 4. Evidence from a test run

Run on 2026-11-09 with `CRYPTO_MODE=single PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65`, under Node 24.22.1, after `npm run build`:

- 99 test files failed, 550 tests failed, 3099 passed, 120 skipped.
- Every failure has one cause: `CryptoError: sign() expected a "ml-dsa-65" key but received "ed25519".`
- The cause is the test setup. `vitest.setup.ts` writes an Ed25519 key as `default`, whatever the configured algorithm. The
  product correctly refuses to sign with a key of the wrong type.

So the blocker is the harness, not the product. The run is evidence that option B needs harness work. It is not evidence that
option B works; that needs a full run after the harness is fixed.

## 5. KMS support (decision 3)

Checked against AWS documentation and announcements:

- AWS KMS supports ML-DSA asymmetric signing keys, with three key specs: `ML_DSA_44`, `ML_DSA_65` and `ML_DSA_87`. They map to
  NIST security categories 2, 3 and 5.
- The signing algorithm is `ML_DSA_SHAKE_256`.
- **Message size.** KMS signs messages of up to 4 KB with the `RAW` message type. For larger messages, the caller must compute
  the 64-byte message representation (μ, from NIST FIPS 204 section 6.2) and send it with the `EXTERNAL_MU` message type.
- Keys are protected in FIPS 140-3 Level 3 hardware.

Implications for this repo:

1. **The 4 KB limit is a real risk.** Execution Trust Records can be larger than 4 KB. Gap G-59 records a production failure
   from exactly this limit under Ed25519. ML-DSA signing through KMS must use `EXTERNAL_MU` for large records, or the same
   failure returns.
2. **The KMS signer needs a new key-spec branch.** Today it accepts only `ECC_NIST_EDWARDS25519`.
3. **Interoperability is not checked.** KMS's `ML_DSA_SHAKE_256` and this repo's `dilithium3` provider must produce signatures that
   the same verifier accepts. This needs a test with a KMS-produced signature, not just a local one.

## 6. Prerequisites and remaining work

1. **G-121 closed.** The published verifier and the SDKs read schema version 3 and ML-DSA-65. Until then, an ML-DSA-only
   record cannot be verified outside this repository.
2. **The test harness generates the primary key for the configured algorithm** (section 4).
3. **The full suite passes** with `CRYPTO_MODE=single PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65`, as the default and hybrid runs do.
4. **The KMS signer supports ML-DSA-65** through `ML_DSA_65` keys and `EXTERNAL_MU` for records over 4 KB (section 5).
5. **Interoperability checked** with a KMS-produced signature, verified by the repo's provider and by the verifier (section 5).
6. **Performance and size measured.** ML-DSA-65 signatures are larger than Ed25519. The record size and the write path have not
   been measured.

## 7. Tests required

1. The harness generates an ML-DSA-65 primary key when `PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65`, and an Ed25519 key otherwise.
2. An ML-DSA-only record verifies with the ML-DSA-65 public key, and fails with any other key.
3. An ML-DSA-only record is refused by a verifier that does not support ML-DSA-65, with a named reason. It is not accepted as
   valid.
4. The full suite passes with `CRYPTO_MODE=single PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65`.
5. A record larger than 4 KB is signed through KMS with `EXTERNAL_MU`, and verifies. A record of 4 KB or less uses `RAW`.
6. `CRYPTO_MODE=pq` is refused as an unknown value, once the value is removed (decision 2).

## 8. Open questions

1. **Which is the default, A or B?** Decision 1 requires B to be available. It does not say which one is the default.
2. **When is G-121 closed?** Option B cannot be verified outside this repository until it is.
3. **Does a KMS-produced ML-DSA-65 signature verify with the repo's `dilithium3` provider and the verifier?** Not checked yet.

## 9. Not decided here

- The default between options A and B (open question 1).
- The timing of G-121.
- Any change to the signature algorithms themselves.
