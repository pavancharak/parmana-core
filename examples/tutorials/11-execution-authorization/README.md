# Tutorial 11 — Execution Authorization

## Objective

This tutorial demonstrates how Parmana issues a cryptographically signed

Execution Authorization after a Business Transaction has been approved.

The Execution Authorization proves that Parmana authorized a specific

execution request. It is intended to be verified by downstream execution

systems before any business action is performed.

---

## What You Will Learn

- How an approved Decision produces an Execution Authorization.
- What information is included in the authorization.
- How the authorization is cryptographically signed.
- How the authorization is attached to an Execution Request.
- Why nonce and expiration protect against replay attacks.

---

## Execution Flow

```
Business Transaction
        │
        ▼
Policy Evaluation
        │
        ▼
Decision (APPROVED)
        │
        ▼
Execution Authorization
        │
        ▼
Execution Request
```

---

## Authorization Contents

A Signed Execution Authorization contains:

- Authorization ID
- Decision ID
- Business Transaction ID
- Policy Name
- Policy Version
- Single-use Nonce
- Authorized Time
- Expiration Time
- Signature
- Signature Algorithm
- Key Identifier

---

## Run

```bash
npx tsx examples/tutorials/11-execution-authorization/run.ts
```

---

## Expected Result

The tutorial executes an approved Business Transaction and prints the

generated Signed Execution Authorization, demonstrating the information

that downstream execution systems use to verify Parmana's approval before

performing any business action.
