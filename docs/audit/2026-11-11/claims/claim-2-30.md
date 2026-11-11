# 2.30 Policy-Authoring and Deployment Observability Warnings

Source: CLAIMS.md (commit d1d63c6), lines 1049-1076.

## Exact claim text

## 2.30 Policy-Authoring and Deployment Observability Warnings

Three checks make gaps visible that were previously silent: a rule fact that is not bound, two rules that can match the same input, and a runtime started without optional protections.

**Every rule fact is bound or acknowledged, or the policy does not load.** `boundSignals` (2.11) verifies only the signals a policy lists. `PolicyValidator.findUncoveredFacts(policy)` walks every rule condition, including nested `all` and `any`, and returns each fact that has neither a `boundSignals` entry nor an `unboundSignalReasons` entry. `PolicyValidator.validate()` throws for any such fact, and `PolicyRouter.load()` calls it, so an unacknowledged uncovered fact stops the policy from loading. A policy author acknowledges a fact that has no Intent-side equivalent by giving a non-empty reason for it in `unboundSignalReasons`. A reason is a documented claim that the fact cannot be bound. It is not proof, and reviewers still have to judge it.

**Rule conflicts are reported, not blocked.** `PolicyValidator.findRuleConflicts(policy)` looks for rules whose conditions can both match the same input. Under first-match-wins, the later rule can then be partly or wholly unreachable. `PolicyRouter.load()` logs `policy_rule_conflict_detected` through `console.warn` and does not throw, because an overlap is a judgment call and the checker does not claim to catch every condition shape. The results also appear as `ruleConflicts` in the policy-change review in `packages/api/src/routes/pending-policy-changes.ts`, next to `coverageWarnings`.

**Optional protections are logged at construction.** `RuntimeEngine`'s constructor logs `runtime_engine_constructed` once. It records whether each optional dependency is configured: `signalStateVerifier`, `capabilityPolicyBinder`, policy execution verification, the governance anchor resolver, signing readiness, execution intents, and refusal recording. The log is written once per instance, not per request. An operator can see from the log which protections a deployment is running with.

**Scope and limits.**

- The coverage check only sees facts a rule references. A fact that a rule never reads is not checked.
- The conflict check is heuristic. A clean result does not prove that no two rules overlap.
- The construction log says which dependencies were supplied. It does not say that a supplied dependency is correctly configured.

**Evidence.**

- `packages/policy/src/PolicyValidator.ts` (`validate`, `findUncoveredFacts`, `findRuleConflicts`)
- `packages/policy/src/PolicyRouter.ts` (`load`, the `policy_rule_conflict_detected` warning)
- `packages/api/src/routes/pending-policy-changes.ts` (`coverageWarnings`, `ruleConflicts` in the review output)
- `packages/policy/tests/unit/PolicyValidator.test.ts` and `PolicyValidator.exact.test.ts` (uncovered facts, acknowledged facts, nested conditions, and rule conflicts)
- `packages/policy/tests/unit/PolicyRouter-boundSignals-coverage.test.ts` (loads when every fact is bound or acknowledged, and throws naming the policy and the fact when neither applies)
- `packages/runtime/src/RuntimeEngine.ts` (`runtime_engine_constructed`)
- `packages/runtime/tests/unit/optional-protections-logging.test.ts` (the logged flags for each protection on its own and when none is supplied)

Dated updates, including the policy changes that closed the gaps and the 2026 coverage and conflict findings, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## Cited evidence paths

- `packages/api/src/routes/pending-policy-changes.ts`: EXISTS
- `packages/policy/src/PolicyRouter.ts`: EXISTS
- `packages/policy/src/PolicyValidator.ts`: EXISTS
- `packages/policy/tests/unit/PolicyRouter-boundSignals-coverage.test.ts`: EXISTS
- `packages/policy/tests/unit/PolicyValidator.test.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts`: EXISTS
- `packages/runtime/tests/unit/optional-protections-logging.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                               | Status | Tests | Passed | Skipped |
| ----------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/policy/tests/unit/PolicyRouter-boundSignals-coverage.test.ts` | passed | 3     | 3      | 0       |
| `packages/policy/tests/unit/PolicyValidator.test.ts`                    | passed | 31    | 31     | 0       |
| `packages/runtime/tests/unit/optional-protections-logging.test.ts`      | passed | 4     | 4      | 0       |
