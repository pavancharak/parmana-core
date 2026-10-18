# Tutorial 53 — Hybrid-Signed Execution Trust Record

## Historical note

This tutorial was originally "Execution Permit™": it built a hand-rolled `ExecutionPermit`/`ExecutionPermitBuilder` object that never had a live caller anywhere in `packages/api` and no test coverage. It was confirmed dead and deleted by the Hybrid Signature Support milestone (Phase A). The directory name and tutorial number are unchanged; the content now demonstrates that same milestone's real, tested replacement.

## Objective

Build a real **Execution Trust Record** — the actual artifact `POST /execute` produces — with `CRYPTO_MODE=hybrid` active, so it carries both the existing single Ed25519 `signature` (unchanged, byte-for-byte identical to a non-hybrid record) and an additive `signatures[]` array containing independent Ed25519 and ML-DSA-65 signatures.

## What You'll Learn

- How `CRYPTO_MODE=hybrid` is enabled (a single environment variable, read once, before the runtime is constructed)
- That the legacy `signature` field is computed exactly as it always was — hybrid mode is purely additive
- The additive `schemaVersion`/`signatures[]` shape, and which two algorithms appear
- That this runs through the real production pipeline (`RuntimeFactory.create()` → `application.execute()`), the same code path `POST /execute` uses — not a hand-rolled stand-in for it

## Running the Tutorial

```bash
npx tsx examples/tutorials/53-execution-permit/run.ts
```

## Why This Matters

A signature alone proves data wasn't modified — for as long as the algorithm that produced it stays unbroken. Hybrid signing is a defense against exactly the scenario where it doesn't: if Ed25519 is ever broken by a future quantum computer, the ML-DSA-65 signature in `signatures[]` still holds; if a weakness is ever found in ML-DSA-65 instead, Ed25519 still holds. This tutorial shows the real record shape that guarantee produces, not a diagram of it.

**Not yet true, stated plainly:** `CRYPTO_MODE=hybrid` is opt-in config, not the default — every deployed Parmana environment today signs Ed25519 alone. This tutorial sets the environment variable itself so it's self-contained; nothing here implies hybrid signing is running anywhere in production.

## Next Tutorial

Continue with **Tutorial 54 – Execution Receipt**, where the same hybrid-signed Trust Record is used to generate a Receipt.
