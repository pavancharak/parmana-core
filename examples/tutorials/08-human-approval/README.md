# Tutorial 08 — Human Approval

## Overview

This tutorial demonstrates how Parmana enforces Human Authority before executing a Business Transaction.

Before a transaction can be evaluated against policy, it must contain valid Authority, Authorization, and Intent information. These records establish who authorized the action, why it was authorized, and what action is permitted.

This tutorial focuses on the authorization chain rather than policy evaluation.

---

## Learning Objectives

After completing this tutorial you will understand:

- Authority
- Authorization
- Intent
- Human Authority
- Execution Preconditions

---

## Files

| File               | Purpose                                                       |
| ------------------ | ------------------------------------------------------------- |
| `transaction.json` | Business Transaction with Authority, Authorization and Intent |
| `run.ts`           | Validates and displays the authorization chain                |

---

## Architecture

```
Authority
  │
  ▼
Authorization
  │
  ▼
Intent
  │
  ▼
Business Transaction
  │
  ▼
Ready for Runtime Execution
```

---

## Run

```bash
npm run example -- 08-human-approval
```

or

```bash
tsx run.ts
```

---

## Expected Output

The tutorial prints:

- Authority
- Authorization
- Intent
- Business Transaction

No policy evaluation occurs.

No Runtime execution occurs.

---

## Next Tutorial

Continue to **Tutorial 09 – REST API**.
