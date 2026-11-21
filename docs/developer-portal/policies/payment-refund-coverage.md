# Coverage of the production policy

[Policy management](README.md) · [Refund authorization tutorial](../tutorials/refund-authorization.md) · [Error codes](../reference/error-codes.md)

This page says which policy Parmana runs in production, what the automated tests check about it, and which tests do not. It is written so you can judge how far to rely on the test suite when you integrate.

## The policy production runs

Production runs one policy: `payment-refund`, version `1.0.0`. It governs the action `payments:refund`. Every other policy in the repository is retired. Retired policies are kept only as test fixtures, and they do not decide anything in production.

The policy has three rules, checked in this order:

| Rule | What it does |
|------|--------------|
| `refuse-not-refundable` | Refuses the refund when the payment is not refundable. The signal comes from the payment source (Razorpay). |
| `tier-2-with-exact-approval` | Approves the refund only when a manager approval is present, and that approval is bound to the exact amount in the request. |
| `reject-by-default` | Rejects any request that no earlier rule approves. |

## What the tests check

The suite includes a test that loads the production policy file, validates it against the policy schema, and checks each of the three rules and the refusal reason. The test runs with the package's test suite, so a change to the production policy that breaks one of these rules fails the suite.

## What the tests do not check

Many other tests and examples use retired policies. They exercise the policy engine, the runtime and the signing pipeline, but their decisions are not production decisions. Read a passing example as proof of the mechanism, not as proof of what production will approve or refuse.

The tests do not check the live payment source. Whether Razorpay reports a payment as refundable is outside what the suite can prove.

## How to check a decision yourself

Each decision returns a refusal or an execution record. You can check a refusal without an API key:

    POST /refusal/verify

Retrieve a stored refusal by its business transaction ID:

    GET /refusal/{businessTransactionId}

The verifier that checks a record offline is described in [Evidence verification](../security/evidence-verification.md).
