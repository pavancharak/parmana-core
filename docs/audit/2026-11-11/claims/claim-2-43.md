# 2.43 A Live Action's Policy Version Is Decided by Policy Governance, Not by a Deploy (Scoped, 2026-09-27)

Source: CLAIMS.md (commit d1d63c6), lines 1457-1486.

## Exact claim text

## 2.43 A Live Action's Policy Version Is Decided by Policy Governance, Not by a Deploy (Scoped, 2026-09-27)

For a capability in `CANONICAL_CAPABILITY_POLICY_BINDINGS`, the policy name is fixed in code and the version is the one most recently approved for that name through policy governance. A new version takes effect when a second caller, other than the proposer, approves it; approving an older version again rolls back to it. No code change and no deploy. The server checks that the two callers differ, not that they are two people: in production on 2026-09-28 both credentials are held by one person.

- A request that names the bound policy at any other version, including an older version that was approved in the past, is refused before any rule runs, with a message naming the version in effect.
- No approved version, or a failed lookup of it, refuses the request.
- Where policy governance is not enforced (`NODE_ENV` test and development, unless `POLICY_EXECUTION_VERIFICATION_ENFORCED` is `true`), the version written in the table applies. The two are switched on by the same rule.

Scope, stated plainly:

- **Merged and deployed** 2026-09-27 (PR #47 into #46, then #46 into `main`, merge `4eebd5f`). Production's `customer-refund` versions in effect were not checked after the deploy.
- Binding an action to a different policy name, adding a capability, and adding an approver still need a deploy.
- Agents must send the version in effect. After an approval, requests naming the previous version are refused until agents update. **Added 2026-09-28:** `GET /policies/in-effect?capability=<action>` returns the policy to declare right now, from the same `CapabilityPolicyBinder.policyInEffect` the check uses, so an agent that asks before each request needs no update when a version is approved. It answers a caller whose key may invoke the capability, or a human caller (`packages/api/src/routes/policy-in-effect.ts`).
- The version is read from the latest approval record without verifying it; the same request then verifies that record's signature and content hash (2.35, 2.36), so a record changed outside the API refuses the request.

Verification

- `packages/api/tests/unit/GovernedPolicyVersion.test.ts` (5, through `RuntimeBuilder` with governance enforced): no approval refuses; an approved 1.0.0 runs; approving 1.1.0 makes it current and refuses 1.0.0; approving 1.0.0 again rolls back; a failed lookup refuses. Without the version source, 2 of the 5 fail.
- `packages/capability-registry/tests/unit/CapabilityPolicyBinder.test.ts` (15), `packages/api/tests/unit/bootstrap/create-current-policy-version-source.test.ts` (10), `packages/storage/tests/unit/policy-change-approval-record-most-recent-for-name.test.ts` (2).

Evidence

- `packages/capability-registry/src/CapabilityPolicyBinding.ts` (`CurrentPolicyVersionSource`, async `CapabilityPolicyBinder`)
- `packages/api/src/governance/GovernedPolicyVersionSource.ts`, `packages/api/src/bootstrap/createCurrentPolicyVersionSource.ts`, `packages/api/src/application.ts`
- `packages/runtime/src/RuntimeBuilder.ts` (`withCurrentPolicyVersions`), `RuntimeFactory.ts`, `RuntimeEngine.ts`
- `packages/shared/src/repositories/policy-change-approval-record-repository.ts` (`findMostRecentForName`), `packages/storage/src/memory/` and `supabase/` implementations
- `docs/internal/VERIFICATION-GAPS.md` G-66

---


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `packages/api/src/application.ts`: EXISTS
- `packages/api/src/bootstrap/createCurrentPolicyVersionSource.ts`: EXISTS
- `packages/api/src/governance/GovernedPolicyVersionSource.ts`: EXISTS
- `packages/api/src/routes/policy-in-effect.ts`: EXISTS
- `packages/api/tests/unit/GovernedPolicyVersion.test.ts`: EXISTS
- `packages/api/tests/unit/bootstrap/create-current-policy-version-source.test.ts`: EXISTS
- `packages/capability-registry/src/CapabilityPolicyBinding.ts`: EXISTS
- `packages/capability-registry/tests/unit/CapabilityPolicyBinder.test.ts`: EXISTS
- `packages/runtime/src/RuntimeBuilder.ts`: EXISTS
- `packages/shared/src/repositories/policy-change-approval-record-repository.ts`: EXISTS
- `packages/storage/src/memory/`: EXISTS
- `packages/storage/tests/unit/policy-change-approval-record-most-recent-for-name.test.ts`: EXISTS
- `supabase/`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/unit/GovernedPolicyVersion.test.ts` | passed | 4 | 4 | 0 |
| `packages/api/tests/unit/bootstrap/create-current-policy-version-source.test.ts` | passed | 10 | 10 | 0 |
| `packages/capability-registry/tests/unit/CapabilityPolicyBinder.test.ts` | passed | 21 | 21 | 0 |
| `packages/storage/tests/unit/policy-change-approval-record-most-recent-for-name.test.ts` | passed | 2 | 2 | 0 |
