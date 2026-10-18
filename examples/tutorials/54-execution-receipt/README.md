# Tutorial 54 — Execution Receipt

## Historical note

This tutorial previously combined the dead `ExecutionPermitBuilder`/`ExecutionTrustAttestationBuilder`/`ExecutionReceiptBuilder` cluster (Hybrid Signature Support milestone, Phase A: confirmed zero live callers, zero test coverage, deleted). It now demonstrates the real `Receipt` — the same artifact Tutorial 07 generates — with `CRYPTO_MODE=hybrid` active.

## Objective

Generate a real Receipt through the same production pipeline Tutorial 07 uses (`application.execute()` — Receipt generation is not a separate call), and confirm it carries both the unchanged legacy `signature`/`algorithm` fields and the additive `schemaVersion`/`signatures[]` fields, since `ReceiptCrypto.createReceipt()` is hybrid-aware the same way Trust Record signing is.

## What You'll Learn

- Receipt generation is part of `application.execute()`, not a separate step
- The legacy `signature`/`algorithm` fields are unchanged under hybrid mode
- `signatures[]` is populated on the Receipt independently of the Trust Record's own `signatures[]` — each artifact is separately hybrid-signed

## Running the Tutorial

```bash
npx tsx examples/tutorials/54-execution-receipt/run.ts
```

## Why This Matters

A Receipt is meant to be portable evidence, verifiable by a third party without trusting Parmana's own database. Hybrid signing extends that guarantee the same way it extends the Trust Record's: a Receipt whose legacy Ed25519 signature is ever broken still holds via its ML-DSA-65 signature, and vice versa.

**Not yet true, stated plainly:** `CRYPTO_MODE=hybrid` is opt-in config, not the default. This tutorial sets the environment variable itself so it's self-contained.

## Next Tutorial

Continue with **Tutorial 55 – Execution Receipt Verification**, where the hybrid-signed record is independently re-verified, including what happens when one signature is tampered with.
