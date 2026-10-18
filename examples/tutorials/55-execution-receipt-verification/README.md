# Tutorial 55 — Execution Receipt Verification

## Historical note

This tutorial previously "verified" the dead `ExecutionPermit`/`ExecutionTrustAttestation`/`ExecutionReceipt` cluster via `ExecutionReceiptVerifier` — which performed only a structural check (`version === 1`, `permit`/`trustRecord` are defined), no cryptography at all. That whole cluster had zero live callers and zero test coverage, and was deleted by the Hybrid Signature Support milestone (Phase A). It now demonstrates real, cryptographic, fail-closed verification.

## Objective

Verify a hybrid-signed Execution Trust Record via `application.verify()` — the same code path `VerificationService` exposes to `POST /verify` — and then demonstrate what happens when one of its two signatures is tampered with.

## What You'll Learn

- `application.verify()` on a genuine hybrid-signed record returns `VERIFIED`
- Tampering with just the ML-DSA-65 entry in `signatures[]` (leaving the legacy Ed25519 `signature` field untouched and still individually valid) still fails the whole record — **not** a silent downgrade to checking only the legacy field
- The exact failure message names the check that failed ("Signature check failed"), not a generic error

## Running the Tutorial

```bash
npx tsx examples/tutorials/55-execution-receipt-verification/run.ts
```

## Why This Matters

This is the property that makes hybrid signing meaningful rather than decorative: if verification silently fell back to the legacy signature the moment the second one failed, an attacker who could forge only the classical algorithm would defeat the whole point of adding a second one. `VerificationCrypto.verifySignature()` requires every entry in `signatures[]` to independently pass, and this tutorial proves it against a real tampered record rather than asserting it in prose.

**Not yet true, stated plainly:** `CRYPTO_MODE=hybrid` is opt-in config, not the default. This tutorial sets the environment variable itself so it's self-contained.

## Next Tutorial

Continue with **Tutorial 56 – Complete Execution Flow**, where build, receipt, and both verification cases are chained into one script.
