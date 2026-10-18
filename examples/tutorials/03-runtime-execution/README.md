# Tutorial 03 — Runtime Execution

## Overview

This tutorial executes a complete Business Transaction using the Parmana Runtime.

The Runtime loads the referenced policy, evaluates it, creates a decision, and produces an Execution Trust Record.

Unlike Tutorial 02, this tutorial executes the full Runtime.

Verification and Receipt Generation are covered in later tutorials.

---

## Learning Objectives

After completing this tutorial you will understand:

- RuntimeBuilder
- Runtime
- Policy Repository
- Runtime Execution
- Execution Trust Record

---

## Files

| File               | Purpose              |
| ------------------ | -------------------- |
| `transaction.json` | Business Transaction |
| `run.ts`           | Executes the Runtime |

---

## Architecture

```
Business Transaction
  │
  ▼
Runtime
  │
  ▼
Policy Router
  │
  ▼
Policy Engine
  │
  ▼
Decision
  │
  ▼
Execution Trust Record
```

---

## Run

```bash
npm run example -- 03-runtime-execution
```

or

```bash
tsx run.ts
```

---

## Expected Output

The tutorial prints:

- Business Transaction
- Runtime Decision
- Execution Trust Record

Verification and Receipt Generation are demonstrated in later tutorials.

---

## Next Tutorial

Continue to **Tutorial 04 – Policy Router**.
