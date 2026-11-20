# Tutorial: enforce transaction limits

[Tutorials](README.md) · [Fintech integration](fintech-integration.md) · [Policy management](../policies/README.md)

**Goal.** Make sure no execution goes above what was approved, or above the policy's risk threshold, whatever the application asks for. Parmana enforces three kinds of limit: the **approved amount** (through the human approval), the **bound amount** (the request's two amounts must agree), and the **policy threshold** (a fact the policy compares, such as a risk score).

**Verification.** [`limits.ts`](../examples/governed-quickstart/typescript/limits.ts) ran against a local server. All three cases were refused with the expected reason, and the script exits non-zero if any of them is approved. Output is in the [fintech tutorial](fintech-integration.md#step-2-refuse-the-payments-that-should-not-go-through).

## Three kinds of limit

| Limit                                                             | Set by                             | Enforced by                                                          | Example refusal                                           |
| ----------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| **Approved amount** (`maxAmount` on the approval)                 | The human approver, when they sign | The server verifies the approval's scope against `parameters.amount` | The approval covers 1000; the payment asks for 5000       |
| **Bound amount** (`paymentAmount` must equal `parameters.amount`) | The policy (`boundSignals`)        | The server, before the rules run                                     | `paymentAmount=999` but `parameters.amount=1000`          |
| **Policy threshold** (`riskScore` at most 20)                     | The policy owner (in the rule)     | The policy rules, in order                                           | `riskScore=25`: "exceeds the maximum permitted threshold" |

Each is independent. A payment must pass all three. Meeting one does not waive another.

## What the policy says

From `vendor-payment@2.1.0`:

- `boundSignals`: `paymentAmount` is bound to `parameters.amount`; `vendorId` is bound to `target`.
- `approvalSignals`: `humanApproved` is approved by a signed approval for `target`, with the value `parameters.amount`.
- A rule approves only when `riskScore` is at most 20, and `paymentAmount` is greater than zero.
- A rule rejects when `riskScore` is above 20.

The approval's scope is the part a developer most often gets wrong. The approval is not "the payment is approved". It is "this approver approves up to this amount, on this target, for this window".

## Step 1: sign the approval for the amount you intend to pay

```typescript
import { signApproval } from "@parmana/sdk";

const approval = signApproval({
  privateKeyPem: approverPrivatePem,
  approverId: "finance-approver-1",
  keyId: "finance-approver-key-1",
  capability: "test:fixture-execute",
  resourceId: "vendor://payments",
  maxAmount: 1000, // the largest amount this approval covers
  ttlSeconds: 900,
});
```

Give the approver the amount they are approving, and sign a `maxAmount` equal to it, not a round, larger number. A larger ceiling lets the same approval cover a larger payment. An approval stays usable until its `ttlSeconds` run out, and it is usable once.

## Step 2: send the amount the approval covers

```typescript
const transaction = createBusinessTransaction({
  // ...
  parameters: { amount: 1000, currency: "USD" },
  signals: {
    humanApproved: true,
    approvalArtifact: approval,
    // ...
    paymentAmount: 1000, // must equal parameters.amount
    riskScore: 5, // the policy's threshold is 20
    vendorId: "vendor://payments",
  },
});
```

## The three refusals

These are the three cases `limits.ts` runs. Each should be refused. Each was refused on the server, with `ExecutionRejectedError` (HTTP 403):

**1. The payment is above the approval.** The approval covers 1000. The request asks for 5000.

```text
refused: amount above the human approval
   ExecutionRejectedError HTTP 403
   Execution rejected: Rejected: declared signal(s) do not match independently verified state (humanApproved=true != verified humanApproved=false).
```

The server verifies the approval against the request. The check fails, and the verified value of `humanApproved` is false.

**2. The risk score is above the threshold.** The approval is valid, and the amount is right. The score is 25.

```text
refused: risk score above the policy limit
   ExecutionRejectedError HTTP 403
   Execution rejected: Vendor payment rejected because the assessed payment risk exceeds the maximum permitted threshold.
```

**3. The bound amount does not match the request.** `paymentAmount` says 999; `parameters.amount` says 1000.

```text
refused: bound paymentAmount differs from amount
   ExecutionRejectedError HTTP 403
   Execution rejected: Rejected: declared signal(s) do not match the executed intent (paymentAmount=999 != intent.parameters.amount=1000).
```

## Run it

```bash
# With the server running and vendor-payment approved (see the fintech tutorial):
GOVERNED_POLICY_VERSION=2.1.0 npx tsx docs/developer-portal/examples/governed-quickstart/typescript/limits.ts
```

If any case is approved, the script prints `UNEXPECTED` and exits with code 1. If you change the policy or the approval, run it again: the refusals are the test.

## Handle the refusal

```typescript
import { ExecutionRejectedError } from "@parmana/sdk";

try {
  await client.execute(transaction);
} catch (error) {
  if (error instanceof ExecutionRejectedError) {
    // The payment is not authorized. Do not retry it with a larger approval or a changed amount
    // on your own. Return the reason to the approver, who may sign a new approval for the right amount.
    return { authorized: false, reason: error.message };
  }
  throw error;
}
```

## What to do when a limit is reached

- **An approver needs a larger amount.** A new approval, for the new amount, signed by the approver. The application does not change the amount on its own.
- **The risk threshold is too strict for your business.** Change the policy. Changes are made through maker-checker, and the change is in effect only once approved.
- **The bound amount is wrong in your code.** Build `paymentAmount` and `parameters.amount` from the same variable. The builder does not do this for you, because the policy chooses which signals to bind.

## Production notes

- Make the approval's `maxAmount` a value the approver saw. The approval scope has no currency, and the example policy's rules compare amounts only, so check the currency in your own code and policy.
- Keep approvals short-lived. The default is 900 seconds. A longer validity is longer exposure for an approval that has not been used.
- Log every refusal. A refused execution is recorded as a refusal record, readable at `GET /refusal/{businessTransactionId}`. This was verified for a refusal caused by a missing approval; check the limit cases in your deployment the same way.
