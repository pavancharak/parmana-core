# 3.13 Hybrid (Ed25519 + ML-DSA-65) Signing Capability (Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1634-1675.

## Exact claim text

## 3.13 Hybrid (Ed25519 + ML-DSA-65) Signing Capability (Scoped)

Trust Records and Receipts can be dual-signed with both Ed25519 and ML-DSA-65 (post-quantum) at once, and verification can require both to independently pass. This is a built, tested capability, not yet a deployment: `CRYPTO_MODE` remains `single` by default, Ed25519 alone, everywhere this codebase runs today, including the production deployment (`parmana-api-real.vercel.app`). This claim is about what exists and is proven correct when explicitly turned on, not about what is currently running.

`HybridSignatureProvider` (`packages/crypto/src/HybridSignatureProvider.ts`) signs an artifact with both algorithms and verifies fail-closed: `verify()` requires exactly one entry matching the primary algorithm and one matching the secondary — a missing, extra, duplicated, or wrong-algorithm entry rejects, never a partial pass. `ExecutionTrustRecord` and `Receipt` (`packages/shared/src/domain/execution-trust-record.ts`, `receipt.ts`) gained two optional fields, `schemaVersion` and `signatures` (an array of `SignatureEntry`, `packages/shared/src/domain/signature-entry.ts`), additive only: the pre-existing single `signature` field is computed exactly as before, over exactly the same canonical content as before, so every record signed before this capability existed — and every record signed after it while `CRYPTO_MODE=single` — verifies completely unchanged. `signatures` is populated, and `schemaVersion` set to `2`, only when `CRYPTO_MODE=hybrid` is active at signing time.

`CRYPTO_MODE` (`packages/shared/src/config/CryptoAlgorithms.ts`'s `CryptoModes`, validated by `parseCryptoMode` in `ConfigValidation.ts` the same way every other config enum in this codebase is — an invalid value now fails closed at startup, rather than the untyped pass-through it was before this capability existed) is read by `VerificationCrypto.signHybrid()` and `ReceiptCrypto.createReceipt()` specifically, not globally: every other signing surface in this codebase (execution authorization, gateway attestation, connector signing) reads only `PRIMARY_SIGNATURE_PROVIDER` and is completely unaffected by `CRYPTO_MODE`, whatever it's set to. `BusinessTrustRecordBuilder` calls `signHybrid()`, in addition to its existing, unchanged `sign()` call, exactly when `CRYPTO_MODE=hybrid`. Verification mirrors this: `VerificationCrypto.verifySignature()` always checks the legacy `signature` field, and additionally, only when a record's `signatures` array is present and non-empty, requires every entry in it to independently verify too — both checks must pass for a hybrid-shaped record; a record with no `signatures` field verifies exactly as it always has.

The secondary (ML-DSA-65) key lives at a distinct keyId, `default-secondary` (`DEFAULT_SECONDARY_KEY_ID`, `packages/crypto/src/KeyProvider.ts`), alongside the existing `default` Ed25519 key under the same `PARMANA_KEY_DIR` — generated with `npm run generate:hybrid-secondary-key`. A missing secondary key file, or `CRYPTO_MODE=hybrid` without `SECONDARY_SIGNATURE_PROVIDER` configured, fails closed (a thrown error, not a silent single-signature fallback) the first time hybrid signing is attempted.

**Update (2026-10-03, audit):** "the first time hybrid signing is attempted" was after the action had been released, so a missing key meant a released action with no Trust Record. The server now refuses to start in `CRYPTO_MODE=hybrid` unless every key pair the hybrid path reads is present (`assertSigningKeyMaterialConfigured`). It also refuses `CRYPTO_MODE=hybrid` with `KEY_PROVIDER=aws-kms`: both entries of the hybrid `signatures` array are signed with local key files, the Ed25519 one included, and under KMS that key has no local file. Evidence: `packages/api/tests/unit/bootstrap/assert-signing-key-material-configured.test.ts` (3 new cases).

**Required caveat, load-bearing:** The separately published verifier (3.12), the public SDK used for independent third-party verification, does not yet recognize the `signatures`/`schemaVersion` envelope shape. Today, a third party verifying a hybrid-signed record through the separately published verifier checks the legacy `signature` field only — that check is genuinely correct, not a false pass, since the legacy field remains a real, valid Ed25519 signature over the record. But it is a partial verification: it does not check the ML-DSA-65 signature, and therefore does not confirm the full hybrid guarantee this capability is designed to eventually provide. Updating the separately published verifier to recognize the new envelope shape is untracked, separate follow-on work, not part of this capability and not a dependency of it (see 3.12).

**Update (2026-10-03):** the caveat above is resolved for the separately published verifier and later (3.12): `verifyExecutionTrustRecordOffline` checks every entry in the `signatures` array as well as the legacy field, and reports `hybridSignaturesValid` separately, so a third party can confirm the full hybrid guarantee through the public package. Earlier versions of the separately published verifier still check the legacy field only.

Evidence

- `packages/crypto/src/HybridSignatureProvider.ts`

- `packages/shared/src/domain/signature-entry.ts`, `execution-trust-record.ts`, `receipt.ts` (the additive `schemaVersion`/`signatures` fields)

- `packages/shared/src/config/CryptoAlgorithms.ts` (`CryptoModes`), `ConfigValidation.ts` (`parseCryptoMode`), `Config.ts` (`crypto.mode`)

- `packages/crypto/src/VerificationCrypto.ts` (`signHybrid`, hybrid-aware `verifySignature`/`verify`), `ReceiptCrypto.ts` (hybrid-aware `createReceipt`)

- `packages/crypto/src/KeyProvider.ts` (`DEFAULT_SECONDARY_KEY_ID`), `scripts/generate-keypair.ts` (`--force`-gated overwrite protection), `package.json` (`generate:hybrid-secondary-key`)

- `packages/runtime/src/BusinessTrustRecordBuilder.ts` (calls `signHybrid()` additively when `CRYPTO_MODE=hybrid`)

- `packages/crypto/tests/unit/hybrid-signature-provider.test.ts` (7 tests: sign+verify round trip, tampered second signature rejected, second signature missing entirely rejected — not a silent downgrade to single-signature verification, duplicated single-algorithm array rejected, signature from the wrong keypair rejected, tampered artifact rejected, missing secondary key file fails closed on `sign()`)

- `packages/runtime/tests/unit/verification-service-hybrid.test.ts` (4 tests, through the real `BusinessTrustRecordBuilder` → `VerificationService` path): a hybrid-signed record verifies end to end with two independent signature entries present; a legacy-shaped record with `schemaVersion`/`signatures` stripped still verifies unchanged even while the process runs `CRYPTO_MODE=hybrid`; a hybrid record with a corrupted secondary signature is rejected; a hybrid record with the secondary signature stripped entirely is rejected

- `packages/runtime/tests/integration/receipt-hybrid.integration.test.ts` (2 tests, through the real `ReceiptService` path): a hybrid-signed Receipt's `signatures` independently re-verify via `HybridSignatureProvider` from outside the class that produced them; a tampered hybrid Receipt signature is rejected

- `packages/shared/tests/unit/config-validation.test.ts` (`parseCryptoMode` cases: selects the configured mode, defaults to `single` when unset, throws naming the invalid value)

- `docs/internal/VERIFICATION-GAPS.md` G-4 (the gap-tracking record of exactly which signing surfaces this covers and which it doesn't)

---


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `packages/api/tests/unit/bootstrap/assert-signing-key-material-configured.test.ts`: EXISTS
- `packages/crypto/src/HybridSignatureProvider.ts`: EXISTS
- `packages/crypto/src/KeyProvider.ts`: EXISTS
- `packages/crypto/src/VerificationCrypto.ts`: EXISTS
- `packages/crypto/tests/unit/hybrid-signature-provider.test.ts`: EXISTS
- `packages/runtime/src/BusinessTrustRecordBuilder.ts`: EXISTS
- `packages/runtime/tests/integration/receipt-hybrid.integration.test.ts`: EXISTS
- `packages/runtime/tests/unit/verification-service-hybrid.test.ts`: EXISTS
- `packages/shared/src/config/CryptoAlgorithms.ts`: EXISTS
- `packages/shared/src/domain/execution-trust-record.ts`: EXISTS
- `packages/shared/src/domain/signature-entry.ts`: EXISTS
- `packages/shared/tests/unit/config-validation.test.ts`: EXISTS
- `scripts/generate-keypair.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/unit/bootstrap/assert-signing-key-material-configured.test.ts` | passed | 15 | 15 | 0 |
| `packages/crypto/tests/unit/hybrid-signature-provider.test.ts` | passed | 7 | 7 | 0 |
| `packages/runtime/tests/integration/receipt-hybrid.integration.test.ts` | passed | 2 | 2 | 0 |
| `packages/runtime/tests/unit/verification-service-hybrid.test.ts` | passed | 9 | 9 | 0 |
| `packages/shared/tests/unit/config-validation.test.ts` | passed | 49 | 49 | 0 |
