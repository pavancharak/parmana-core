# Tutorial 78 — Duplicate Transaction Race

## Objective

Prove that two concurrent `create()` calls for the identical `businessTransactionId` never both succeed — exactly one wins, the other gets a typed `DuplicateBusinessTransactionError`, and the stored transaction is never silently overwritten.

## What You'll Learn

- `MemoryBusinessTransactionRepository.create()`'s check-then-write is a single synchronous operation on its underlying `Map` — no `await` between the existence check and the write, so no other `create()` call can interleave between them
- A sequential duplicate and a genuinely concurrent one (`Promise.allSettled`) produce the same guarantee: one fulfilled, one rejected with `DuplicateBusinessTransactionError`
- The stored record after a race is byte-for-byte the winning call's own return value — never a merge of both, never silently replaced by whichever write happened to land second

## Running the Tutorial

```bash
npx tsx examples/tutorials/78-duplicate-transaction-race/run.ts
```

## Why This Matters

This is G-1: without an atomic check-and-write, two concurrent submissions of the same transaction id — a retried client request racing its own original, for instance — could both succeed, with the second silently clobbering the first. `Promise.allSettled` (not `Promise.all`) is used deliberately so both outcomes can be inspected without one rejection short-circuiting the other, mirroring `packages/storage/tests/unit/memory-business-transaction-repository.test.ts`'s own concurrency proof.

## Next Tutorial

Continue with **Tutorial 79 – Storage Backend Selection**.
