# 3.21 Bulk/Compliance Export of Execution Trust Records (Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1825-1841.

## Exact claim text

## 3.21 Bulk/Compliance Export of Execution Trust Records (Scoped)

Closes `docs/internal/VERIFICATION-GAPS.md` G-46: before this capability, no dedicated periodic full-export existed for external audit/compliance review. `GET /trust-records/:id` returns one signed record at a time by ID; `GET /transactions` lists raw `BusinessTransaction`s (no execution/verification/receipt/authorization history); neither is a reviewer-facing export path.

New `GET /trust-records` returns the complete signed Execution Trust Record (transaction, executions, verifications, receipts, and the signed execution authorization) for every transaction on the requested page, not just the raw transaction `GET /transactions` returns. Scoping and pagination deliberately mirror `GET /transactions`'s own established shape exactly: `page`/`pageSize` query params over the same underlying `BusinessTransactionService.list()`, the same post-fetch `submittedBy` ownership filter (an authenticated caller sees only their own transactions), and the same bare-array, no-pagination-envelope response shape. Adds `since`/`until` (ISO 8601) to filter by `transaction.createdAt`, for a bounded date-range export rather than requiring a caller to page through their entire history.

**Scope, precisely:** this is a request/response export over HTTP, not a scheduled/automated export job, a CSV or regulator-specific report format, or an admin-only bulk-dump distinct from the ownership scoping every other route in this codebase already applies. A caller sees exactly the Trust Records they would already be entitled to fetch one at a time via `GET /trust-records/:id`. This capability makes fetching many of them at once practical; it does not widen who can see what.

Evidence

- `packages/api/src/routes/trust-records.ts` (`GET /trust-records`)
- `packages/runtime/src/ExecutionTrustApplication.ts` (`listTrustRecords()`): paginates the existing `BusinessTransactionService.list()` and resolves each page entry via the existing `ExecutionTrustRecordRepository.findByTransactionId()`, deliberately not a new repository-level `list()` method, since every transaction has exactly one Trust Record and this avoids requiring every repository implementation (in-memory, Supabase, and any future one) to grow new query surface
- `openapi/openapi.yaml` (`operationId: listTrustRecords`), `schemas/responses/trust-records-list-response.schema.json`
- `packages/api/tests/unit/trust-record-api.test.ts`: 3 new cases (empty before any execution; the full record matches the `/execute` response's own `trustRecordId` after one; `since`/`until` date-range filtering)

---


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `openapi/openapi.yaml`: EXISTS
- `packages/api/src/routes/trust-records.ts`: EXISTS
- `packages/api/tests/unit/trust-record-api.test.ts`: EXISTS
- `packages/runtime/src/ExecutionTrustApplication.ts`: EXISTS
- `schemas/responses/trust-records-list-response.schema.json`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/unit/trust-record-api.test.ts` | passed | 6 | 6 | 0 |
