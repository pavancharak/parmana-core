# Tutorial 07 — Receipt Generation

## Overview

This tutorial demonstrates how Parmana generates a cryptographically verifiable Receipt after successful execution and verification.

A Receipt is the final artifact produced by the Parmana execution lifecycle. It serves as immutable proof that a Business Transaction was executed according to the approved policy and successfully verified.

---

## Learning Objectives

After completing this tutorial you will understand:

- Receipt Generation
- Receipt Service
- Verified Execution
- Cryptographic Receipt
- Audit Evidence

---

## Files

| File     | Purpose                                            |
| -------- | -------------------------------------------------- |
| `run.ts` | Generates a Receipt from an Execution Trust Record |

---

## Architecture

```
Business Transaction
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
Receipt Service
        │
        ▼
Receipt
```

---

## Run

```bash
npm run example -- 07-receipt-generation
```

or

```bash
tsx run.ts
```

---

## Expected Output

The tutorial prints:

- Execution Trust Record
- Verification Result
- Receipt

---

## Next Tutorial

Continue to **Tutorial 08 – Human Approval**.
