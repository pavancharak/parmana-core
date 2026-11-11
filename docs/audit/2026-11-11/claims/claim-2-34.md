# 2.34 Policy Governance Integrity: Signature Verification, Record Chaining, Continuous Checks

Source: CLAIMS.md (commit d1d63c6), lines 1165-1197.

## Exact claim text

## 2.34 Policy Governance Integrity: Signature Verification, Record Chaining, Continuous Checks

**What this closes.** An independent audit of the Policy Governance mechanism (2.26) documented in an artifact published 2026-09-07 found that `PolicyChangeCrypto.verify()` — the signature-verification counterpart to `.sign()`, unit-tested since it was written — was never actually called anywhere in production code. `verifyPolicyGovernanceIntegrityAtStartup()` re-derived and compared a content hash but never re-verified the stored `PolicyChangeApprovalRecord`'s own signature, so a tampered field on an already-persisted record (e.g. a rewritten `approvedBy`) would not have been caught by anything that read it back. The same audit found the integrity check ran only at process startup (a gap of up to a full deploy cycle), and that `packages/policy/src/types/LedgerEntry.ts`/`hashLedger()` were unexported, unimported dead code that could be mistaken for the real audit trail.

**Signature verification wired in.** `verifyPolicyGovernanceIntegrityAtStartup()` (`packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts`) now calls `policyChangeCrypto.verify(mostRecent)` on the most recent approval record for each `(policyName, policyVersion)` pair before trusting its `contentHashAfter`, reporting a new `"signature-invalid"` mismatch reason distinct from `"content-mismatch"`/`"missing"`.

**Approval records are now hash-chained.** `PolicyChangeApprovalRecord` (`packages/shared/src/domain/policy-change-approval-record.ts`) gained an optional `previousRecordHash`, computed by `PolicyChangeApprovalService.approve()` as the hash of the approval record that immediately preceded it for the same `(policyName, policyVersion)` (absent for the first record ever created for that pair), and included inside the record's own signed payload (`PolicyChangeCrypto.canonicalRecord()`) — so tampering with the chain pointer itself invalidates the signature too. `verifyPolicyGovernanceIntegrityAtStartup()` independently re-derives this chain from `PolicyChangeApprovalRecordRepository.list()` and reports a `"chain-broken"` mismatch when a record's `previousRecordHash` does not match the record actually before it, detecting a deleted, reordered, or substituted record in the approval-record store itself — not only a tampered live `policy.json`. Ships with a Postgres migration (`supabase/migrations/20260907130000_add_previous_record_hash_to_policy_change_approval_records.sql`) and the corresponding `SupabasePolicyChangeApprovalRecordRepository` column mapping.

**Continuous, not startup-only.** `schedulePolicyGovernanceIntegrityCheck()` (`packages/api/src/bootstrap/schedulePolicyGovernanceIntegrityCheck.ts`) re-runs the same check every 5 minutes for the life of the process (`POLICY_GOVERNANCE_INTEGRITY_CHECK_INTERVAL_MS` to override, `0` to disable), sharing its construction and fail-open error handling via `runPolicyGovernanceIntegrityCheckOnce()` (`packages/api/src/bootstrap/policyGovernanceIntegrityCheckRunner.ts`). Its interval timer is `.unref()`'d, matching `createGracefulShutdown.ts`'s own discipline for its force-exit timer, so it can never itself keep the process alive past a clean shutdown.

**Minor hardening in the same pass.** `PolicyValidator.validateRegex()` (`packages/policy/src/PolicyValidator.ts`) now rejects `matches` patterns over 200 characters and single-level nested quantifiers (e.g. `(a+)+`) — documented in-source as a heuristic improvement, not a ReDoS-proof guarantee. `findUncoveredFacts()` coverage warnings are now returned as `coverageWarnings` on both the propose response and the `GET /pending-changes` diff listing, so a checker actually sees them at approval time instead of only a load-time `console.warn`. `packages/policy/src/types/LedgerEntry.ts`/`hashLedger()` were deleted (dead code); `@parmana/storage`'s `StorageEngine`/`AppendOnlyLedger` were kept (genuinely tested, exported) but now document in their own doc comment that they are in-memory-only and not part of the live request path.

**Legacy-policy backfill: a script exists, and does not touch a real in-flight approval.** `scripts/backfill-legacy-policy-approvals.ts` creates a synthetic, system-actor `PendingPolicyChange` + signed `PolicyChangeApprovalRecord` (content unchanged) for any `(policyName, policyVersion)` with neither an approval record nor an open proposal — closing the gap that a policy predating Policy Governance is permanently invisible to the integrity check. It is dry-run by default (`--apply` to write) and deliberately not wired into server startup, since mutating the durable audit trail is a reviewed, one-time action, not implicit boot-time behavior. Its first version did not check for an existing open proposal before planning a backfill; fixed the same day (commit `4e1a8e3`) after cross-referencing 2.26's own "Legacy-policy backfill" entry, which records that all ten real production policies already have a genuine, human-proposed `PendingPolicyChange` from 2026-08-19 sitting `PENDING_APPROVAL`. The script now calls `pendingPolicyChanges.findPending()` and excludes any pair with an open proposal from the backfill plan entirely, reporting it separately (`awaitingRealApproval`) rather than fabricating a system approval for content a human maker-checker decision hasn't actually been reached on. **As of this writing the script has not been run with `--apply` against any environment** — the ten real policies 2.26 describes remain exactly as documented there, unaffected by anything in this section.

**Deployment status.** Committed to `main` (commits `437f5ec`, `4e1a8e3`). Full repo `npx tsc -b` and `npx vitest run` both clean: 1524 passed, 38 pre-existing skips, 0 failed, after updating `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts`'s fixtures to carry real signatures (the pre-existing fixtures used a hand-written placeholder signature string, correct for a check that never verified it, and would have failed all nine cases once verification was wired in) and adding two new cases for `"signature-invalid"` and `"chain-broken"`. Not yet checked against any live deployment (`parmana-api.fly.dev` / `parmana-api-live.fly.dev`), same caveat as 2.26.

Evidence

- `packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts` (`"signature-invalid"`, `"chain-broken"` mismatch reasons)
- `packages/api/src/governance/PolicyChangeApprovalService.ts` (`previousRecordHash` computation)
- `packages/shared/src/domain/policy-change-approval-record.ts` (`previousRecordHash` field)
- `packages/crypto/src/PolicyChangeCrypto.ts` (`canonicalRecord()` includes `previousRecordHash`)
- `packages/api/src/bootstrap/policyGovernanceIntegrityCheckRunner.ts`, `schedulePolicyGovernanceIntegrityCheck.ts`, `server.ts`
- `supabase/migrations/20260907130000_add_previous_record_hash_to_policy_change_approval_records.sql`, `packages/storage/src/postgres/PostgresPolicyChangeApprovalRecordRepository.ts`
- `packages/policy/src/PolicyValidator.ts` (`validateRegex()` length cap + nested-quantifier heuristic, `findUncoveredFacts()` surfaced via `coverageWarnings`)
- `packages/api/src/routes/pending-policy-changes.ts` (`coverageWarnings` on propose response and diff listing)
- `scripts/backfill-legacy-policy-approvals.ts` (dry-run by default; excludes any pair with an open `PendingPolicyChange`)
- `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts` (9 cases, including new `"signature-invalid"`/`"chain-broken"` coverage)
- Independent audit artifact (2026-09-07): https://claude.ai/code/artifact/0a454f3f-055c-47c1-a4ff-5401ad582dd0
- Commits `437f5ec` (signature verification, chaining, continuous checks, minor hardening, dead-code removal), `4e1a8e3` (backfill-script fix)

---

## Cited evidence paths

- `packages/api/src/bootstrap/policyGovernanceIntegrityCheckRunner.ts`: EXISTS
- `packages/api/src/bootstrap/schedulePolicyGovernanceIntegrityCheck.ts`: EXISTS
- `packages/api/src/governance/PolicyChangeApprovalService.ts`: EXISTS
- `packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts`: EXISTS
- `packages/api/src/routes/pending-policy-changes.ts`: EXISTS
- `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts`: EXISTS
- `packages/crypto/src/PolicyChangeCrypto.ts`: EXISTS
- `packages/policy/src/PolicyValidator.ts`: EXISTS
- `packages/policy/src/types/LedgerEntry.ts`: MISSING
- `packages/shared/src/domain/policy-change-approval-record.ts`: EXISTS
- `packages/storage/src/postgres/PostgresPolicyChangeApprovalRecordRepository.ts`: EXISTS
- `scripts/backfill-legacy-policy-approvals.ts`: EXISTS
- `supabase/migrations/20260907130000_add_previous_record_hash_to_policy_change_approval_records.sql`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                                  | Status | Tests | Passed | Skipped |
| -------------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts` | passed | 12    | 12     | 0       |
