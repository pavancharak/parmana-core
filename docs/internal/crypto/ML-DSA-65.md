# ML-DSA-65 signing (post-quantum, on its own): current state, limits, progress and next steps

Status as of 2026-11-09. This document covers ML-DSA-65 used alone, with no Ed25519 signature. It is one of three documents:
`ED25519.md`, `HYBRID.md` and `ML-DSA-65.md`.

ML-DSA-65 is the NIST standard FIPS 204 algorithm at security category 3. In this codebase it is called `dilithium3`, and the
configuration alias `ml-dsa-65` is accepted for it.

## 1. What ML-DSA-65 alone is in this product

The configuration is `CRYPTO_MODE=single` with `PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65`. Every record is signed with ML-DSA-65 only,
and no Ed25519 signature is made or trusted for it.

The purpose is post-quantum signing that does not depend on Ed25519. The business has decided that this is required
(`docs/internal/designs/POST-QUANTUM-MODE.md`, decision 1). It is an option to be offered; it is not the default.

The code that exists today:

- The crypto package has a provider for ML-DSA-65 (`Dilithium3SignatureProvider`). It refuses a key whose type is not ML-DSA-65.
- Startup and the signing path accept `ml-dsa-65` as the primary algorithm.
- The local key provider can hold an ML-DSA-65 key pair, created with `scripts/generate-keypair.ts --algorithm dilithium3`.
- The verifier repository (`parmana-verifier`) has ML-DSA-65 checks, which need Node 24 and OpenSSL 3.5 or later.

## 2. Current limits

| #   | Limit                                                                                                                                                                                                                                  | Where it applies                                                                | Effect                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **The test harness cannot run this configuration.** `vitest.setup.ts` writes an Ed25519 key as the default key, whatever the configured algorithm.                                                                                     | Full test suite under `CRYPTO_MODE=single PRIMARY_SIGNATURE_PROVIDER=ml-dsa-65` | 99 files fail with `sign() expected a "ml-dsa-65" key but received "ed25519"`. The product refuses correctly; the harness is wrong.                     |
| L2  | **KMS cannot sign with ML-DSA-65.** `KmsSigner` supports only `ECC_NIST_EDWARDS25519`.                                                                                                                                                 | `packages/crypto/src/providers/signer/KmsSigner.ts`                             | An AWS KMS deployment cannot use this configuration until the signer supports the ML-DSA key spec.                                                      |
| L3  | **AWS KMS `RAW` messages are limited to 4 KB.** Above that, KMS needs the `EXTERNAL_MU` message type, which the signer does not use.                                                                                                   | KMS, once L2 is solved                                                          | Records above 4 KB would fail, the same way gap G-59 did under Ed25519, unless `EXTERNAL_MU` is implemented.                                            |
| L4  | **Third-party verifiers may not read ML-DSA-65 records.** Gap G-121 says the published verifier and the SDKs read only schema version 2.                                                                                               | Consumers outside this repository                                               | A record signed with ML-DSA-65 alone cannot be checked outside this repository until G-121 is closed. This is the main blocker for the business use.    |
| L5  | **Interoperability with KMS is not checked.** KMS uses the algorithm name `ML_DSA_SHAKE_256` at the `ML_DSA_65` key spec. Whether its signatures verify under this repository's provider, and under the verifier, has not been tested. | Any KMS-produced signature                                                      | Unknown until tested with a real KMS-produced signature.                                                                                                |
| L6  | **Approvers and business sources cannot use ML-DSA-65 keys.** They are Ed25519-only.                                                                                                                                                   | `approval-issuers.ts`, `HttpBusinessSignalSource`                               | Approvals and business-source answers stay on Ed25519 in this configuration. This needs a decision before the configuration is offered for those flows. |
| L7  | **Signatures and keys are larger** than Ed25519. Record size and write time are not measured.                                                                                                                                          | Storage and write path                                                          | Not known; not measured.                                                                                                                                |
| L8  | **`CRYPTO_MODE=pq` is refused.** It is the reserved value, and the decision is to discard it.                                                                                                                                          | `ConfigValidation.ts`                                                           | The configuration to use is `single` with `ml-dsa-65`, not `pq`. The value is still in the code until the removal is made.                              |

## 3. Progress

- The provider and the configuration are in place. The signing path accepts ML-DSA-65 as the primary algorithm.
- A full run in this configuration was attempted on 2026-11-09. It failed in 99 files because of L1 only; the product's refusal
  of the wrong key type was the correct behaviour. No run has yet passed in this configuration, because the harness is not fixed.
- The verifier has ML-DSA-65 checks, and they pass under Node 24.
- The decision that ML-DSA-only is required, and that `pq` is discarded, is recorded in `POST-QUANTUM-MODE.md` (section 1).
- The KMS question was checked against AWS documentation (`POST-QUANTUM-MODE.md`, section 5).

## 4. Next steps

1. **Fix the harness (L1).** Generate the primary key for the configured algorithm in `vitest.setup.ts`. Then run the full suite
   in this configuration, and record the result.
2. **Remove the reserved `pq` value (L8)**, in its own PR, with its test updated to expect an unknown value.
3. **Add the KMS ML-DSA-65 key spec to `KmsSigner` (L2)**, with `EXTERNAL_MU` for records above 4 KB (L3). Test it against a real
   KMS key in the production account, or a test account, with a non-production key.
4. **Test interoperability (L5)**: a KMS-produced ML-DSA-65 signature must verify under the repository's provider and under the
   verifier.
5. **Close G-121 (L4)** so that consumers outside the repository can read schema version 3 with ML-DSA-65.
6. **Decide the approver and business-source story (L6)** before offering the configuration to those flows.
7. **Measure record size and write time (L7)** in this configuration, against Ed25519 and hybrid.

## 5. Not covered here

- Ed25519 alone (see `ED25519.md`).
- Ed25519 and ML-DSA-65 together (see `HYBRID.md`).
- The post-quantum decisions themselves (see `docs/internal/designs/POST-QUANTUM-MODE.md`).
