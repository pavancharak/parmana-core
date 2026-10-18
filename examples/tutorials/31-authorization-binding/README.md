# Tutorial 31 — Authorization Binding

## Overview

In previous tutorials we verified that an Execution Authorization was:

- correctly signed
- not expired
- not replayed

This tutorial demonstrates another critical security property:

> **An Execution Authorization is cryptographically bound to the exact executable request that Parmana approved.**

A valid authorization cannot be reused for another payment, invoice, vendor, or business transaction.

---

## Execution Flow

```text
Business Transaction
        │
        ▼
Executable Content
        │
        ▼
ExecutableContentHasher
        │
        ▼
businessTransactionHash
        │
        ▼
Execution Authorization
        │
        ▼
Enterprise Execution
        │
        ▼
Recompute Hash
        │
        ▼
Match?
        │
      ┌─┴────────────┐
      │              │
     YES            NO
      │              │
      ▼              ▼
 Execute      Reject Execution
```

---

## Why Authorization Binding Exists

Suppose Parmana approved:

```text
Vendor A
Invoice INV-1001
Amount $25,000
```

An attacker must never be able to reuse that authorization for:

```text
Vendor A
Invoice INV-1001
Amount $50,000
```

Although the authorization itself is genuine, it is bound to the original executable content.

Changing any execution parameter changes the executable content hash.

---

## Executable Content

The Runtime computes a deterministic hash of the executable request.

```ts
const hash = await hasher.hash(executableContent);
```

That hash is embedded inside the signed Execution Authorization.

---

## Verification

Before execution, the enterprise system recomputes the executable content hash.

```ts
const computedHash = await hasher.hash(modifiedContent);
```

It compares that value against:

```ts
authorization.payload.businessTransactionHash;
```

If the hashes differ, execution is rejected.

---

## Expected Output

```text
==================================================
Tutorial 31 - Authorization Binding
==================================================
Generating authorization...
✓ Authorization generated.
✓ Authorization verified.
Execution Binding Check
\------------------------------
Authorization Hash : ...
Execution Hash     : ...
✓ Execution rejected.
Reason: Authorization is bound to a different executable request.
Tutorial completed successfully.
```

---

## Security Guarantees

Authorization Binding prevents:

- payment amount substitution
- invoice substitution
- vendor substitution
- target system substitution
- parameter manipulation

The authorization can only be used for the executable content originally approved by Parmana.

---

## Cryptographic Layers

Execution security now consists of multiple independent checks.

```text
Signature Verification
        │
        ▼
Expiration Check
        │
        ▼
Replay Detection
        │
        ▼
Policy Version Check
        │
        ▼
Authorization Binding
        │
        ▼
Enterprise Execution
```

Every layer must succeed before execution proceeds.

---

## Running the Example

```bash
tsx examples/tutorials/31-authorization-binding/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 32 — Multi-Step Execution**

The next tutorial demonstrates how a single Business Transaction can authorize multiple execution steps while preserving verification and auditability.

---

## Summary

In this tutorial you learned:

- Execution Authorizations are bound to executable content.
- Enterprise systems recompute the executable content hash.
- Any modification changes the hash.
- Hash mismatch causes execution to be rejected.
- Authorization Binding ensures Parmana-approved work cannot be redirected to a different request.
