# Tutorial 119: human approval for one action

## Objective

Show a person signing off on one critical action: a refund runs only when the payment source
confirms it is refundable, and a signed approval from a trusted manager covers this payment, up
to this amount, used once. It uses the live `policies/payment-refund/1.0.0/policy.json` and the
real components the server runs.

## What the policy says

| Condition                                                                 | Result                                  |
| ------------------------------------------------------------------------- | --------------------------------------- |
| The payment source does not confirm the payment is refundable             | refused (`refuse-not-refundable`)       |
| The source confirms, and no signed approval                               | refused (`reject-by-default`)           |
| The source confirms, and a signed approval covers this payment and amount | approved (`tier-2-with-exact-approval`) |

`managerApproved` is declared in the policy's `approvalSignals`:

```json
"approvalSignals": {
  "managerApproved": { "resourceId": "target", "value": "parameters.amount" }
}
```

So the signal counts as `true` only when `signals.approvalArtifact` holds an approval that
`ApprovalSignalVerifier` accepts: signed by a trusted, not revoked approver, not expired, for
`payments:refund`, for this payment (the Intent target), with an amount limit at least the amount
in the request (taken from the request, never from the agent's signals), and never used before.

The agent sends no approval flag of its own. The policy reads only what the payment source
confirms and what the signed approval proves.

## The payment source is a stand-in

This tutorial runs without a payment provider. The source is an in-process table registered
with the resolver under the name `razorpay`, as in tutorial 129. In production the source is
the payment provider's signal service.

## The steps

1. A refund of 5000 with no approval is refused: every refund needs one.
2. A refund of 75000 with no approval is refused. The server also writes a signed Refusal Record,
   which a manager can review.
3. The manager signs an approval for this payment, up to 75000, for 15 minutes, and the agent
   sends a new request with it: approved.
   - The gateway checks the approval again just before release, without using it up (step 3b).
4. The same approval sent again: refused. An approval is used once.
5. An approval up to 75000 used for a 90000 refund: refused. The amount comes from the request.
6. An approval for one payment used for another: refused.
7. A refund on a payment the source says is fully refunded, with an approval: refused. The source
   must confirm first.

The tutorial runs the source first, then the policy, then, only for a provisional approve, the
approval check, in the order `RuntimeEngine` runs them.

## Run

```bash
npx tsx examples/tutorials/119-human-approval-for-one-action/run.ts
```

It is also part of `npm run examples`. Hermetic: the manager key is generated in memory and
nonces are kept in memory.
