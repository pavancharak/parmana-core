# Tutorial 93 — Trust Record Ordering

## Objective

Prove that a Trust Record's `executions`/`overrides`/`verifications`/`receipts` collections preserve insertion order through a full round trip — and that the reloaded record's hash and signature both still validate.

## What You'll Learn

- A signed Trust Record's hash is computed over its _full_ contents, including item order within each collection — a repository that silently reorders items on reload (e.g. a query with no explicit `ORDER BY`) recomputes to a different hash than what was actually signed
- This is the reference-behavior counterpart to a real bug: the Supabase-backed repository needed an explicit ordering fix for exactly this reason, while `MemoryExecutionTrustRecordRepository`'s plain array-append semantics never had the bug in the first place
- Distinct from Tutorial 78's duplicate-write race (G-1, about preventing double-writes) — this is about _sequence integrity_ within a single record's own collections

## Running the Tutorial

```bash
npx tsx examples/tutorials/93-trust-record-ordering/run.ts
```

## Why This Matters

A Trust Record whose collections silently reorder on reload would be indistinguishable from a tampered one: `VerificationCrypto.hash()` recomputes differently, and `verify()` fails — even though nothing was actually altered, only reloaded in a different order. This tutorial mirrors `packages/storage/tests/unit/execution-trust-record-ordering.test.ts`, which runs unconditionally on every test run (not only when live Supabase credentials happen to be configured) to guarantee this specific property is exercised every time.

## Next Tutorial

Continue with **Tutorial 94 – SDK HTTP Transport**.
