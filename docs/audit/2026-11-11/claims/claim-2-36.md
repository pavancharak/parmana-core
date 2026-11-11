# 2.36 Fail-Closed Policy Binding at the Execution Boundary

Source: CLAIMS.md (commit d1d63c6), lines 1231-1262.

## Exact claim text

## 2.36 Fail-Closed Policy Binding at the Execution Boundary

Every execution released by `ExecutionGateway` proves one policy hash across the whole chain, and any mismatch or any missing piece stops the execution before the connector is called. Four hashes must agree:

1. The policy the caller declared is the policy actually evaluated (capability to policy binding, 2.22, for registered capabilities).
2. The policy content hash equals the `contentHashAfter` of the policy's most recent signed `PolicyChangeApprovalRecord`, and that record's signature verifies. A checker's signed approval is the authority act that makes a policy usable.
3. That same hash is signed into the execution authorization as `policyContentHash` (2.27).
4. At release, the gateway recomputes the live policy hash and it must still equal the signed one, and the approval record check runs again against that live hash.

What changed on 2026-09-20 (`packages/execution-gateway/src/ExecutionGateway.ts`):

- **Missing is a failure, not a skip.** An authorization with no `policyContentHash` (an older authorization signed before 2.27) is rejected with `policyStillCurrent: false`. A missing policy at that name and version is a rejection. An error from the approval verifier is a rejection.
- **The approval record is checked at release, not only before authorization.** `ExecutionGatewayOptions.policyApprovalVerifier` reuses the `PolicyExecutionVerifier` port from 2.35. The result is `checks.policyGovernanceVerified` and, on failure, `policyGovernanceViolation.reason`.
- **A pass must be positive.** By default `valid` requires `policyStillCurrent === true` and `policyGovernanceVerified === true`. "Not run" is never a pass.
- **A misconfigured gateway cannot start.** The constructor throws unless it has both a `policyRepository` and a `policyApprovalVerifier`, unless the explicit opt out `allowUnverifiedPolicy: true` is set. Production bootstrap (`createExecutionGateway.ts`) sets it only when `createPolicyExecutionVerifier()` returns `undefined`, which happens only under `NODE_ENV` `test` or `development`.
- **The nonce is not burned by a policy binding failure.** The nonce remains the last check and is consumed only when every earlier check passed.

Scope, stated plainly:

- This binds execution to the policy a human checker approved. It does not prove the policy is correct or wise, and it does not model per policy or per role approver authority. Any provisioned human checker with a step up key can approve any policy (see G-50 in `docs/internal/VERIFICATION-GAPS.md`).
- Signals such as `fraudCheckPassed` are caller declared unless a `SignalStateVerifier` covers that capability. For any signal a policy declares in `approvalSignals`, `ApprovalSignalVerifier` (2.42) is wired; other signals are only as true as the caller says (G-51). Since 2026-09-28 the policies for LLM tool calls need a signed approval, so their caller declared facts cannot authorize on their own (2.44).
- The claim holds for execution routed through the gateway. A request that never reaches the gateway is not covered (see 3.1).
- Direct edits to the policy store outside the API are prevented from executing (hash mismatch against the approval record) but are still only detected, not blocked, at the storage layer.

Evidence

- `packages/execution-gateway/src/ExecutionGateway.ts`, `GatewayVerificationResult.ts` (`policyGovernanceVerified`, `policyGovernanceViolation`, `allowUnverifiedPolicy`)
- `packages/execution-gateway/tests/unit/policy-binding-fail-closed.test.ts` (10 cases: all hashes agree, construction refused without repository or verifier, no `policyContentHash`, policy edited after authorization, no approval record, stale approval hash, verifier error, policy missing, nonce not burned, explicit legacy opt out; each failure asserts zero connector calls)
- `packages/api/src/bootstrap/createPolicyExecutionVerifier.ts`, `createExecutionGateway.ts`
- `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts`
- Full repo `npx tsc -b` clean and `npx vitest run`: 1871 passed, 42 skipped, 0 failed


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `packages/api/src/bootstrap/createPolicyExecutionVerifier.ts`: EXISTS
- `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts`: EXISTS
- `packages/execution-gateway/src/ExecutionGateway.ts`: EXISTS
- `packages/execution-gateway/tests/unit/policy-binding-fail-closed.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts` | passed | 4 | 4 | 0 |
| `packages/execution-gateway/tests/unit/policy-binding-fail-closed.test.ts` | passed | 10 | 10 | 0 |
