# Tutorial 45 — Connector Bypass

## Overview

Enterprise connectors simplify communication with external business systems.

However, **connectors are not trusted security boundaries**.

A connector must never be able to execute sensitive operations simply because it has network access to an enterprise system.

Parmana requires every connector request to carry a valid Execution Authorization.

---

## Architecture

```text
AI Agent
    │
    ▼
Connector
    │
    ▼
Execution Gateway
    │
    ▼
Enterprise System
```

The connector forwards requests.

The Execution Gateway decides whether execution is permitted.

---

## Attack Scenario

A compromised connector attempts to call the enterprise system directly.

```text
Compromised Connector
        │
Calls ERP API
        │
        ▼
No Execution Authorization
        │
        ▼
Execution Gateway
        │
        ▼
✗ Authorization Missing
        │
        ▼
Execution Rejected
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
Connector
↓
Execution Gateway
↓
Enterprise Execution
```

The connector never authorizes execution.

It only transports an already-authorized request.

---

## Expected Output

```text
==================================================
Tutorial 45 - Connector Bypass
==================================================
Trusted Connector
\--------------------------------------------------
✓ Valid Execution Authorization present.
Compromised Connector
\--------------------------------------------------
✗ Connector omitted Execution Authorization.
Gateway rejected the request.
Reason:
Connectors cannot bypass pre-execution authorization.
Tutorial completed successfully.
```

---

## Why This Matters

Enterprise environments often contain many connectors:

- SAP Connectors
- Oracle Connectors
- Salesforce Connectors
- Workday Connectors
- Custom REST Integrations

If one connector is compromised, it must not become a path around governance.

---

## Security Principle

```text
Connector
≠
Trust Boundary
```

The Execution Gateway—not the connector—is the enforcement point.

---

## Running the Example

```bash
tsx examples/tutorials/45-connector-bypass/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 46 — TOCTOU Protection**

The final tutorial demonstrates how Parmana protects against Time-of-Check to Time-of-Use attacks by re-verifying the executable content immediately before execution.

---

## Summary

In this tutorial you learned:

- Connectors are transport mechanisms, not security boundaries.
- Every connector request must carry a valid Execution Authorization.
- The Execution Gateway independently verifies every request.
- A compromised connector cannot bypass pre-execution authorization.
