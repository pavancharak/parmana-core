# Tutorial: authorize a refund

[Tutorials](README.md) · [Fintech integration](fintech-integration.md) · [Policy management](../policies/README.md) · [Glossary](../glossary.md#sourced-fact)

**Goal.** A refund runs only when two things hold, and the requesting application cannot declare either one:

1. **A payment source confirms the payment is refundable.** Parmana asks the source itself, through a registered business signal source.
2. **A manager signs an approval** for this payment, for at least this amount, used once.

**Verification.** The live `policies/payment-refund/1.0.0/policy.json` decides every case below. Tutorial 129 ([`examples/tutorials/129-payment-refund-stand-in-source/run.ts`](../../../examples/tutorials/129-payment-refund-stand-in-source/run.ts)) ran all six cases in the examples runner, and every case behaved as the policy requires. That tutorial uses an in-process stand-in for the payment source. **This portal did not run a refund against a live server with a payment source.** The refund flow on a server needs a registered source and a capability binding, which this portal did not set up.

## Who does what

| Party                                                                     | Does                                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Refunds service**                                                       | Asks for a refund, asks the manager to approve it, and calls Parmana. Calls the payment provider only when Parmana approves. |
| **Manager** (a person)                                                    | Reviews the payment and the amount, and signs an approval for this payment and up to this amount.                            |
| **Payment source** (for example the payment provider's signal service)    | Answers, when asked, whether the payment is refundable. Registered with Parmana through governance.                          |
| **Parmana service**                                                       | Checks the caller, asks the registered source, verifies the approval, decides, and records the evidence.                     |
| **Connector** (for example `razorpay` or `paytm` in `parmana-connectors`) | Performs the refund with the provider. Not exercised by this portal.                                                         |

## The policy

`payment-refund@1.0.0` has three rules, checked in order. The first matching rule decides:

| Rule                         | Condition                                                                                         | Outcome |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| `refuse-not-refundable`      | the source says the payment is not refundable for this amount                                     | reject  |
| `tier-2-with-exact-approval` | the source confirms refundable, **and** `managerApproved` is true for this payment at this amount | approve |
| `reject-by-default`          | anything else                                                                                     | reject  |

Its signals:

| Signal              | Who supplies it  | Notes                                                                                                                                                                  |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paymentRefundable` | the **source**   | Sourced: Parmana asks the source for the claim `payment.refundable` about `target`. The result is valid for 60 seconds (`maxAgeSeconds`). The caller must not send it. |
| `managerApproved`   | the **approval** | Approved: true only when a signed manager approval covers the target and the amount. The approval's `resourceId` is `target`.                                          |
| `refundAmount`      | the **request**  | Bound: must equal `parameters.amount`.                                                                                                                                 |

The policy's approve rule requires the approval, and the sourced fact is checked independently. A caller that declares `managerApproved: true` without an approval gets nothing from it.

## The request

The action is `payments:refund`. The target is the payment. The amount goes in `parameters.amount`.

```typescript
import { createBusinessTransaction, signApproval } from "@parmana/sdk";

// The manager signs, on the manager's machine:
const approval = signApproval({
  privateKeyPem: managerPrivatePem, // the manager's Ed25519 key, held by the manager
  approverId: "manager-priya", // registered as an approver for payments:refund
  keyId: "manager-priya-key-1",
  capability: "payments:refund", // the action
  resourceId: "payments/pay_ABC123", // the payment (the target), exactly
  maxAmount: 5000, // up to this amount, and not more
  ttlSeconds: 900,
});

// The refunds service builds the transaction. It does NOT send paymentRefundable.
const refund = createBusinessTransaction({
  principalId: "refunds-service",
  purpose: "Refund for order 7731",
  action: "payments:refund",
  target: "payments/pay_ABC123",
  parameters: { amount: 5000 },
  policy: { name: "payment-refund", version: "1.0.0", schemaVersion: "1.0.0" },
  signals: {
    managerApproved: true, // the approval is what makes this true
    approvalArtifact: approval,
    refundAmount: 5000, // must equal parameters.amount
  },
});
```

The example is illustrative: it shows the shape of the call. The key values, the principal and the approver registration depend on your deployment.

## The six cases

These are the outcomes tutorial 129 recorded in the examples runner:

| #   | Case                                           | Outcome               | Reason in the output                                                                           |
| --- | ---------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | A payment the source says is fully refunded    | refused               | `refuse-not-refundable`: the source does not confirm the payment is refundable for this amount |
| 2   | A refundable payment, no manager approval      | refused               | `reject-by-default`: neither tier applies                                                      |
| 3   | The same refund, with the signed approval      | **approved**          | `tier-2-with-exact-approval`                                                                   |
| 4   | The same approval sent again                   | refused               | an approval is used once                                                                       |
| 5   | An approval for 5000 used for a refund of 6000 | refused               | the approval does not cover the amount                                                         |
| 6   | The payment provider cannot be reached         | refused, fails closed | `SOURCE_UNAVAILABLE`: the source did not answer                                                |

Case 6 matters most in production. When the source does not answer, Parmana refuses, and the refusal names `SOURCE_UNAVAILABLE`. A source's answer is accepted only within the policy's freshness window (`maxAgeSeconds`, 60 seconds here).

## What happens in the business application

1. The refunds service records the refund request, and asks the manager.
2. The manager approves in their own tool. The service receives the approval as data.
3. The service calls Parmana. Parmana asks the payment source, verifies the approval, and decides.
4. If approved, the connector instructs the payment provider to refund the payment. The service records the refund against the order, with the record's reference.
5. If refused, the refund does not happen. The service shows the reason to the requester or the manager.

## Setting up a live refund

Before a refund can run on a server, these must be in place. Each is a governance decision, and each is approved through maker-checker:

- **The business signal source** `razorpay` (or your provider) is registered with Parmana, with its endpoint and the claims it answers. See `business-signal-sources` in the [endpoint index](../api/endpoint-index.md).
- **The capability `payments:refund`** is allowed to the refunds service's caller key (`allowedCapabilities` in `PARMANA_API_KEYS`).
- **The manager's approver key** is registered for `payments:refund` through approval-issuer governance.
- **The connector** for the provider is deployed and reached only through the gateway.

## Limits of this tutorial

- Case outcomes are from the decision engine run in tutorial 129. The server-level path (through `POST /execute`, with a registered source) was not run in this verification.
- The 60-second freshness of the source's answer is set by the policy. Choose it deliberately for your provider.
- The policy as written refuses when the source does not answer. It does not offer a fallback. If you need one, that is a policy change, approved through maker-checker.
