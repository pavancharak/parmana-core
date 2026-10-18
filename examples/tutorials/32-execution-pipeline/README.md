# Tutorial 32 — Execution Pipeline

## Overview

So far we've explored individual parts of Parmana:

- Policy Evaluation
- Execution Authorization
- Verification
- Receipt Generation

This tutorial demonstrates how those components work together as a single execution pipeline.

The runtime built by `RuntimeBuilder` runs a Business Transaction through every stage and
produces a signed Execution Trust Record.

---

## Pipeline

```text
Business Transaction
        │
        ▼
Policy decision and signed approval check
        │
        ▼
Signed Execution Authorization
        │
        ▼
Gateway release (Execution)
        │
        ▼
Signed Execution Trust Record
```

Unlike previous tutorials that focused on individual components, this tutorial demonstrates the complete orchestration.

---

## Building the Runtime

```ts
const runtime = new RuntimeBuilder()
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .withPolicyRepository(new FilePolicyRepository("policies"))
  .build(new MemoryExecutionTrustRecordRepository());
```

The builder assembles the runtime pipeline. The signal state verifier checks the signed human
approval the vendor-payment policy requires; `withDemoApproval` attaches one from a demo
approver.

---

## Executing the Pipeline

```ts
const { context, trustRecord } = await runtime.execute(
  await withDemoApproval(transaction),
);
```

The runtime performs these stages:

1. Evaluate the policy and verify the signed approval (`context.decision`).
2. Sign an Execution Authorization (`context.authorization`).
3. Release the action through the gateway (`context.execution`).
4. Build, sign and store the Execution Trust Record (`trustRecord`).

---

## Expected Output

```text
Runtime Pipeline
------------------------------
Decision          : ✓
Authorization     : ✓
Execution         : ✓
Trust Record      : ✓
Signed            : ✓

Pipeline completed successfully.

Tutorial completed successfully.
```

---

## Why This Matters

Enterprise systems require more than successful execution.

They require evidence that:

- the request was accepted,
- policy evaluation succeeded,
- execution completed,
- verification succeeded,
- a receipt was generated,
- the complete lifecycle can be audited.

The Execution Trust Application automates this orchestration.

---

## Running the Example

```bash
tsx examples/tutorials/32-execution-pipeline/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 33 — Execution Boundary**

The next tutorial demonstrates how Parmana becomes the trusted boundary between AI systems and enterprise systems, ensuring only verified and authorized execution requests cross into business applications.

---

## Summary

In this tutorial you learned:

- The Execution Trust Application orchestrates the complete execution lifecycle.
- Multiple runtime components work together as a single pipeline.
- A completed Execution Trust Record contains immutable evidence of execution.
- The pipeline prepares verified requests before they cross the enterprise execution boundary.
