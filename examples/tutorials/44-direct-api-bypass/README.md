# Tutorial 44 — Direct API Bypass

## Overview

This tutorial demonstrates one of Parmana's most important security guarantees:

**Enterprise systems should never accept sensitive requests directly from AI agents.**

Instead, every protected operation must pass through the Parmana Execution Gateway.

If a request does not include a valid Execution Authorization, execution stops immediately.

---

## Architecture

```text
AI Agent
    │
    ▼
Enterprise API
✗ Direct Call
Rejected
────────────────────────────
AI Agent
    │
    ▼
Parmana
Execution Gateway
    │
    ▼
Execution Authorization
Verified
    │
    ▼
Enterprise API
✓ Accepted
```

---

## Attack Scenario

An attacker (or buggy AI agent) attempts to invoke a protected enterprise API directly.

```text
POST /payments
Authorization
None
↓
Execution Gateway
↓
✗ Missing Execution Authorization
↓
Rejected
```

---

## Legitimate Flow

```text
Business Transaction
↓
Policy Evaluation
↓
Execution Authorization
↓
Gateway Verification
↓
Enterprise Execution
```

Every execution request must carry a valid Execution Authorization.

---

## Expected Output

```text
==================================================
Tutorial 44 - Direct API Bypass
==================================================
Legitimate Request
\--------------------------------------------------
✓ Execution Authorization present.
Direct API Call
\--------------------------------------------------
✗ No Execution Authorization supplied.
Gateway rejected the request.
Reason:
Sensitive APIs only accept requests
that carry a valid Execution Authorization.
Tutorial completed successfully.
```

---

## Why This Matters

Without an execution boundary, an AI agent could invoke enterprise APIs directly.

Examples include:

- ERP APIs
- Banking APIs
- Payment APIs
- HR Systems
- Procurement Systems

Parmana ensures that every protected action is authorized before execution.

---

## Security Principle

```text
No Authorization
↓
No Execution
```

This is the most fundamental invariant of pre-execution authorization.

---

## Running the Example

```bash
tsx examples/tutorials/44-direct-api-bypass/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 45 — Connector Bypass**

The next tutorial demonstrates that even if an enterprise connector is compromised, it still cannot perform sensitive actions without passing through Parmana's Execution Gateway.

---

## Summary

In this tutorial you learned:

- Enterprise APIs should never be invoked directly.
- Every protected request must carry an Execution Authorization.
- The Execution Gateway enforces this boundary.
- Requests without authorization are rejected before reaching enterprise systems.
