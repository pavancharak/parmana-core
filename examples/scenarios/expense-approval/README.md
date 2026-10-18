# Scenario — Expense Approval

## Overview

This scenario demonstrates an employee expense reimbursement workflow using Parmana.

An employee submits an expense report, a manager authorizes reimbursement, Parmana evaluates the Expense Approval Policy, executes the transaction, verifies the resulting Execution Trust Record, and generates a Receipt.

This scenario represents a common enterprise finance workflow.

---

## Business Flow

Employee submits expense

↓

Manager reviews request

↓

Human authority approves reimbursement

↓

Parmana evaluates policy

↓

Runtime executes transaction

↓

Execution Trust Record created

↓

Verification

↓

Receipt generated

---

## Files

| File               | Purpose                               |
| ------------------ | ------------------------------------- |
| `policy.json`      | Expense Approval Policy Reference     |
| `transaction.json` | Expense Approval Business Transaction |
| `run.ts`           | Executes the complete workflow        |

---

## Architecture

```
Expense Report
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
npm run example -- expense-approval
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
