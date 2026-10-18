# Tutorial 46 — TOCTOU Protection

## Overview

Time-of-Check to Time-of-Use (TOCTOU) is one of the most important security problems in distributed systems.

A request may be approved correctly, but modified before it is actually executed.

Parmana prevents this by verifying the executable content immediately before enterprise execution.

---

## The TOCTOU Problem

```text
Business Transaction
        │
        ▼
Policy Evaluation
        │
        ▼
Execution Authorization
        │
        ▼
────────────── Time Passes ──────────────
        │
Request Modified
        │
        ▼
Execution Gateway
        │
        ▼
Executable Content Rebuilt
        │
        ▼
Hash Recomputed
        │
        ▼
Compare
        │
        ▼
✗ Hash Mismatch
        │
        ▼
Execution Rejected
```

---

## Why This Matters

Approving a request is not enough.

The system must also verify that **the request being executed is still the request that was approved**.

Without this verification an attacker could modify:

- payment amount
- destination account
- vendor
- purchase order
- contract
- invoice
- execution target

after authorization but before execution.

---

## Expected Output

```text
==================================================
Tutorial 46 - TOCTOU Protection
==================================================
✓ Policy evaluated.
✓ Execution Authorization generated.
Execution Gateway
\--------------------------------------------------
Authorized Hash : 4b7761f6...
Current Hash    : a91d87...
✓ TOCTOU attack detected.
Execution rejected before reaching the enterprise system.
Execution Authorization Summary
\--------------------------------------------------
✓ Policy Evaluation
✓ Execution Authorization
✓ Authorization Binding
✓ Executable Content Verification
✓ Execution Gateway Protection
✓ Enterprise Execution Prevented
Parmana verifies what is about to execute,
not merely what was previously approved.
Tutorial completed successfully.
```

---

## How Parmana Prevents TOCTOU

Immediately before execution the gateway:

1. Reads the incoming request.
2. Rebuilds the executable content.
3. Recomputes the executable content hash.
4. Compares it with the signed hash inside the Execution Authorization.
5. Rejects execution if they differ.

This verification occurs **at execution time**, not only at decision time.

---

## Complete Execution Authorization Pipeline

```text
Business Transaction
        │
        ▼
Policy Evaluation
        │
        ▼
Decision
        │
        ▼
Execution Authorization
        │
        ▼
Signature
        │
        ▼
Expiration Check
        │
        ▼
Replay Protection
        │
        ▼
Authorization Binding
        │
        ▼
Executable Content Verification
        │
        ▼
Execution Gateway
        │
        ▼
Enterprise System
```

Every layer must succeed before execution proceeds.

---

## What This Tutorial Brings Together

This final tutorial demonstrates nearly every major capability of Parmana:

- Deterministic policy evaluation
- Execution Authorization
- Cryptographic signatures
- Policy binding
- Authorization binding
- Executable content hashing
- Replay protection
- Execution Gateway enforcement
- Enterprise execution boundary
- TOCTOU protection

---

## Running the Example

```bash
tsx examples/tutorials/46-toctou-protection/run.ts
```

or

```bash
npm run examples
```

---

## Series Complete

You have completed the execution authorization tutorial series.

Across 46 tutorials you built a complete understanding of how Parmana ensures that AI-driven execution is:

- authorized
- authenticated
- policy-bound
- replay-resistant
- tamper-resistant
- time-valid
- execution-bound
- cryptographically verifiable

The fundamental principle is:

> **Parmana verifies what is about to execute—not merely what was previously approved.**
