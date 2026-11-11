# 2.19 Fail-Closed Caller-Authentication Audit Writes

Source: CLAIMS.md (commit d1d63c6), lines 452-471.

## Exact claim text

## 2.19 Fail-Closed Caller-Authentication Audit Writes

A caller-authentication event (accepted or rejected) that fails to be recorded fails the request. `middleware/caller-auth.ts` wraps every `CallerAuditSink.record()` call: on success the request proceeds exactly as before; on failure the request is rejected with `AuditUnavailableError` (503, code `AUDIT_UNAVAILABLE`) and a structured log entry naming the failure, rather than proceeding unaudited or crashing as an unhandled rejection. This is a deliberate design decision (an action that executes without an audit record contradicts independently verifiable execution), not an incidental side effect; the availability cost is accepted. No retry, buffering, or queueing exists: a failure fails closed immediately, once, every time.

Evidence

- packages/api/src/middleware/caller-auth.ts (calls `recordCallerAuditEvent`)

- packages/api/src/auth/recordCallerAuditEvent.ts (`recordCallerAuditEvent` — the actual fail-closed implementation this claim describes; corrected 2026-08-24, previously miscited under a `recordOrFailClosed` name that does not exist anywhere in this codebase)

- packages/api/src/auth/AuditUnavailableError.ts

- packages/api/tests/unit/middleware/caller-auth.test.ts: both success paths unchanged; both failure paths rejected with `AuditUnavailableError` (503/AUDIT_UNAVAILABLE), not a 401 and not a silent pass-through; the structured log entry's exact shape; the sink is called exactly once (no retry)

- packages/api/tests/unit/postgres-caller-audit-sink.test.ts: `PostgresCallerAuditSink` propagates storage errors rather than swallowing them, which is what makes this guard reachable in production wiring

- examples/tutorials/101-fail-closed-caller-audit-writes/run.ts (runnable narrative, real HTTP server: a rejected credential and an accepted one each independently fail closed at 503 when the audit write itself fails)

---

## Cited evidence paths

No backticked repo path in this claim.

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
