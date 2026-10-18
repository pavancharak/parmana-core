# Tutorial 101 — Fail-Closed Caller-Authentication Audit Writes

## Objective

Show that a caller-authentication event — accepted or rejected — that fails to be recorded fails the whole request, rather than proceeding unaudited (`docs/CLAIMS.md` §2.19).

## What You'll Learn

- `middleware/caller-auth.ts` wraps every `CallerAuditSink.record()` call through `recordCallerAuditEvent` — on success the request proceeds exactly as before; on failure the request is rejected with `AuditUnavailableError` (`503`, code `AUDIT_UNAVAILABLE`) instead of proceeding unaudited or crashing as an unhandled rejection
- This applies to **both** outcomes of authentication, not just denials: a missing credential whose `caller.rejected` audit write fails gets `503`, not the `401` it would otherwise get — and a perfectly valid, well-authenticated credential whose `caller.authenticated` audit write fails **also** gets `503`, not the `200` it would otherwise get
- There is no retry, buffering, or queueing — a failure fails closed immediately, once, per request; the audit sink here is called exactly once per request, never twice
- This is a deliberate design decision, not an incidental side effect: an action that executes without an audit record contradicts Parmana's core claim of independently verifiable execution, and the availability cost of failing closed here is accepted

## Running the Tutorial

```bash
npx tsx examples/tutorials/101-fail-closed-caller-audit-writes/run.ts
```

## Why This Matters

Most systems treat audit logging as best-effort: if the log write fails, the request still succeeds and the failure is just an ops alert somewhere. Parmana inverts that for caller-authentication events specifically — since every claim this system makes rests on being independently verifiable, an authenticated (or rejected) request with no corresponding audit record would be a silent gap in exactly the evidence the rest of the system is built to produce. This tutorial simulates the underlying storage outage `SupabaseCallerAuditSink` (or any other `CallerAuditSink` implementation) would surface in production, and shows the guard reacts identically regardless of which caller-auth outcome triggered it.

## Next Tutorial

Continue with **Tutorial 102 — Distinguishable HTTP Status for Policy Denial and Replay**.
