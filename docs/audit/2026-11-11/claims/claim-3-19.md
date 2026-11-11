# 3.19 Principal-Binding Denial Audit Trail (Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1783-1799.

## Exact claim text

## 3.19 Principal-Binding Denial Audit Trail (Scoped)

Extends the caller-binding checks 2.16/G-24's `isPrincipalAllowed` fix and 3.16's `isCapabilityAllowed` both already enforce: when an authenticated caller submits a transaction whose `authority.principalId` it is not permitted to assert, that denial is now itself recorded as a signed, durable audit event — `caller.principal_denied`, a new `CallerAuditEvent` variant (`packages/api/src/auth/CallerAuditSink.ts`) carrying the asserted `principalId` and the authenticated `callerId`, never the raw key. This closes the same class of gap 3.11 (RFC-0021) closed for policy `REJECT`s and 2.19 already closed for every other caller-authentication outcome: before this capability, a principal-binding denial produced only an HTTP `403` response to the caller and, unlike `caller.capability_denied` (3.16, already audited from the same session that added `isCapabilityAllowed`), left no record on Parmana's own side that the attempt happened at all.

`isPrincipalAllowed` (`packages/api/src/auth/isPrincipalAllowed.ts`) itself remains a pure predicate, unchanged — it does not record anything. Both call sites own the audit: `packages/api/src/routes/execute.ts` and `packages/api/src/routes/transactions.ts` each call `recordCallerAuditEvent(auditSink, { type: "caller.principal_denied", ... })` immediately before returning `403`, the identical sequencing 3.16 already established for `caller.capability_denied` (audit write first, HTTP response second, never the reverse). Skipped only when caller-auth itself is disabled (no `req.callerId`), matching every other caller-scoping check's own no-caller-identity posture. In production, this audit write inherits 2.19's existing fail-closed guarantee: `recordCallerAuditEvent` (`packages/api/src/auth/recordCallerAuditEvent.ts`) means a `CallerAuditSink.record()` failure for this event fails the request (`503 AUDIT_UNAVAILABLE`) exactly as it would for any other caller-auth event, rather than silently letting the denial go unrecorded.

Evidence

- `packages/api/src/auth/CallerAuditSink.ts` (`caller.principal_denied` variant, `principalId` field — "the `authority.principalId` a caller attempted to assert but was not permitted to")
- `packages/api/src/routes/execute.ts`, `transactions.ts` (both call sites: `recordCallerAuditEvent` before the `403` response, immediately after `isPrincipalAllowed` returns `false`)
- `packages/api/src/auth/PostgresCallerAuditSink.ts` (persists the new `principal` column)
- `supabase/migrations/20260816120000_add_principal_to_caller_audit_events.sql` (additive `principal` column; synced into `scripts/apply-all-migrations.sql`)
- `packages/api/tests/integration/caller-principal-scoping.integration.test.ts` (new, 6 tests): a scoped-in principal is allowed and no `caller.principal_denied` event is recorded; an out-of-scope principal is blocked with `403` before `application.execute()` is reached and a `caller.principal_denied` event is recorded carrying the asserted `principalId`/`callerId` and never the raw key; both `POST /execute` and `POST /transactions` covered identically
- `packages/api/tests/unit/postgres-caller-audit-sink.test.ts`, `packages/api/tests/integration/postgres-caller-audit-sink.integration.test.ts` (extended for the new column/event shape)

---


## Cited evidence paths

- `packages/api/src/auth/CallerAuditSink.ts`: EXISTS
- `packages/api/src/auth/PostgresCallerAuditSink.ts`: EXISTS
- `packages/api/src/auth/isPrincipalAllowed.ts`: EXISTS
- `packages/api/src/auth/recordCallerAuditEvent.ts`: EXISTS
- `packages/api/src/routes/execute.ts`: EXISTS
- `packages/api/src/routes/transactions.ts`: EXISTS
- `packages/api/tests/integration/caller-principal-scoping.integration.test.ts`: EXISTS
- `packages/api/tests/integration/postgres-caller-audit-sink.integration.test.ts`: EXISTS
- `packages/api/tests/unit/postgres-caller-audit-sink.test.ts`: EXISTS
- `scripts/apply-all-migrations.sql`: EXISTS
- `supabase/migrations/20260816120000_add_principal_to_caller_audit_events.sql`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/caller-principal-scoping.integration.test.ts` | passed | 6 | 6 | 0 |
| `packages/api/tests/integration/postgres-caller-audit-sink.integration.test.ts` | passed | 5 | 0 | 5 |
| `packages/api/tests/unit/postgres-caller-audit-sink.test.ts` | passed | 13 | 13 | 0 |
