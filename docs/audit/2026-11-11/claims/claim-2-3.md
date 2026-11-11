# 2.3 Deterministic Policy Evaluation

Source: CLAIMS.md (commit d1d63c6), lines 109-129.

## Exact claim text

## 2.3 Deterministic Policy Evaluation

**Update (2026-11-07, G-157).** A request must send every fact the policy's rules depend on. If a rule's outcome depends on a fact the request did not send, the decision is REJECT with `matchedRuleId: "missing-fact"`, and its reason names the missing facts. A rule that matches, or that does not read the missing fact, is decided as before. Every decision names the method that produced its verdict and that method's version: `evaluationMethod: { id: "deterministic-rules", version: "2" }`, set from `POLICY_EVALUATION_METHOD` in `packages/policy`. The version is `"2"` from this change; it was `"1"` from 2026-11-05 (G-148). The inputs are recorded with the verdict as `signals`. Decisions recorded before 2026-11-05 have no `evaluationMethod`. Decisions recorded at `"1"` for requests that omitted a fact may replay to a different verdict (G-160). Replay rule: a version 1 verdict is checked against its recorded signals under the rules that produced it, not under version 2. Those approvals are kept as recorded.

Parmana deterministically evaluates business policies using sequential rule evaluation with first-match semantics.

Evaluation records include:

- matched rule

- decision reason

- evaluation trace

Evidence

- PolicyEngine (`packages/policy/src/PolicyEngine.ts`)
- Missing-fact tests (`packages/policy/tests/unit/PolicyEngine.missing-fact.test.ts`)

---

## Cited evidence paths

- `packages/policy`: EXISTS
- `packages/policy/src/PolicyEngine.ts`: EXISTS
- `packages/policy/tests/unit/PolicyEngine.missing-fact.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                      | Status | Tests | Passed | Skipped |
| -------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/policy/tests/unit/PolicyEngine.missing-fact.test.ts` | passed | 9     | 9      | 0       |
