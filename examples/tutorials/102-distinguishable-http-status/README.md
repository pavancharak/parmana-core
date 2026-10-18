# Tutorial 102 — Distinguishable HTTP Status for Policy Denial and Replay

## Objective

Show that a policy `REJECTED` decision (`403`/`POLICY_DENIED`), a replayed authorization (`409`/`NONCE_ALREADY_CONSUMED`), and a genuine unexpected failure (plain, uncoded `500`) are all distinguishable from each other — not three flavors of the same opaque error (`docs/CLAIMS.md` §2.21).

## What You'll Learn

- A policy rejection surfaces as `403` with `code: "POLICY_DENIED"`, produced by `ExecutionGate.enforce()` — shown here through a real HTTP server, `POST /execute`
- An authorization whose nonce has already been consumed — every other `ExecutionGateway` check (version, signature, expiry, TTL, `businessTransactionHash`) having passed, only nonce consumption failing — surfaces as `409` with `code: "NONCE_ALREADY_CONSUMED"`, distinct from every other failure shape
- **Scope, precisely:** the `409` path is reachable today only by a receiving system calling `ExecutionGateway.execute()` directly with an already-consumed authorization, not through Parmana's own `POST /execute` route (a resubmitted `businessTransactionId` is rejected earlier, by `DuplicateBusinessTransactionError`, before the Gateway is ever reached) — which is exactly why this tutorial exercises the Gateway directly for this scenario, playing the same "receiving system" role a downstream connector plays
- Every other Gateway verification failure — a genuinely tampered request, forged signature, expired envelope — is unaffected and remains a plain, uncoded `Error`, still `500`; none of `2.20`/`2.21`'s coded rejections were "the new normal" for every failure, only these two specific, well-understood cases

## Running the Tutorial

```bash
npx tsx examples/tutorials/102-distinguishable-http-status/run.ts
```

## Why This Matters

A caller (or its SDK) needs to tell "this was legitimately denied by policy," "this exact request already ran, don't retry it," and "something is actually broken" apart, because the correct client behavior differs for each: retrying a `409` is meaningless (it already succeeded once), retrying a `403` is meaningless (the answer won't change without a different request), and a `500` is the one case worth investigating or retrying. The TypeScript SDK's own error mapping (`typescript/src/transport/mapHttpErrorResponse.ts`) depends on exactly this distinction to raise the right typed error class per case.

## Next Tutorial

Continue with **Tutorial 103 — Policy Governance (Maker-Checker)**.
