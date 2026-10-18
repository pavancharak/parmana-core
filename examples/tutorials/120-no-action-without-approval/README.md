# Tutorial 120: no action without a signed human approval

## Objective

Show the rule every policy and every action follow: no AI agent action is authorized without a
signed approval from a trusted person, reads included. See
`docs/site/concepts/human-approval.mdx`, `docs/CLAIMS.md` 2.47 and `docs/VERIFICATION-GAPS.md` G-80.

## How it is enforced

- `PolicyValidator` refuses to load a policy whose approve rule does not require a fact from
  `approvalSignals` with `is_true`, as its whole condition or directly inside its top level `all`.
  The same check runs on every proposed policy change.
- `ApprovalSignalVerifier` counts that fact as true only with a valid signed approval.
- `RuntimeEngine` refuses an approval when no approval verifier is configured.

## The steps

Part 1, which approve rules a policy may have:

1. An approve rule that always approves: refused.
2. An approve rule on facts the agent declares: refused.
3. The approval signal only inside an `any`: refused, the other branch could approve alone.
4. `humanApproved` is `is_true` but not declared in `approvalSignals`: refused.
5. `humanApproved` declared in `approvalSignals`, `is_true` in the top level `all`: loads.

Part 2, every policy in `policies/`:

6. The newest version of every policy loads; every older version that approved without a person
   is refused.

Part 3, the runtime:

7. `humanApproved: true` with no approval and no approval verifier configured: refused.
8. The same with the approval verifier: refused, the signal does not match the verified state.
9. A person signs an approval for the target and the agent attaches it: approved.

## Run

```bash
npx tsx examples/tutorials/120-no-action-without-approval/run.ts
```

It is also part of `npm run examples`. Hermetic: the approver key is made in memory
(`examples/shared/helpers/demo-approval.ts`).

## Code

- `packages/policy/src/PolicyValidator.ts` (`validateEveryApprovalNeedsSignedApproval`)
- `packages/runtime/src/RuntimeEngine.ts` (`approval-verifier-not-configured`)
- `packages/approval/src/ApprovalSignalVerifier.ts`
- Tests: `packages/policy/tests/unit/PolicyValidator.test.ts`,
  `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts`,
  `packages/runtime/tests/unit/runtime.test.ts`
