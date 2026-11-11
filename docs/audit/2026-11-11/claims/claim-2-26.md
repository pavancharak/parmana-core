# 2.26 Policy Changes Need a Human Maker and a Different Human Checker

Source: CLAIMS.md (commit d1d63c6), lines 933-967.

## Exact claim text

## 2.26 Policy Changes Need a Human Maker and a Different Human Checker

**Claim.** A change to a policy's content takes effect only after a human checker approves it, and the maker and checker are different people. The approval is recorded durably and signed. Before this, a caller with write access to `policies/` could change what a policy allows, with no second party and no signed record of who approved it.

**How it works.**

- **Lifecycle.** A change moves from `PENDING_APPROVAL` to `APPROVED` or `REJECTED`, once, and never back (`packages/shared/src/domain/pending-policy-change.ts`).
- **Four endpoints** (`packages/api/src/routes/pending-policy-changes.ts`): propose (`POST /:name/:version/pending-changes`), list with the diff (`GET /pending-changes`), approve (`POST /pending-changes/:id/approve`), and reject (`POST /pending-changes/:id/reject`). Each one requires a human caller (`isHumanCaller`). A service or organization credential is refused.
- **Maker is not checker.** The API refuses an approve or reject by the same caller who proposed the change (`SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`).
- **Approval is signed at the checker's own machine.** Approve and reject need a step-up authorization, signed by the checker's own key with `scripts/sign-policy-change-step-up.ts`. The key does not leave that machine.
- **Startup integrity check.** At startup, the server compares each approved policy's file against its approval record. If an approved policy's file does not match (missing, changed content, invalid signature, or broken chain), or the records cannot be read, the server does not start (`policy_governance_integrity_startup_refused`). A database with no approval records starts normally. A periodic re-check logs drift during uptime, and does not stop the server.
- **Content hash at decision.** The approval records the policy's content hash at the time it was decided. `PolicyGovernanceAnchorResolver` checks the policy's most recent approval record and reports its status on each execution's trust record. It never blocks an execution. With `POLICY_EXECUTION_VERIFICATION_ENFORCED=true`, `PolicyGovernanceExecutionVerifier` refuses execution when the check fails. This flag is off by default.

**The governance UI is read-only.** `packages/governance-ui` lists pending changes and shows their diffs. It has no route that approves or rejects. The checker approves on the command line, as above. The UI holds the API key it was given only in server-side session memory, never in a page. Its login is rate limited.

**Scope and limits.**

- **Deployment is not part of this claim.** The claim is about what the code does, and what the tests cover. It does not say which environment is running which version.
- **Enforcement is off by default.** Until `POLICY_EXECUTION_VERIFICATION_ENFORCED` is on, a mismatch is recorded, not refused.
- **A database outage at startup stops the server,** because the integrity check cannot run without the records.
- **Maker and checker are separate credentials, not proven separate people.** One person can hold both (2.45).

**Evidence.**

- `packages/api/src/routes/pending-policy-changes.ts`
- `packages/api/src/auth/isHumanCaller.ts` and `packages/api/tests/unit/isHumanCaller.test.ts`
- `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` (non-human denial on each endpoint, and maker is not checker)
- `packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts`, and `packages/api/src/server.ts` (the startup call is awaited before the server listens)
- `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts`
- `packages/api/src/governance/PolicyGovernanceAnchorResolver.ts` and `packages/api/src/governance/PolicyGovernanceExecutionVerifier.ts`
- `scripts/sign-policy-change-step-up.ts`
- `packages/governance-ui/tests/integration/app.integration.test.ts`

Dated updates for this claim, including the change from a background check to a startup check, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).


## Cited evidence paths

- `packages/api/src/auth/isHumanCaller.ts`: EXISTS
- `packages/api/src/governance/PolicyGovernanceAnchorResolver.ts`: EXISTS
- `packages/api/src/governance/PolicyGovernanceExecutionVerifier.ts`: EXISTS
- `packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts`: EXISTS
- `packages/api/src/routes/pending-policy-changes.ts`: EXISTS
- `packages/api/src/server.ts`: EXISTS
- `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts`: EXISTS
- `packages/api/tests/unit/isHumanCaller.test.ts`: EXISTS
- `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts`: EXISTS
- `packages/governance-ui`: EXISTS
- `packages/governance-ui/tests/integration/app.integration.test.ts`: EXISTS
- `packages/shared/src/domain/pending-policy-change.ts`: EXISTS
- `policies/`: EXISTS
- `scripts/sign-policy-change-step-up.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` | passed | 33 | 33 | 0 |
| `packages/api/tests/unit/isHumanCaller.test.ts` | passed | 3 | 3 | 0 |
| `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts` | passed | 12 | 12 | 0 |
| `packages/governance-ui/tests/integration/app.integration.test.ts` | passed | 15 | 15 | 0 |
