# 3.30 Inbound Check Approves Only When the Bound Policy and the Grant Both Allow (Scoped, 2026-11-05)

Source: CLAIMS.md (commit d1d63c6), lines 2119-2136.

## Exact claim text

## 3.30 Inbound Check Approves Only When the Bound Policy and the Grant Both Allow (Scoped, 2026-11-05)

**Claim.** `POST /v1/inbound/checks` approves a request only when both hold: the policy bound to the requested capability approves it, and the partner holds a current grant whose limits hold for the request. The policy is run by the runtime's `decide()` step, with the same verification and binding checks as `/execute`, without executing anything. A capability with no bound policy is refused (403 `no_policy_bound`), as is one whose policy cannot be determined (403 `policy_unavailable`). Every decision, approved or rejected, is signed and stored with the policy name and version that decided it.

**Evidence.**

- `packages/api/src/routes/inbound-checks.ts`: the flow above.
- `packages/api/tests/unit/routes/inbound-checks.test.ts`: 16 tests, covering approval, policy rejection, a limit above the grant (rejected with `approval_required` even when the policy approves), the request the policy receives (partner as submitter, declared signals, no authority or authorization), no bound policy, an unavailable policy, a grant with an incomplete limit, and the grant cases.
- `packages/runtime/src/RuntimeEngine.ts`: `decide()` takes a `DecisionRequest`, which leaves out `authority` and `authorization`. Deciding does not read them.
- Run on 2026-11-05: the 16 check tests and the 8 refund tests pass, and the runtime suite (217 tests, 33 files) passes.

**Limits.**

- The approver is not recorded (`approved_by` and `approved_at` are not written; G-143).
- Declared facts are verified as `/execute` verifies them. Facts confirmed by the business's own records are not yet used (G-144, RFC-0026).
- No business system calls the check, and no probe checks that a direct call is refused (G-146, G-129).
- This change is on a branch stacked on the open pull request #448, and is not on `main` until #448 merges.

## Cited evidence paths

- `packages/api/src/routes/inbound-checks.ts`: EXISTS
- `packages/api/tests/unit/routes/inbound-checks.test.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                               | Status | Tests | Passed | Skipped |
| ------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/unit/routes/inbound-checks.test.ts` | passed | 16    | 16     | 0       |
