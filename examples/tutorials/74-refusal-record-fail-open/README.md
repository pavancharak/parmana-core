# Tutorial 74 — Refusal Record Fail-Open

## Objective

Prove that a Refusal Record write failure — a storage outage, a signing error, anything — never blocks, delays, or changes the actual policy rejection a caller receives. The durable record is evidence, not a gate.

## What You'll Learn

- Two runtimes built with `RuntimeBuilder` — one whose `RefusalRecordRepository.create()` always throws, one with no repository configured at all — reject the identical transaction with byte-for-byte identical `RuntimeError` (same message, status 403, code `POLICY_DENIED`)
- The write is genuinely attempted (`createCallCount === 1`), not silently skipped — this proves fail-_open_, not merely fail-_absent_
- The failure doesn't retry or hang: the reject returns in milliseconds either way

## Running the Tutorial

```bash
npx tsx examples/tutorials/74-refusal-record-fail-open/run.ts
```

## Why This Matters

If a Refusal Record write failure could delay or change a rejection, durable evidence-gathering would become an availability risk on the enforcement path itself — exactly the coupling a security-relevant audit trail must never introduce. This tutorial constructs the runtime directly (mirroring `packages/runtime/tests/unit/refusal-record-fail-open.test.ts`) to prove the write is best-effort, evidentiary, and structurally incapable of blocking the decision it's recording.

## Next Tutorial

Continue with **Tutorial 75 – Signed Audit Events**.
