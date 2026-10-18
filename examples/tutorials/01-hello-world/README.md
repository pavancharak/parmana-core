# Tutorial 01 — Hello World

## Overview

This tutorial introduces the canonical Parmana `BusinessTransaction`.

It demonstrates the minimum structure required to represent a business transaction before any policy evaluation or runtime execution occurs.

No policies are evaluated and no decisions are made in this tutorial.

---

## Learning Objectives

After completing this tutorial you will understand:

- The structure of a Business Transaction
- Authority
- Authorization
- Intent
- Policy Reference
- Signals
- Metadata

---

## Files

| File               | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `transaction.json` | Canonical Business Transaction           |
| `policy.json`      | Policy reference used by the transaction |
| `run.ts`           | Loads and prints the transaction         |

---

## Architecture

```
Business Transaction
  │
  ├── Metadata
  ├── Authority
  ├── Authorization
  ├── Intent
  ├── Policy Reference
  └── Signals
```

---

## Run

```bash
npm run example -- 01-hello-world
```

or

```bash
tsx run.ts
```

---

## Expected Output

The tutorial prints the complete Business Transaction as formatted JSON.

No policy evaluation occurs.

No runtime execution occurs.

No Trust Record is generated.

---

## Next Tutorial

Continue to **Tutorial 02 – Policy Evaluation** to evaluate the transaction against a reference policy.
