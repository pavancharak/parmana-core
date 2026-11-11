# 2.14 Configurable Post-Quantum Signing (ML-DSA-65)

Source: CLAIMS.md (commit d1d63c6), lines 307-330.

## Exact claim text

## 2.14 Configurable Post-Quantum Signing (ML-DSA-65)

**Claim.** The signing algorithm can be set to ML-DSA-65 (FIPS 204) as an alternative to Ed25519, through `PRIMARY_SIGNATURE_PROVIDER` (and `SECONDARY_SIGNATURE_PROVIDER` for hybrid signing). The `ml-dsa-65` name is accepted as an alias for the internal identifier `dilithium3`, which is kept unchanged for existing deployments.

**Scope.** Selecting ML-DSA-65 uses the same PEM key mechanism as the default Ed25519 provider (`FileKeyProvider`, key ID `default`). It requires Node.js 24 or later, for native `ml-dsa-65` support in `node:crypto`. Missing or mismatched key material fails closed: the process does not generate a replacement key or substitute another one.

**Crypto agility.** The same canonical record can be signed and verified by Ed25519 and by ML-DSA-65 as two separate single-algorithm operations, each with its own key pair, and with no hybrid envelope involved. `packages/crypto/examples/crypto-agility-proof.ts` runs this check by hand (`npx tsx packages/crypto/examples/crypto-agility-proof.ts`).

**Independent verification.** An offline verifier for the signed records is in `packages/crypto/src/OfflineVerifier.ts`, with a Python counterpart. The public keys are served at `GET /keys/:keyId` and `GET /.well-known/jwks.json`. Key IDs for verification can be rotated with `PARMANA_VERIFICATION_KEY_ID` and `PARMANA_VERIFICATION_SECONDARY_KEY_ID`. With `HYBRID_SIGNATURE_REQUIRED=true`, a hybrid record whose ML-DSA-65 signature is missing is refused rather than accepted as Ed25519-only.

**Limits.** As of 2026-10-20, production runs `CRYPTO_MODE=single`, so its records carry only the Ed25519 signature. No deployment was running hybrid signing on that date, and no live hybrid record had been verified through the API. Enabling hybrid signing in production is an operator decision that depends on key material (G-119 in `docs/internal/VERIFICATION-GAPS.md`). The statements above describe what is built and tested, not what runs in production.

Evidence

- `Dilithium3SignatureProvider`
- `FileKeyProvider`
- `scripts/generate-keypair.ts` (`--algorithm dilithium3` or `ml-dsa-65`)
- `packages/crypto/tests/unit/dilithium3-signature-provider.test.ts`
- `packages/crypto/tests/unit/dilithium3-cross-instance.test.ts`
- `packages/crypto/examples/crypto-agility-proof.ts`
- `packages/crypto/src/OfflineVerifier.ts`

Dated updates for this claim are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `packages/crypto/examples/crypto-agility-proof.ts`: EXISTS
- `packages/crypto/src/OfflineVerifier.ts`: EXISTS
- `packages/crypto/tests/unit/dilithium3-cross-instance.test.ts`: EXISTS
- `packages/crypto/tests/unit/dilithium3-signature-provider.test.ts`: EXISTS
- `scripts/generate-keypair.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/crypto/tests/unit/dilithium3-cross-instance.test.ts` | passed | 2 | 2 | 0 |
| `packages/crypto/tests/unit/dilithium3-signature-provider.test.ts` | passed | 4 | 4 | 0 |
