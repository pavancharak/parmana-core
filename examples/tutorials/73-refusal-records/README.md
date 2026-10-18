# Tutorial 73 — Refusal Records

## Objective

Show that a policy REJECT isn't just an HTTP 403 that vanishes once the response is sent — RFC-0021 produces a durable, signed Refusal Record, retrievable afterward and independently verifiable with nothing but the artifact and the public key.

## What You'll Learn

- `application.getRefusalRecord(businessTransactionId)` retrieves the record produced automatically by a policy rejection — no separate call needed to create it
- `application.verifyRefusalRecord(record)` is the same kind of independent, artifact-plus-public-key verification Tutorial 55 demonstrates for Receipts and Tutorial 68 for Settlement Confirmations
- Tampering with the recorded rejection reason — rewriting the historical record of _why_ something was refused — is caught the same way tampering with a Receipt is

## Running the Tutorial

```bash
npx tsx examples/tutorials/73-refusal-records/run.ts
```

## Why This Matters

A rejection with no durable evidence trail is unaccountable: there's no way to later prove what was refused, or why, without trusting whoever's retelling it. This tutorial exercises the real pipeline — a genuine policy REJECT automatically produces a signed Refusal Record, that record verifies true when genuine and false the moment it's tampered with.

## Next Tutorial

Continue with **Tutorial 74 – Refusal Record Fail-Open**.
