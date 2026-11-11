# 2.35 Execution-Time Policy Governance Verification (Prevention, Always On Outside Test and Development)

Source: CLAIMS.md (commit d1d63c6), lines 1198-1230.

## Exact claim text

## 2.35 Execution-Time Policy Governance Verification (Prevention, Always On Outside Test and Development)

**What this adds.** 2.34 (and 2.26 before it) detect a Policy Governance bypass after the fact — at process startup, or every 5 minutes thereafter. This section adds real prevention on top: a policy with no `PolicyChangeApprovalRecord`, an approval record whose signature does not verify, or live content that no longer matches its approval record's `contentHashAfter` can now be refused _before_ `PolicyEngine` ever evaluates a rule in it, not merely flagged up to 5 minutes later.

**Where it actually lives.** A prior implementation runbook assumed the choke point was `packages/api/src/execution-gateway/ExecutionGateway.ts` — that path does not exist. Reading the source directly found the real, single choke point for every policy evaluation to be `RuntimeEngine.execute()` (`packages/runtime/src/RuntimeEngine.ts,325` — `policyRouter.load()` then `policyEngine.evaluate()`); `packages/execution-gateway/src/ExecutionGateway.ts` is a separate package that runs _after_ authorization, for connector execution, and never calls `PolicyEngine.evaluate()` at all. The new check (`packages/policy/src/types/PolicyExecutionVerifier.ts`, concrete implementation `packages/api/src/governance/PolicyGovernanceExecutionVerifier.ts`) is wired in immediately after the existing G-24 `policyContentHash` computation and before `capabilityPolicyBinder`/`signalIntentBinder` — checking a narrower guarantee against a policy that might itself be illegitimate is meaningless, the same reasoning §2.22/TD-22 already documents for why capability binding runs before signal-intent binding.

**Same optional-dependency idiom as every other pluggable protection in `RuntimeEngine`.** `policyExecutionVerifier` is a new, trailing, optional constructor parameter — the same pattern `signalStateVerifier`/`capabilityPolicyBinder` already use. When omitted, current behavior is unchanged. When supplied and it finds a violation, that becomes an ordinary `PolicyDecision` with `outcome: REJECT` and `matchedRuleId: "policy-execution-verification-violation"` — flowing through the exact same refusal-recording (RFC-0021) and fail-closed `ExecutionGate.enforce()` path every other rejection already uses. No new throw-and-audit-separately mechanism was added; a prior runbook proposed one, and it was deliberately not built, since it would have bypassed the trust/refusal-recording pipeline every other rejection in this codebase goes through.

**Feature-flagged, default OFF — this was a decision, not an oversight.** `createPolicyExecutionVerifier()` (`packages/api/src/bootstrap/createPolicyExecutionVerifier.ts`) returns `undefined` unless `POLICY_EXECUTION_VERIFICATION_ENFORCED=true` is set. This was deliberate when written: at that time, every real production policy in this system was still `PENDING_APPROVAL` with zero rows in `policy_change_approval_records` (2.26's "Legacy-policy backfill" entry, ten policies proposed 2026-08-19). Enabling this gate unconditionally would have refused every execution in the system, not merely a genuine bypass. Before writing any code, this exact tradeoff was put to the user directly (an always-on gate vs. a warn-only stage vs. a feature flag vs. not building it yet); the user chose the feature-flagged default-off option, specifically to avoid a choice between bricking production and fabricating synthetic approvals for the ten real pending policies to work around it — the latter being exactly what 2.34's backfill-script fix (`4e1a8e3`) already refused to do for a different reason.

**Update (2026-09-16): the precondition above no longer holds, the flag itself is unchanged.** 2.26's "Legacy-policy backfill" entry now shows all 14 real production policies with a genuine, distinct-checker `PolicyChangeApprovalRecord`. The reason the flag was off (zero approval records, an unconditional gate would refuse everything) is gone. `POLICY_EXECUTION_VERIFICATION_ENFORCED` has not been changed and remains `false` in `.env` — turning it on is still a separate, deliberate decision the runbook explicitly reserves for a later, dedicated step (Part 5 of the policy approval runbook, in git history: "Do this only once every policy this deployment actually executes against has been resolved"), not something this pass did as a side effect of closing the backfill.

**Update (2026-09-20): the flag no longer decides production behavior.** `createPolicyExecutionVerifier()` now returns a real verifier everywhere except when `NODE_ENV` is exactly `test` or `development`. In production, or with `NODE_ENV` unset or set to any other value, `POLICY_EXECUTION_VERIFICATION_ENFORCED` is ignored and enforcement is on. The earlier gap, where a production deployment could run with the verifier unconfigured (`policyExecutionVerifierConfigured: false` was observed in the live startup log on 2026-09-20), is closed by removing the opt in. The tradeoff recorded above still applies in one direction: any deployment must have a genuine, signed approval record for every policy it executes against before it goes live, or executions under that policy are refused.

**What this does not change.** The CI merge-gate requirement described in 2.26 ("Preventive Git-layer enforcement") is unchanged — still fail-closed in CI, still not a _required_ GitHub status check, still blocked by GitHub plan/repository-visibility limits external to this codebase, not attempted again here.

Evidence

- `packages/policy/src/types/PolicyExecutionVerifier.ts` (`PolicyExecutionVerifier`/`PolicyExecutionViolation`, undefined-means-clean)
- `packages/api/src/governance/PolicyGovernanceExecutionVerifier.ts` (concrete implementation: no-record / bad-signature / content-mismatch checks, in that order)
- `packages/api/src/bootstrap/createPolicyExecutionVerifier.ts` (enforced by default; relaxed only when `NODE_ENV` is exactly `test` or `development`, see 2.36)
- `packages/runtime/src/RuntimeEngine.ts` (constructor param, observability log field, `execute()` wiring before capability/signal-intent binding), `RuntimeBuilder.ts` (`withPolicyExecutionVerifier`), `RuntimeFactory.ts`, `packages/api/src/application.ts`
- `packages/api/tests/unit/PolicyGovernanceExecutionVerifier.test.ts` (4 cases: no record, bad signature, content mismatch, clean)
- `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts` (cases: enforced in production, cannot be switched off in production by the env var, enforced when `NODE_ENV` is unset or unrecognized, off in test and development unless exactly `"true"`)
- `packages/runtime/tests/e2e/runtime.e2e.test.ts` (2 new cases: a configured violation rejects before `PolicyEngine` runs; no violation leaves execution unaffected), `packages/runtime/tests/unit/optional-protections-logging.test.ts` (1 new case)
- `examples/tutorials/104-policy-governance-execution-verification/run.ts` (runnable narrative, no HTTP server: an approved policy executes normally, a policy with no approval record is refused, a policy edited outside the governed API is refused and independently caught by `verifyPolicyGovernanceIntegrityAtStartup()` too, and a tampered approval record is refused on signature failure — added in the same pass as this evidence update, registered in `scripts/run-examples.ts`)
- Full repo `npx tsc -b` and `npx vitest run` clean: 1544 passed, 38 pre-existing skips, 0 failed. Commit `7a1aa37`

**Update (2026-10-16, proof audit, G-105 and G-103):** governance relaxation (`NODE_ENV` of `test` or `development`)
now also needs an explicit `PARMANA_ALLOW_UNGOVERNED_POLICY=true`. `NODE_ENV` alone no longer disables the
approval-record check. The policy content hash is always required, including in the relaxed mode, since the
production bootstrap no longer sets `allowUnverifiedPolicy`.


## Cited evidence paths

- `examples/tutorials/104-policy-governance-execution-verification/run.ts`: EXISTS
- `packages/api/src/application.ts`: EXISTS
- `packages/api/src/bootstrap/createPolicyExecutionVerifier.ts`: EXISTS
- `packages/api/src/execution-gateway/ExecutionGateway.ts`: MISSING
- `packages/api/src/governance/PolicyGovernanceExecutionVerifier.ts`: EXISTS
- `packages/api/tests/unit/PolicyGovernanceExecutionVerifier.test.ts`: EXISTS
- `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts`: EXISTS
- `packages/execution-gateway/src/ExecutionGateway.ts`: EXISTS
- `packages/policy/src/types/PolicyExecutionVerifier.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts,325`: MISSING
- `packages/runtime/tests/e2e/runtime.e2e.test.ts`: EXISTS
- `packages/runtime/tests/unit/optional-protections-logging.test.ts`: EXISTS
- `scripts/run-examples.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/unit/PolicyGovernanceExecutionVerifier.test.ts` | passed | 6 | 6 | 0 |
| `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts` | passed | 4 | 4 | 0 |
| `packages/runtime/tests/e2e/runtime.e2e.test.ts` | passed | 8 | 8 | 0 |
| `packages/runtime/tests/unit/optional-protections-logging.test.ts` | passed | 4 | 4 | 0 |
