# Hybrid (Ed25519 + ML-DSA-65)

**Production ready: no.** It is built and tested. It is off everywhere, including production, and it has blockers the repo lists.

## What it is

Trust Records and Receipts are signed with both Ed25519 and ML-DSA-65 at once. Verification can require both to pass. `HybridSignatureProvider` verifies fail-closed: exactly one entry for each algorithm must be present. A missing, extra, duplicated, or wrong-algorithm entry rejects the record (claim 3.13).

Turned on with `CRYPTO_MODE=hybrid`. The default is `CRYPTO_MODE=single`.

## Status

- **Built:** yes (claim 3.13, scoped).
- **Tested:** yes in CI on Node 24. The hybrid and whole-record suites skip in the local sandbox (Node 22). A guard test that fails on CI when ML-DSA-65 is unavailable is in a separate change, so a skip on CI cannot pass silently.
- **In production:** no. `CRYPTO_MODE` is `single` everywhere, including `parmana-api-real.vercel.app` (claim 3.13).
- **SDKs and verifier:** the Python and TypeScript SDKs verify hybrid records in full, including the schema version 3 whole-record message (claim 2.59). The published verifier 2.0.1 verifies the hybrid `signatures` array (`verifyHybridSignatures` in `src/verify.mjs`). See [schema-version-3-and-verifier.md](schema-version-3-and-verifier.md).

## Blockers

1. **Schema version 3 is not on.** The server still issues schema version 2. Turning schema version 3 on is a separate step, tracked in parmana-core #291 (claim 2.59).
2. **Hybrid cannot use AWS KMS.** The server refuses `CRYPTO_MODE=hybrid` with `KEY_PROVIDER=aws-kms`, because both hybrid entries are signed with local key files, the Ed25519 one included (claim 3.13, update of 2026-10-03).
3. **Node 24 at runtime.** ML-DSA-65 needs Node 24 or later. The production runtime is not confirmed to be on it.
4. **Secondary key provisioning.** The ML-DSA-65 key is `default-secondary`, generated with `npm run generate:hybrid-secondary-key`. It must sit beside the Ed25519 key under `PARMANA_KEY_DIR`. The server refuses to start if any key the hybrid path reads is missing (claim 3.13).
5. **No deployment decision.** No cutover is recorded.

## How to make it production ready

1. Turn on schema version 3 (parmana-core #291) and verify it end to end in staging.
2. Move the hybrid signing keys to a custody that is not a local file, or record a decision that local custody is acceptable for hybrid. Today the answer is "local only".
3. Confirm the production runtime is on Node 24.
4. Generate the `default-secondary` key pair under the same custody as `default`.
5. Set `CRYPTO_MODE=hybrid` and `SECONDARY_SIGNATURE_PROVIDER` in staging. Confirm the server starts, issues records, and that each record verifies offline with both public keys.
6. Record the cutover in the claims register and update this file.

## Why it is not ready

Blockers 1 to 3 are open, and blocker 2 is a design choice: hybrid cannot yet use the custody that production's Ed25519 key may use. Until these close, enabling hybrid would sign with keys that live on disk.

## When

The repo sets no date. The gate is blockers 1 to 5.
