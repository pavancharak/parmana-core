# Tutorial 129: refund with a payment source and a manager approval

## Objective

Show how the live `payment-refund` policy decides a refund. A refund runs only when two things
hold, and the caller cannot declare either one:

1. **A payment source confirms the payment is refundable.** Parmana asks the source itself
   (`razorpay`, claim `payment.refundable`) through the same resolver the runtime uses.
2. **A manager signs an approval** for this payment and at least this amount, used once.

The policy is the live `policies/payment-refund/1.0.0/policy.json`.

## The payment source is a stand-in

This tutorial runs without a payment provider. The source is an in-process table of payments,
registered with the resolver under the name `razorpay`. In production the source is the payment
provider's signal service, registered with Parmana, answering signed queries over HTTPS.

The stand-in is for the example only. It is not a substitute for a real source.

## The policy

| Condition                                                                 | Result                                       |
| ------------------------------------------------------------------------- | -------------------------------------------- |
| The source says the payment is not refundable                             | refused (`refuse-not-refundable`)            |
| The source confirms, no manager approval                                  | refused (`reject-by-default`)                |
| The source confirms, and a signed approval covers this payment and amount | approved (`tier-2-with-exact-approval`)      |
| The source cannot be reached                                              | refused, fails closed (`SOURCE_UNAVAILABLE`) |

The approval is declared in `approvalSignals` with `resourceId: target` and `value: parameters.amount`,
so it names this payment and caps this amount.

## The steps

1. A refund on a payment the source says is fully refunded: refused.
2. A refund on a refundable payment with no approval: refused.
3. The manager signs an approval for this payment, up to 5000. The same refund with it: approved.
4. The same approval sent again: refused, an approval is used once.
5. An approval for 5000 used for a refund of 6000: refused.
6. A refund when the payment provider cannot be reached: refused, Parmana fails closed.

The tutorial runs the resolver first, then the policy, then, only for a provisional approve, the
approval check, in the order the runtime runs them.

## Run

```bash
npx tsx examples/tutorials/129-payment-refund-stand-in-source/run.ts
```

It is part of `npm run examples`. Hermetic: the manager key and the nonces are in memory.
