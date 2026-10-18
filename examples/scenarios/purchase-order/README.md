# Scenario — Purchase Order

## Overview

This scenario demonstrates an enterprise Purchase Order approval workflow using Parmana.

A requester submits a Purchase Order, an authorized procurement manager approves it, Parmana evaluates the Purchase Order Policy, executes the transaction, verifies the resulting Execution Trust Record, and generates a Receipt.

This scenario represents a common enterprise procurement workflow.

---

## Business Flow

Purchase Request

↓

Procurement Review

↓

Human Approval

↓

Policy Evaluation

↓

Runtime Execution

↓

Execution Trust Record

↓

Verification

↓

Receipt Generation

---

## Files

| File               | Purpose                             |
| ------------------ | ----------------------------------- |
| `policy.json`      | Purchase Order Policy Reference     |
| `transaction.json` | Purchase Order Business Transaction |
| `run.ts`           | Executes the complete workflow      |

---

## Architecture

```
Purchase Request
  │
  ▼
Authority
  │
  ▼
Authorization
  │
  ▼
Intent
  │
  ▼
Policy Evaluation
  │
  ▼
Runtime
  │
  ▼
Execution Trust Record
  │
  ▼
Verification
  │
  ▼
Receipt
```

---

## Run

```bash
npm run example -- purchase-order
```

or

```bash
tsx run.ts
```

---

## Expected Output

The scenario prints:

- Business Transaction
- Policy
- Decision
- Execution Trust Record
- Verification
- Receipt
