# Tutorial 77 — Caller Ownership Scoping

## Objective

Exercise `isOwnedByCaller()` directly: the check that stops one authenticated caller from reading another caller's transaction, trust record, or receipt history.

## What You'll Learn

- Ownership is checked against `metadata.submittedBy` — server-set from the authenticated caller at submission time, never trusted from client input
- A different caller looking up someone else's transaction is denied
- A **missing** transaction id returns `true`, not `false` — deliberately: a nonexistent id is not an ownership question, so the route's own 404 handling runs unchanged, and a non-owner probing random ids can't distinguish "not yours" from "doesn't exist"

## Running the Tutorial

```bash
npx tsx examples/tutorials/77-caller-ownership-scoping/run.ts
```

## Why This Matters

Without this check, every transaction-scoped route keys purely off `businessTransactionId` with no ownership check at all — a textbook IDOR (insecure direct object reference): any authenticated caller could enumerate ids and read any other caller's complete transaction history. This tutorial exercises the real function against a real, executed transaction, covering the owner, a different caller, and the missing-id edge case that keeps the 404 response from leaking existence information.

## Next Tutorial

Continue with **Tutorial 78 – Duplicate Transaction Race**.
