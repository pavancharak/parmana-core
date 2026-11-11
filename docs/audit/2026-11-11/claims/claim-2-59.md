# 2.59 A Policy Change Is Approved in Production Only by a Listed Checker, and the Approved Version Is Stored Durably (Scoped, 2026-10-21)

Source: CLAIMS.md (commit d1d63c6), lines 873-890.

## Exact claim text

## 2.59 A Policy Change Is Approved in Production Only by a Listed Checker, and the Approved Version Is Stored Durably (Scoped, 2026-10-21)

**Claim.** A policy change takes effect only when a human caller who is listed for that policy approves it, with a single-use step-up signature, and the approved version is saved to the policy store. A caller who is not listed is refused with `403 CHECKER_NOT_IN_SCOPE`. An unset scope lists no one, so nothing is approved.

**Verified by tests.** The approve route checks the caller against `POLICY_CHANGE_CHECKERS` (`packages/api/src/governance/policyChangeCheckers.ts`, tested in `packages/api/tests/unit/policyChangeCheckers.test.ts`). `tests/architecture/vercel-entry-policy-checkers.test.ts` checks that both `server.ts` and `api/index.ts` pass the scope. The test was confirmed to fail on the unfixed `api/index.ts`.

**Checked in production, once.** On 2026-10-21 a maker key for `maker-wiring-check` proposed version `1.0.0` of the unused policy `checker-wiring-check`, and the checker `pavancharak` approved it with a signed step-up. The response showed `status: APPROVED`, `resolvedBy: pavancharak`, `resolvedAt: 2026-10-21T04:29:57.273Z`. The approved version is stored in the `policies` table.

**Not claimed.**

1. That a caller who is not listed is refused on production. That is tested in unit tests only, and was not tried on production.
2. That approved versions survive a restart of production. Storage is the database path, and no restart was tested.
3. That approval issuers, which sign approvals for agent actions, are scoped per policy. They are not (G-50, still open).
4. That a second person is required beyond the rule that the maker cannot approve their own change. There is no quorum.
5. That the checker is a separate person. Both keys were created by one operator on one machine. This check shows the wiring works, not that duties are separated (REMAINING-WORK, section A).

Gaps: G-50 (partly fixed) and G-123 (fixed).


## Cited evidence paths

- `api/index.ts`: EXISTS
- `packages/api/src/governance/policyChangeCheckers.ts`: EXISTS
- `packages/api/tests/unit/policyChangeCheckers.test.ts`: EXISTS
- `policies`: EXISTS
- `tests/architecture/vercel-entry-policy-checkers.test.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/unit/policyChangeCheckers.test.ts` | passed | 8 | 8 | 0 |
| `tests/architecture/vercel-entry-policy-checkers.test.ts` | passed | 2 | 2 | 0 |
