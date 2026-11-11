# 3.20 Structural Validation Rejection Audit Trail (G-29, Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1800-1824.

## Exact claim text

## 3.20 Structural Validation Rejection Audit Trail (G-29, Scoped)

Closes `docs/internal/VERIFICATION-GAPS.md` G-29: before this capability, four admission-time rejection paths — a malformed or oversized request body, a malformed `businessTransactionId`, a structurally invalid Business Transaction (`BusinessTransactionValidationError`), and a duplicate `businessTransactionId` (`DuplicateBusinessTransactionError`) — returned the correct HTTP status (`400`/`409`/`413`) but produced no durable record of any kind, the one remaining rejection category in this codebase neither `RefusalRecord` (3.11, policy `REJECT`s) nor `CallerAuditSink` (2.16/2.19/3.16/3.19, caller-identity denials) covered. All four now write a signed `caller.structural_rejected` `CallerAuditEvent` (`packages/api/src/auth/CallerAuditSink.ts`), carrying `reason` and, when the request got far enough to have one, `businessTransactionId`.

**Two different audit disciplines, deliberately, matching where each rejection actually happens in the request pipeline:**

1. **The UUID-format check and the two errors thrown inside `application.execute()`** (`BusinessTransactionValidationError`, `DuplicateBusinessTransactionError`) all run inside `execute.ts`/`transactions.ts`'s route handler, mounted _after_ caller-auth middleware — the same layer 3.16/3.19's checks already run at. These reuse `recordCallerAuditEvent`'s existing fail-closed discipline (2.19) exactly: audited before the `400`/`409` response, and a write failure itself fails the request (`503 AUDIT_UNAVAILABLE`) rather than letting the rejection go unrecorded.
2. **Malformed/oversized request body** is rejected by `express.json()` itself, _before_ caller-auth middleware — or any route handler — ever runs (`app.ts`'s mounting order: `express.json()` at line 127, caller-auth at line ~172, both ahead of every route). There is no caller identity to protect the accountability of at this point, and `error-handler.ts` is a single-pass terminal middleware, not naturally positioned to fail the response closed the way a route handler can. This one path is therefore deliberately **fail-open**, mirroring RefusalRecord's own reasoning (3.11's first scope caveat) rather than 2.19's: the request is already correctly rejected either way, and failing the response closed on top of a correct `400`/`413` would trade it for an opaque `500` with no corresponding security gain. A write failure here is logged (`structural_rejection_audit_write_failed`), never thrown. `createErrorHandler(auditSink?)` (replacing the former plain `errorHandler` export) is how the audit sink reaches this one file; every other error branch in `error-handler.ts` is unaffected, since each of those is reached only via a route handler that already owns its own audit call.

`callerId` is therefore present on a `caller.structural_rejected` event exactly when caller-auth ran first and identified a caller before the structural check failed — populated for all three route-handler-level checks, absent for the pre-caller-auth malformed-body case.

Evidence

- `packages/api/src/auth/CallerAuditSink.ts` (`caller.structural_rejected` variant, `businessTransactionId` field)
- `packages/api/src/auth/PostgresCallerAuditSink.ts` (persists the new `business_transaction_id` column)
- `packages/api/src/routes/execute.ts`, `transactions.ts` (UUID-format check: fail-closed audit before `400`; `catch` block around `application.execute()`: fail-closed audit for `BusinessTransactionValidationError`/`DuplicateBusinessTransactionError` before `next(error)`)
- `packages/api/src/middleware/error-handler.ts` (`createErrorHandler(auditSink?)`, `auditStructuralRejectionBestEffort` — fail-open, logs and swallows its own failure)
- `packages/api/src/app.ts` (threads `options.callerAuth.auditSink` into `createErrorHandler`, mirroring how `execute.ts`/`transactions.ts` are already threaded)
- `supabase/migrations/20260824090000_add_structural_rejected_to_caller_audit_events.sql` (widened `type` CHECK constraint; additive `business_transaction_id` column; synced into `scripts/apply-all-migrations.sql`)
- `packages/api/tests/integration/structural-validation-audit.integration.test.ts` (new, 9 tests): malformed `businessTransactionId` audited with the declared value and `callerId`, both `POST /execute` and `POST /transactions`; a non-string `businessTransactionId` leaves the field absent, not a garbage value; a mismatched `metadata.businessTransactionId` (`BusinessTransactionValidationError`) audited with its reason; a resubmitted `businessTransactionId` (`DuplicateBusinessTransactionError`) audited on the second call only, not the first, successful one; malformed JSON and an oversized body each audited with no `callerId` and no `businessTransactionId`; malformed JSON with caller-auth disabled still returns a correct `400` with nothing to assert on the audit side (no sink exists to write to); the valid path records no `caller.structural_rejected` event at all
- `packages/api/tests/unit/postgres-caller-audit-sink.test.ts` (extended, 2 new cases: the new column maps correctly with and without a known caller/businessTransactionId)
- Full repo `npx tsc -b`, `npx eslint . --ext .ts`, and `npm test` (`vitest run`) all clean: 1243 passed, 37 pre-existing skips, 0 failed — no regressions

---


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `packages/api/src/app.ts`: EXISTS
- `packages/api/src/auth/CallerAuditSink.ts`: EXISTS
- `packages/api/src/auth/PostgresCallerAuditSink.ts`: EXISTS
- `packages/api/src/middleware/error-handler.ts`: EXISTS
- `packages/api/src/routes/execute.ts`: EXISTS
- `packages/api/tests/integration/structural-validation-audit.integration.test.ts`: EXISTS
- `packages/api/tests/unit/postgres-caller-audit-sink.test.ts`: EXISTS
- `scripts/apply-all-migrations.sql`: EXISTS
- `supabase/migrations/20260824090000_add_structural_rejected_to_caller_audit_events.sql`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/structural-validation-audit.integration.test.ts` | passed | 11 | 11 | 0 |
| `packages/api/tests/unit/postgres-caller-audit-sink.test.ts` | passed | 13 | 13 | 0 |
