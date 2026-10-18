# Tutorial 22 — Idempotent Execution

## Overview

This tutorial demonstrates retrying the same Business Transaction multiple times.

In distributed systems, retries are common because of:

- Network failures
- Client timeouts
- Process restarts
- Queue redelivery
- Infrastructure failures

An execution platform must be able to handle retries safely.

This tutorial shows what happens when the same Business Transaction is submitted repeatedly.

---

## Retry Flow

```
Business Transaction
        │
        ▼
Runtime
        │
        ▼
Execution
Retry
        │
        ▼
Same Business Transaction
Retry
        │
        ▼
Same Business Transaction
```

The same Business Transaction is executed three times using the same `businessTransactionId`.

---

## Building the Runtime

```ts
const runtime = new RuntimeBuilder()
  .withPolicyRepository(new FilePolicyRepository("policies"))
  .build(repository);
```

The Runtime is created once and reused for every execution attempt.

---

## Executing Retries

```ts
await runtime.execute(transaction);
await runtime.execute(transaction);
await runtime.execute(transaction);
```

Each retry uses exactly the same Business Transaction.

---

## Expected Output

```text
==================================================
Tutorial 22 - Idempotent Execution
==================================================
First execution...
✓ APPROVED
Retry #1...
✓ Retry completed.
Retry #2...
✓ Retry completed.
==================================================
Summary
==================================================
Original Executions : 1
Retries             : 2
Tutorial completed successfully.
```

The exact runtime behaviour depends on the configured repository and Runtime implementation.

---

## Why Idempotency Matters

Enterprise systems frequently retry requests automatically.

Typical examples include:

- Payment processing
- Invoice approval
- Purchase order creation
- Vendor onboarding
- ERP integrations

Without idempotency, retries could unintentionally execute the same business action multiple times.

---

## Current Tutorial Scope

This tutorial demonstrates retry behaviour using the existing Parmana Runtime.

It intentionally does **not** introduce any new Runtime APIs or idempotency mechanisms.

Future versions of Parmana may provide first-class idempotency support while preserving the same Runtime programming model.

---

## Running the Example

```bash
tsx examples/tutorials/22-idempotent-execution/run.ts
```

or

```bash
npm run examples
```

---

## Summary

In this tutorial you learned how to:

- Reuse a Runtime instance
- Retry the same Business Transaction
- Observe Runtime behaviour across repeated executions
- Understand why idempotency is important in enterprise execution systems

Idempotent execution is a foundational concept for building reliable, fault-tolerant enterprise applications.
