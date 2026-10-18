# Tutorial 119: human approval for one action

## Objective

Show a person signing off on one critical action: a refund runs only with a signed approval
from a trusted manager, for that order and at least that amount, used once. It uses the real
`policies/customer-refund/1.2.0/policy.json` and the real components the server runs.

## What the policy says

| Refund amount     | Result                                               |
| ----------------- | ---------------------------------------------------- |
| 0 or less         | refused                                              |
| above 0 to 100000 | needs `managerApproved`, backed by a signed approval |
| above 100000      | refused, approval or not                             |

In 1.1.0, a refund up to 10000 was approved automatically, on the agent's word alone that the
order was eligible and passed the fraud check. Nothing checks those two facts, so an agent
manipulated by prompt injection could approve its own refunds. 1.2.0 closes that (G-75): they
can only refuse a refund now.

`managerApproved` is declared in the policy's `approvalSignals`:

```json
"approvalSignals": {
  "managerApproved": { "resourceId": "parameters.orderId", "value": "parameters.amount" }
}
```

So the signal counts as `true` only when `signals.approvalArtifact` holds an approval that
`ApprovalSignalVerifier` accepts: signed by a trusted, not revoked approver, not expired,
for `paytm:refund`, for this order, with an amount limit at least the amount in the
request (taken from the request, never from the agent's signals), and never used before.

## The steps

1. A refund of 5000 with no manager is refused: every refund needs one.
2. A refund of 75000 with no manager is refused (`reject-manager-approval-required`). The
   server also writes a signed Refusal Record, which a manager can review.
3. The agent sends `managerApproved: true` with no approval: refused.
4. The manager signs an approval for this order, up to 75000, for 15 minutes, and the agent
   sends a new request with it: approved.
   - The gateway checks the approval again just before release, without using it up.
5. The same approval sent again: refused. An approval is used once.
6. An approval up to 75000 used for a 90000 refund: refused.
7. An approval for another order: refused.
8. A refund of 150000 with an approval: refused by the policy maximum.

The tutorial runs the policy first and then, only for a provisional approve, the approval
check, in the order `RuntimeEngine` runs them.

## Run

```bash
npx tsx examples/tutorials/119-human-approval-for-one-action/run.ts
```

It is also part of `npm run examples`. Hermetic: the manager key is generated in memory
and nonces are kept in memory.

## In production

1. The manager runs `scripts/generate-approver-key.ts` on their own machine. The private
   key never leaves it.
2. The operator adds `{ approverId, keyId, revoked: false, publicKeyPem }` to
   `TRUSTED_APPROVAL_ISSUERS` in `packages/api/src/bootstrap/createApprovalIssuerRegistry.ts`
   and deploys.
3. For each refund that needs it, the manager signs with `scripts/sign-approval.ts`
   (`--capability paytm:refund --resource-id <order> --max-amount <amount>`), and the agent
   sends the result in `signals.approvalArtifact` with `managerApproved: true`.

See the guide `docs/site/guides/policy-lifecycle-and-approvals.mdx`, part 2.

## Code

- `packages/approval/src/ApprovalSignalVerifier.ts`
- `packages/approval/src/ApprovalVerifier.ts`
- `packages/policy/src/types/Policy.ts` (`approvalSignals`)
- Tests: `packages/approval/tests/unit/ApprovalSignalVerifier.test.ts`,
  `packages/policy/tests/unit/CustomerRefundPolicy120.test.ts`,
  `packages/api/tests/integration/paytm-refund.integration.test.ts`
