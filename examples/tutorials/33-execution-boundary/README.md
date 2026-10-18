# Tutorial 33 — Execution Boundary

## Overview

Parmana governs **authorization**, not enterprise execution.

Its responsibility ends after producing a valid **Execution Authorization**.

The enterprise system begins execution only after receiving that authorization.

This separation is called the **Execution Boundary**.

---

## Architecture

```text
AI Agent
    │
    ▼
Parmana Runtime
    │
    ▼
Policy Evaluation
    │
    ▼
Execution Authorization
    │
==============================
      EXECUTION BOUNDARY
==============================
    │
    ▼
Enterprise Execution System
    │
    ▼
SAP / Oracle / Workday / Stripe
```

---

## Why the Boundary Exists

Parmana intentionally does **not**:

- connect directly to SAP
- release payments
- create vendors
- update ERP records
- own enterprise credentials

Instead Parmana produces an immutable **Execution Authorization** proving that execution has been approved.

The enterprise execution system decides whether to execute the request.

---

## Runtime Responsibilities

The Runtime:

- evaluates policy
- creates a Decision
- generates an Execution Authorization
- records execution evidence
- produces an Execution Trust Record

After that, Parmana's work is complete.

---

## Enterprise Responsibilities

The enterprise system:

- receives the Execution Authorization
- validates it
- executes the approved action
- returns execution evidence

Execution itself belongs to the enterprise system, not Parmana.

---

## Example Output

```text
==================================================
Tutorial 33 - Execution Boundary
==================================================
Executing Business Transaction...
Execution Boundary
\--------------------------------------------------
AI proposes the action.
✓ Policy evaluated.
✓ Execution authorized.
✓ Execution request created.
============== Execution Boundary ==============
Everything above is governed by Parmana.
Everything below belongs to the enterprise execution system.
Enterprise Execution
\--------------------------------------------------
ERP / Payment System / CRM / Database
executes only after receiving
a valid Execution Authorization.
Authorization
Authorization ID : ...
Policy           : vendor-payment@2.1.0
Decision         : ...
Transaction      : ...
Execution Boundary Summary
\--------------------------------------------------
• Parmana authorizes execution.
• Parmana never executes enterprise actions.
• Enterprise systems execute only authorized requests.
Tutorial completed successfully.
```

---

## Key Principle

Parmana is **not** an ERP.

Parmana is **not** an API gateway.

Parmana is **not** an AI agent.

Parmana is the **Execution Authorization Layer** that sits between AI and enterprise systems.

---

## Execution Flow

```text
AI proposes
      │
      ▼
Parmana evaluates policy
      │
      ▼
Execution Authorization
      │
==============================
      EXECUTION BOUNDARY
==============================
      │
      ▼
Enterprise System
      │
      ▼
Business Action
```

---

## Summary

In this tutorial you learned:

- Parmana governs execution authorization.
- Parmana does not perform enterprise actions.
- Enterprise systems execute only after receiving authorization.
- The Execution Boundary separates governance from execution.
