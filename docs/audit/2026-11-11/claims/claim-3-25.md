# 3.25 Vercel Entry Applies the Startup Refusals; POST /transactions Binds metadata.tenantId (Scoped, 2026-10-15)

Source: CLAIMS.md (commit d1d63c6), lines 2047-2066.

## Exact claim text

## 3.25 Vercel Entry Applies the Startup Refusals; POST /transactions Binds metadata.tenantId (Scoped, 2026-10-15)

**Claim.** Two checks that already held on the other entry points now hold on every entry point:

1. The Vercel serverless entry (`api/index.ts`) refuses to serve when the Policy Governance integrity check finds a mismatch or cannot run, as `packages/api/src/server.ts` does. Previously it ran the periodic check fail-open.
2. `POST /transactions` refuses a `metadata.tenantId` that the caller's key does not list, with `TENANT_NOT_ALLOWED`, as `POST /execute` already did. The tenant id selects the signing key (`tenant.<id>`), so an unchecked id let a caller have an authorization signed under another tenant's key.

**Evidence.**

- api/index.ts: `buildApp()` awaits `assertPolicyGovernanceIntegrityAtStartup()` before building the app.
- packages/api/src/routes/transactions.ts: tenant check placed with the principal and capability checks, before `application.execute()`.
- packages/api/tests/integration/caller-capability-scoping.integration.test.ts: "POST /transactions" refuses a tenantId the key does not list.
- `packages/api` test suite: 698 passed, 36 skipped.

**Limits.**

- In a serverless function a process exit is not available. A mismatch makes every request fail with a 500 rather than refusing the process. The failed build is retried on the next request, so each request re-runs the check until the mismatch is fixed.
- The entry imported `runPolicyGovernanceIntegrityCheckAtStartup` from `packages/api/dist`, a module with no source in `packages/api/src`. The import now points at the module the source builds.
- Status: fixed on branch `fix/policy-scan-and-governance-url`. See G-98 and G-99 in `docs/internal/VERIFICATION-GAPS.md`.


## Cited evidence paths

- `api/index.ts`: EXISTS
- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `packages/api`: EXISTS
- `packages/api/dist`: EXISTS
- `packages/api/src`: EXISTS
- `packages/api/src/server.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
