# 2.47 No Action Is Authorized Without a Signed Human Approval, Reads Included

Source: CLAIMS.md (commit d1d63c6), lines 585-622.

## Exact claim text

## 2.47 No Action Is Authorized Without a Signed Human Approval, Reads Included

**Update (2026-11-05, G-149).** An authorization with no `signalsHash` is refused at release when the signal state verifier is configured, so its approval is no longer accepted without a check at release.

**Claim.** Parmana authorizes no action without a signed approval from a trusted person, for that action and that resource. This holds for every policy, not only connector actions, and for reads as well as writes.

**How it is enforced.**

- **At policy load.** `PolicyValidator.validateEveryApprovalNeedsSignedApproval` refuses any policy with an approve rule that does not require a fact declared in `approvalSignals` with `is_true`. The fact must be the rule's whole condition, or sit directly inside its top-level `all`. An `any`, a nested `all`, or `eq true` does not count. `PolicyRouter` validates every policy it loads, so such a policy refuses every request. The policy-change endpoint validates every proposal, so such a policy cannot pass maker checker either.
- **At decision.** `ApprovalSignalVerifier` (2.42) counts an approval signal as true only with a valid signed approval. The approval must be from a trusted, unrevoked approver, with a valid Ed25519 signature, and must match the action, the resource, the amount where declared, the expiry, and single use. The Execution Gateway checks it again at release. `RuntimeEngine` refuses an approve decision when no approval verifier is configured (`approval-verifier-not-configured`), so a runtime built without one cannot trust a caller's `true`.

**Policies bound to capabilities.** The binding table (`CANONICAL_CAPABILITY_POLICY_BINDINGS`) is empty in this version. The reference policies also require a signed approval. For example, `vendor-payment` 2.1.0 and `expense-reimbursement` 1.1.0 need `humanApproved` for the Intent's target, and the amount is covered by the approval.

**Scope and limits.**

- **An approval covers the action and the resource, not every parameter.** Payment, expense and refund approvals do cover the amount.
- **Superseded versions remain in `policies/` as history.** Each one fails to load.
- **There is no automatic path.** An action cannot be authorized by server checks alone. This is the rule, not a missing feature (G-80).
- **Who approves is limited to the trusted approver list** (2.42, 2.45). The list is short, so in practice one person can approve every agent action at present.
- The claim holds for actions routed through Parmana (3.1).

**Evidence.**

- `packages/policy/src/PolicyValidator.ts` (`validateEveryApprovalNeedsSignedApproval`)
- `packages/runtime/src/RuntimeEngine.ts` (`approval-verifier-not-configured`)
- `packages/capability-registry/src/CapabilityPolicyBinding.ts` (the binding table)
- `packages/policy/tests/unit/PolicyValidator.test.ts` (the load rule, including the forms it refuses)
- `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts` (each approval-backed policy: the approval fact is required, the most permissive caller facts are refused without it, and a version that approves without a person is refused)
- `packages/policy/tests/unit/ReferencePolicies.test.ts` (every policy in `policies/` loads, or is refused only for approving without a person)
- `packages/runtime/tests/unit/runtime.test.ts` (a runtime with no approval verifier refuses an approval)
- `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` (a policy that approves without a person cannot be proposed)
- `test-support/approvals.ts` (the hermetic test approver used by the test suite)
- `examples/tutorials/120-no-action-without-approval` and `examples/tutorials/121-approval-for-a-read`
- `docs/site/concepts/human-approval.mdx`
- `docs/internal/VERIFICATION-GAPS.md`, G-80

Dated updates, the production history of these policies, and the approver records are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `docs/site/concepts/human-approval.mdx`: EXISTS
- `examples/tutorials/120-no-action-without-approval`: EXISTS
- `examples/tutorials/121-approval-for-a-read`: MISSING
- `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts`: EXISTS
- `packages/capability-registry/src/CapabilityPolicyBinding.ts`: EXISTS
- `packages/policy/src/PolicyValidator.ts`: EXISTS
- `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts`: EXISTS
- `packages/policy/tests/unit/PolicyValidator.test.ts`: EXISTS
- `packages/policy/tests/unit/ReferencePolicies.test.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts`: EXISTS
- `packages/runtime/tests/unit/runtime.test.ts`: EXISTS
- `policies/`: EXISTS
- `test-support/approvals.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                                              | Status | Tests | Passed | Skipped |
| -------------------------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` | passed | 33    | 33     | 0       |
| `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts`                            | passed | 84    | 84     | 0       |
| `packages/policy/tests/unit/PolicyValidator.test.ts`                                   | passed | 31    | 31     | 0       |
| `packages/policy/tests/unit/ReferencePolicies.test.ts`                                 | passed | 27    | 27     | 0       |
| `packages/runtime/tests/unit/runtime.test.ts`                                          | passed | 4     | 4      | 0       |
