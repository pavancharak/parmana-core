# Tutorial 107 — Offline Verification

## Objective

Prove the independent-verification claim literally, one level stronger than [Verify a
trust record independently](https://docs.parmanasystems.com/guides/verify-independently): use `verifyExecutionTrustRecordOffline`
(`packages/crypto/src/OfflineVerifier.ts`) with zero disk, network, or environment-variable
access at all — not "the server process happens to be stopped," but "this function was
never given a `PARMANA_KEY_DIR` in the first place." This closes PQC audit RED-1
(`docs/VERIFICATION-GAPS.md`): before this capability existed, every verification path in
this codebase — the unauthenticated HTTP routes and both SDKs' `VerificationApi`
wrappers — required a live call into Parmana's own server.

## What You'll Learn

- A genuinely signed `ExecutionTrustRecord` verifies against a public key supplied as a
  plain PEM string, with the function never touching `FileKeyProvider` or `PARMANA_KEY_DIR`
  (Scenario 1)
- A tampered record is caught by the recomputed `trustRecordHash` no longer matching the
  stored one, before signature verification even needs to run (Scenario 2)
- The wrong public key is rejected outright, not silently accepted (Scenario 3)
- `OfflineVerifier.ts` shares its canonical field mapping with the real, online
  `VerificationCrypto` via `ExecutionTrustRecordCanonicalView.ts` — one definition, not two
  independent reimplementations that could silently drift apart

## Running the Tutorial

```bash
npx tsx examples/tutorials/107-offline-verification/run.ts
```

Uses this checkout's real `default` signing key to produce a genuine record, then verifies
it with a function that never reads that key file again. See Tutorial 108 for how a real
third party — with no access to this checkout at all — obtains the public key it needs in
the first place.
