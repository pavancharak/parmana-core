# Tutorial 20 — Batch Execution

## Overview

This tutorial demonstrates how to execute multiple Business Transactions using a single Parmana Runtime instance.

Rather than creating a new Runtime for every transaction, the Runtime is initialized once and reused to process a batch of transactions sequentially.

This approach is suitable for:

- Scheduled payment processing
- Invoice processing
- Purchase order approvals
- Payroll execution
- Financial reconciliation
- Any workload involving multiple independent Business Transactions

---

## Batch Execution

```
                Runtime
                   │
                   ▼
┌─────────────────────────────────┐
│ Transaction 1                   │
│        │                        │
│        ▼                        │
│ Execution Trust Record          │
├─────────────────────────────────┤
│ Transaction 2                   │
│        │                        │
│        ▼                        │
│ Execution Trust Record          │
├─────────────────────────────────┤
│ Transaction 3                   │
│        │                        │
│        ▼                        │
│ Execution Trust Record          │
└─────────────────────────────────┘
                   │
                   ▼
             Batch Summary
```

Each transaction is evaluated independently.

A failure in one transaction does not prevent the remaining transactions from executing.

---

## Building the Runtime

The Runtime is created once and reused throughout the batch.

```ts
const runtime = new RuntimeBuilder()
  .withPolicyRepository(new FilePolicyRepository("policies"))
  .build(repository);
```

---

## Processing the Batch

```ts
for (const transaction of transactions) {
  await runtime.execute(transaction);
}
```

Each Business Transaction produces its own:

- Decision
- Execution
- Execution Trust Record

---

## Error Handling

Each transaction is executed inside its own `try/catch` block.

```ts
try {
  await runtime.execute(transaction);
} catch (error) {
  // Continue processing
}
```

This allows the batch to complete even when one or more transactions fail.

---

## Expected Output

```text
==================================================
Tutorial 20 - Batch Execution
==================================================
Processing transaction 1...
✓ APPROVED
Processing transaction 2...
✓ APPROVED
Processing transaction 3...
✗ REJECTED
==================================================
Batch Summary
==================================================
Total Transactions : 3
Successful         : 2
Failed             : 1
Tutorial completed successfully.
```

---

## Design Principles

Each Business Transaction remains completely independent.

Every transaction has its own:

- Decision
- Execution
- Authorization
- Execution Trust Record
- Verification
- Receipt

Batch execution is simply an orchestration pattern that reuses a Runtime instance efficiently. It does not merge or combine transaction state.

---

## Running the Example

```bash
tsx examples/tutorials/20-batch-execution/run.ts
```

or

```bash
npm run examples
```

---

## Summary

In this tutorial you learned how to:

- Reuse a single Runtime instance
- Execute multiple Business Transactions
- Handle successes and failures independently
- Produce a summary of batch execution results

This pattern is commonly used for scheduled jobs, financial processing, and enterprise workloads where many independent transactions must be governed consistently through the same Runtime.
