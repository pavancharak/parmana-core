# Tutorial 56 — Complete Execution Flow

## Historical note

This tutorial previously chained the dead `ExecutionPermit` → `ExecutionTrustAttestation` → `ExecutionReceipt` → `ExecutionReceiptVerifier` pipeline (Hybrid Signature Support milestone, Phase A: confirmed zero live callers, zero test coverage, deleted) into one script. It now chains Tutorials 53–55's real content — build, receipt, verify (genuine and tampered) — through the same production pipeline, with `CRYPTO_MODE=hybrid` active throughout.

## Objective

Run the complete hybrid-signing flow against a real business transaction: execute it through `application.execute()` (producing a hybrid-signed Execution Trust Record and Receipt), then verify it twice through `application.verify()` — once genuine, once with the second signature tampered — and arrive at a final trust decision based on both real results.

## What You'll Learn

- How the pieces from Tutorials 53–55 compose into one flow, using nothing but the real `RuntimeFactory`/`ExecutionTrustApplication` classes `POST /execute` and `POST /verify` are themselves built on
- That hybrid signing is applied consistently across both artifacts (Trust Record and Receipt) produced by a single execution
- That the tamper-rejection property from Tutorial 55 holds in the context of a full flow, not just in isolation

## Running the Tutorial

```bash
npx tsx examples/tutorials/56-complete-execution-flow/run.ts
```

## Why This Matters

Each of Tutorials 52–55 demonstrates one piece of hybrid signing in isolation. This tutorial exists to prove those pieces actually compose: the same Trust Record produced by execution is the one verification checks, the same Receipt is hybrid-signed alongside it, and tampering with either is caught, not just described.

**Not yet true, stated plainly:** `CRYPTO_MODE=hybrid` is opt-in config, not the default — every deployed Parmana environment today, including `parmana-api-live.fly.dev`, signs Ed25519 alone. This tutorial sets the environment variable itself so it's self-contained.

## Next Tutorial

Continue with **Tutorial 57 – Credential Isolation**.
