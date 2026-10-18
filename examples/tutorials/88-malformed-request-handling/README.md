# Tutorial 88 — Malformed Request Handling

## Objective

Prove that malformed JSON and oversized request bodies return specific, diagnosable errors (400 and 413) rather than the generic 500 a real server crash would also produce.

## What You'll Learn

- Malformed JSON (a truncated body) returns `400` with `"Malformed JSON body."` — a caller sending a typo'd request can tell it was their mistake, not this server's
- A body over `express.json()`'s default 100KB limit returns `413` with `"Payload too large."` — the same clarity the webhook route already had for its own oversized-body case, now applied to the general JSON body parser too
- A well-formed, reasonably-sized request is completely unaffected — this is purely a response-clarity fix for the two failure shapes, not a new restriction on legitimate traffic

## Running the Tutorial

```bash
npx tsx examples/tutorials/88-malformed-request-handling/run.ts
```

## Why This Matters

Found by adversarial testing: both failure shapes previously fell through `express.json()`'s error into the generic 500 branch of the error handler — indistinguishable from an actual server crash, even though every case already failed closed (nothing ever executed). A caller — or an on-call engineer paged for a 500 — can't tell "your request was malformed" from "the server is broken" without this distinction.

## Next Tutorial

Continue with **Tutorial 89 – Readiness Probe**.
