# Tutorial: gate vendor payments in a fintech application

[Tutorials](README.md) · [Transaction limits](transaction-limits.md) · [Refund authorization](refund-authorization.md) · [Maker-checker](maker-checker.md)

**Goal.** Your payments service releases a vendor payment only when the organization's policy approves it. The policy checks the payment's facts, the amount, and the risk, and a finance approver must have signed an approval for this vendor, this amount, and this time window.

**Verification.** Run against a local server from this repository. [`governed-flow.ts`](../examples/governed-quickstart/typescript/governed-flow.ts) approves and executes a payment through the `vendor-payment` policy. [`limits.ts`](../examples/governed-quickstart/typescript/limits.ts) refuses three payments that exceed the approval, the risk threshold, or the bound amount.

> **Important.** The policy in this tutorial is the repository's example, `vendor-payment@2.1.0`. Your organization writes and owns its own policy. Which facts Parmana verifies, which the caller declares, and what the limits are, are decisions for your policy owner. The example shows the mechanism, not your rules.

## Who does what

| Party                                              | Does                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Payments service**                               | Builds the payment request, asks the finance approver, calls Parmana, and calls the payment provider only when Parmana approves. |
| **Finance approver** (a person)                    | Reviews the payment, and signs an approval for this vendor, this amount, and this window.                                        |
| **Policy owner** (a person, through maker-checker) | Owns the `vendor-payment` policy and approves each version.                                                                      |
| **`@parmana/sdk`**                                 | Sends the request and turns refusals into typed errors.                                                                          |
| **Parmana service**                                | Checks the caller, loads the version in effect, evaluates the rules, verifies the approval, decides, and records the evidence.   |
| **Payment provider** (through a connector)         | Moves the money. It should accept requests only from Parmana's connector.                                                        |

## What the example policy decides

From `fixtures/policies/vendor-payment/2.1.0/policy.json`:

| Rule                                                                                                                                                                      | Outcome                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `humanApproved` is true, `vendorVerified`, `invoiceVerified`, `paymentApproved` and `sufficientFunds` are all true, the amount is positive, and `riskScore` is at most 20 | **approve**                                                                   |
| `riskScore` is above 20                                                                                                                                                   | reject: "the assessed payment risk exceeds the maximum permitted threshold"   |
| `vendorVerified` is false                                                                                                                                                 | reject: "the vendor has not been verified"                                    |
| `invoiceVerified` is false                                                                                                                                                | reject: "the invoice has not been verified"                                   |
| `paymentApproved` is false                                                                                                                                                | reject: "the required payment approval has not been granted"                  |
| `sufficientFunds` is false                                                                                                                                                | reject: "Vendor payment rejected because sufficient funds are not available." |

Two bindings matter as much as the rules:

- **The approval** is scoped to `target` (the vendor) and to `parameters.amount` (the amount). An approval for 1000 does not cover a payment of 5000.
- **Bound signals** must equal request fields. `paymentAmount` must equal `parameters.amount`, and `vendorId` must equal `target`. A mismatch is refused before the rules run.

In this policy, `vendorVerified`, `invoiceVerified`, `paymentApproved` and `sufficientFunds` are declared by the caller. Parmana does not confirm them, because the policy has no signal source for them. If your organization needs Parmana to confirm a fact (for example, that the vendor is on an approved list), the policy must bind that fact to a registered source. Write that in the policy and approve the policy through [maker-checker](maker-checker.md).

## Step 1: approve and run the example

```bash
# With the server running (see Getting started):
npx tsx docs/developer-portal/examples/governed-quickstart/typescript/governed-flow.ts
```

The flow proposes `vendor-payment@2.1.0`, has a checker approve it, and then executes a payment for 1000 with an approval for 1000. The output ends with `outcome: APPROVED` and `offline (SDK): valid=true`.

## Step 2: refuse the payments that should not go through

```bash
# Use the policy version in effect (2.1.0 after governed-flow.ts, or 2.1.1 if you approved it with the CLI):
GOVERNED_POLICY_VERSION=2.1.0 npx tsx docs/developer-portal/examples/governed-quickstart/typescript/limits.ts
```

```text
refused: amount above the human approval
   ExecutionRejectedError HTTP 403
   Execution rejected: Rejected: declared signal(s) do not match independently verified state (humanApproved=true != verified humanApproved=false).
refused: risk score above the policy limit
   ExecutionRejectedError HTTP 403
   Execution rejected: Vendor payment rejected because the assessed payment risk exceeds the maximum permitted threshold.
refused: bound paymentAmount differs from amount
   ExecutionRejectedError HTTP 403
   Execution rejected: Rejected: declared signal(s) do not match the executed intent (paymentAmount=999 != intent.parameters.amount=1000).
```

Each refusal names its reason. The first refusal reports that Parmana's independent check of the human approval returned false. The approval covers 1000 and the payment is 5000, so the check does not pass. The message does not say "amount" in so many words: it names the signal that failed.

## Step 3: wire it into the payments service

The integration is the same as in the [Node.js tutorial](nodejs-integration.md). The fintech-specific parts are:

- **Ask for the approval as part of the payment workflow.** Show the finance approver the vendor, the amount, the invoice and the risk score. The approver signs an approval for exactly those values with `maxAmount` set to the amount they accept.
- **Use one transaction id per payment attempt.** A retry of the same attempt uses the same id to read the outcome; a new attempt uses a new id.
- **Treat `ExecutionRejectedError` as the answer.** Mark the payment as not authorized and show the reason to the approver.
- **Store the record with the payment.** The `trustRecordId` and the record are your evidence for an audit.

## Step 4: keep the evidence

After a payment is approved, verify its record offline with the pinned key and keep the result. An auditor can check the record later without contacting Parmana. See [Evidence verification](../security/evidence-verification.md).

## What happens in the business application

1. The payment workflow prepares the payment and the approver signs it.
2. Parmana approves. The connector instructs the payment provider. The provider moves the money.
3. The payments service records the outcome and the record. The ledger entry references the record.
4. If Parmana refuses, no instruction reaches the provider. The payment stays unauthorized and the reason is recorded.

## Production notes

- Set `riskScore` from your own risk engine, and document it in the policy. The example's constant `5` is illustrative.
- Keep `maxAmount` as small as the approver's actual decision. A large approval reused for many payments is a risk in itself; approvals are single-use, but a large ceiling still exposes more than one payment.
- Put the payment provider's credentials behind the connector, not in the payments service. The connector is the only place the provider's credentials should be used.
