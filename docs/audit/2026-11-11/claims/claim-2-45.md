# 2.45 Approver Keys Are Added and Revoked Through Maker Checker, With No Deploy (Scoped, 2026-09-29)

Source: CLAIMS.md (commit d1d63c6), lines 545-552.

## Exact claim text

## 2.45 Approver Keys Are Added and Revoked Through Maker Checker, With No Deploy (Scoped, 2026-09-29)

**Claim:** a key trusted to sign approvals can be added or revoked without a code change or deploy, and only when one human credential proposes it and a different human credential approves it with a step up authorization.

**Backed by:** `packages/api/src/routes/approval-issuers.ts` (human callers only, maker is not checker, step up on approve and reject, shared with policy changes in `auth/governanceGuards.ts`); migration `20260929120000_add_approval_issuers.sql` (check constraints: maker is not checker, an add carries a key, a key is revoked only with a change behind it; one open change per key); `SupabaseApprovalIssuerRepository.approveChange` (locks the change, applies it and resolves it in one transaction); `GovernedApprovalIssuerRegistry` (code list first, then the table on every approval, fails closed on a read error). Tests: `approval-issuers-governance.integration.test.ts` (through the HTTP boundary, including a refund authorized with a newly added key and refused after its revocation), `governed-approval-issuer-registry.test.ts`, and `supabase-approval-issuer-repository.integration.test.ts` against real Postgres in the Docker image workflow (including two concurrent approvals of one change).

**Scope:** distinct credentials, not proven distinct people. Keys listed in code still change only by deploy. An operator with database access can bypass the API. Not live until the migration is applied in production.


## Cited evidence paths

- `packages/api/src/routes/approval-issuers.ts`: EXISTS
- `supabase-approval-issuer-repository.integration.test.ts`: MISSING

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `supabase-approval-issuer-repository.integration.test.ts` | not-run-or-missing | 0 | 0 | 0 |
