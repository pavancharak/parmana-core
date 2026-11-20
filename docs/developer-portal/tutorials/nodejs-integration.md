# Tutorial: integrate Parmana into a Node.js service

[Tutorials](README.md) · [TypeScript SDK](../sdk/typescript.md) · [Python integration](python-integration.md)

**Goal.** Your Node.js service calls a business system (here, a payment-like action). Before the call runs, Parmana checks the policy and a signed human approval. Afterward, your service holds signed evidence of what was authorized and what ran.

**Verification.** Run against a local server from this repository. [`governed-flow.ts`](../examples/governed-quickstart/typescript/governed-flow.ts) and [`declare-then-execute.ts`](../examples/governed-quickstart/typescript/declare-then-execute.ts) both passed. Their output is in [Getting started](../getting-started.md).

## Who does what

| Party                       | Does                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Your service**            | Builds the Business Transaction from the request. Asks for an approval when the policy needs one. Calls Parmana. Calls the business system only when Parmana approves. Stores the record.       |
| **The approver** (a person) | Reviews the request outside Parmana and signs an approval with their own key, on their own machine.                                                                                             |
| **`@parmana/sdk`**          | Builds the request, checks the endpoint is `https`, sends the caller's key, decodes the response, and raises a typed error for each refusal. It does not decide anything.                       |
| **The Parmana service**     | Authenticates the caller, checks the request, loads the policy version in effect, verifies the approval, decides, releases through the gateway to a connector, and writes and signs the record. |
| **The business system**     | Performs the action when the connector calls it. It should accept calls only from Parmana's connector.                                                                                          |

## Step 1: install and configure

```bash
npm install @parmana/sdk@4.1.1
```

Configure the client from the environment. The endpoint must be `https://` except on your own machine.

```typescript
// parmana.ts
import { ParmanaClient } from "@parmana/sdk";

export const parmana = new ParmanaClient({
  endpoint: process.env.PARMANA_ENDPOINT ?? "http://localhost:3000",
  apiKey: process.env.PARMANA_API_KEY,
});
```

The caller key is issued to your service. Its allowed capabilities and principals are set by the operator (see [Environment variables](../reference/environment-variables.md) for `PARMANA_API_KEYS`). Check them at start-up:

```typescript
const me = await parmana.caller();
if (!me.allowedCapabilities.includes("test:fixture-execute")) {
  throw new Error(
    `this key may not invoke test:fixture-execute; allowed: ${me.allowedCapabilities}`,
  );
}
```

## Step 2: build the Business Transaction

Use the builder. It keeps the ids consistent. The signal names are the ones the policy reads; each policy declares its own (see [Policy management](../policies/README.md)).

```typescript
import { randomUUID } from "node:crypto";
import { createBusinessTransaction } from "@parmana/sdk";

export function buildTransaction(
  order: { id: string; vendorId: string; amount: number; riskScore: number },
  approval: unknown,
) {
  return createBusinessTransaction({
    businessTransactionId: randomUUID(), // single-use: a new id for each new action
    principalId: "ap-automation-svc", // the principal this action is for
    purpose: `Pay vendor for order ${order.id}`,
    action: "test:fixture-execute", // a capability your key is allowed to invoke
    target: order.vendorId, // what the action acts on
    parameters: { amount: order.amount, currency: "USD" },
    policy: {
      name: "vendor-payment",
      version: "2.1.0",
      schemaVersion: "1.0.0",
    },
    signals: {
      humanApproved: approval !== undefined,
      ...(approval !== undefined && { approvalArtifact: approval }),
      vendorVerified: true, // declared by the caller in this policy: a condition, not a fact Parmana verifies
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: order.amount, // bound: must equal parameters.amount
      riskScore: order.riskScore,
      vendorId: order.vendorId, // bound: must equal target
    },
    correlationId: order.id,
    sourceSystem: "order-service",
  });
}
```

**Read what your policy actually verifies.** In the `vendor-payment` policy used here, `vendorVerified`, `invoiceVerified`, `paymentApproved` and `sufficientFunds` are declared by the caller. The policy has no signal source for them, so Parmana does not confirm them. They are conditions the approve rule reads, and the policy's decision rests on the signed human approval. If your organization needs Parmana to confirm vendor verification, the policy must bind that fact to a registered source. That is a decision for the policy's owner, made in the policy file and approved through maker-checker. See [Policy management](../policies/README.md#signals).

## Step 3: ask a human, then attach the approval

A policy whose approve rule needs a human approval cannot be satisfied by your service alone. Ask the approver through your own workflow, for example a review queue. The approver signs on their machine:

```typescript
// Runs on the approver's machine, or in the approver's own tool. Never in the service.
import { readFileSync } from "node:fs";
import { signApproval } from "@parmana/sdk";

const approval = signApproval({
  privateKeyPem: readFileSync("approver.private.pem", "utf8"),
  approverId: "finance-approver-1",
  keyId: "finance-approver-key-1",
  capability: "test:fixture-execute",
  resourceId: "vendor://payments", // the target this approval covers
  maxAmount: 1000, // the largest amount this approval covers
  ttlSeconds: 900,
});
// The approver returns the JSON of `approval` to your service through the workflow.
```

Your service receives the approval as data and attaches it. It never holds the approver's private key.

## Step 4: execute, and handle each outcome

The one-call form (`execute`) decides and releases in one request. Use [declare then execute](../getting-started.md#6-submit-a-business-transaction) when you need to record the request first.

```typescript
import {
  ConflictError,
  ExecutionPendingError,
  ExecutionRejectedError,
  ParmanaError,
} from "@parmana/sdk";

export async function authorizeAndRun(
  transaction: ReturnType<typeof buildTransaction>,
) {
  try {
    const record = await parmana.execute(transaction);
    // Approved and released. Store the record: it is your evidence.
    return { status: "approved" as const, record };
  } catch (error) {
    if (error instanceof ExecutionRejectedError) {
      // Policy refused. Show the reason. Do not retry this transaction.
      return { status: "refused" as const, reason: error.message };
    }
    if (error instanceof ConflictError) {
      // The id was used. Read the outcome that already exists.
      const existing = await parmana.trustRecord(
        transaction.businessTransactionId,
      );
      return { status: "already-recorded" as const, record: existing };
    }
    if (error instanceof ExecutionPendingError) {
      // Released; the status is not yet final. Reconcile. Do not resubmit.
      await parmana.reconcileTransaction(transaction.businessTransactionId);
      return { status: "reconciling" as const };
    }
    if (error instanceof ParmanaError) {
      // Other failures: rate limit, unavailable, or an outcome that may be unknown.
      // Read the status before doing anything else.
      const status = await parmana.transactionStatus(
        transaction.businessTransactionId,
      );
      return {
        status: "unknown" as const,
        current: status.current.status,
        error: error.message,
      };
    }
    throw error;
  }
}
```

Verified outcomes on this build: `200` for an approved request, `403` (`ExecutionRejectedError`) for the three limit cases, `409` (`ConflictError`) for a repeated id. The `202`, `500` and `502` branches were described from the OpenAPI document and the SDK source; they were not triggered in this verification.

## Step 5: verify the evidence

```typescript
import { verifyExecutionTrustRecordOffline } from "@parmana/sdk";

const published = await parmana.publicKey("default");
const check = verifyExecutionTrustRecordOffline(record, {
  default: published.pem,
});
if (!check.valid)
  throw new Error(`record did not verify: ${check.errors.join("; ")}`);
console.log("coverage:", check.coverage); // "legacy" on this build: see Evidence verification
```

Store the record and the verification result together. An auditor can repeat the check later with the pinned key. [Evidence verification](../security/evidence-verification.md) explains coverage and pinning.

## What happens in the business application

1. Your service asks the approver, gets the approval, and builds the transaction.
2. Parmana approves. The connector calls the payment system. The payment system performs the action.
3. Your service receives the record. Only now does it mark the order paid, using the record's `trustRecordId` as the reference.
4. If Parmana refuses, nothing reached the payment system. Your service shows the refusal and leaves the order unpaid.

The business system never has to know about Parmana, provided it accepts calls only from the connector. If it accepts calls from anywhere, an agent can still bypass Parmana with its own credentials.

## Run it

```bash
# From the repository root, with the server running:
npx tsx docs/developer-portal/examples/governed-quickstart/typescript/governed-flow.ts
npx tsx docs/developer-portal/examples/governed-quickstart/typescript/declare-then-execute.ts
```

## Production checklist

- Use `https://` and a caller key issued for this service only. Restrict its `allowedCapabilities` and `allowedPrincipalIds`.
- Keep approver keys with the approvers. Register approver public keys through approval-issuer governance.
- Do not enable the test approver (`PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE`) outside `NODE_ENV=test`. The server refuses to start if you do.
- Keep the connector's business call behind Parmana's gateway. Do not give the service direct credentials for the payment system.
- Store the record with the order. Verify it when you need proof.
