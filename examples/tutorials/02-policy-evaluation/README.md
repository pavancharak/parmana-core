# Tutorial 02 — Policy Evaluation

## Overview

This tutorial demonstrates how Parmana evaluates business signals against a reference policy.

Unlike Tutorial 01, this tutorial executes the Policy Engine and produces a policy decision.

No Runtime execution occurs.

No Trust Record is generated.

---

## Learning Objectives

After completing this tutorial you will understand:

- Reference Policies
- Policy Engine
- Structured Conditions
- Signals
- Policy Decisions
- Decision Reasons

---

## Files

| File           | Purpose                    |
| -------------- | -------------------------- |
| `policy.json`  | Reference Policy           |
| `signals.json` | Runtime Signals            |
| `run.ts`       | Executes the Policy Engine |

---

## Architecture

```
Signals
  │
  ▼
Policy Engine
  │
  ▼
Evaluate Rules
  │
  ▼
Decision
```

---

## Run

```bash
npm run example -- 02-policy-evaluation
```

or

```bash
tsx run.ts
```

---

## Expected Output

The tutorial prints:

- Signals
- Policy Decision
- Decision Reason

No Runtime execution occurs.

No Trust Record is generated.

---

## Next Tutorial

Continue to **Tutorial 03 – Runtime Execution** to execute a complete Business Transaction.
