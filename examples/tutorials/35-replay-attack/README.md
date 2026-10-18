# Tutorial 35 — Replay Attack

## Overview

A replay attack occurs when an attacker captures a valid Execution Authorization and attempts to submit the exact same authorization multiple times.

Without replay protection, a previously authorized action could execute repeatedly.

Parmana prevents replay attacks by requiring every Execution Authorization to contain a unique **nonce**. The receiving system records every accepted nonce and rejects any subsequent reuse.

---

## Attack Scenario

```text
AI Agent
    │
    ▼
Execution Authorization
    │
    ▼
Execution Gateway
    │
    ▼
✓ Accepted
──────────────────────────────
Attacker replays
the identical authorization
    │
    ▼
Execution Gateway
    │
    ▼
Nonce Store
    │
    ▼
✗ Replay Detected
```

---

## How Replay Protection Works

Every Execution Authorization contains:

- Authorization ID
- Nonce
- Signature
- Expiration Time

When the gateway receives an authorization it:

1. Verifies the signature.
2. Verifies the authorization has not expired.
3. Checks whether the nonce has already been accepted.
4. Rejects duplicate nonces.

---

## First Request

The first request contains a previously unseen nonce.

```text
Nonce
8a5c...
↓
Accepted
↓
Nonce stored
```

---

## Replay Attempt

The identical authorization is submitted again.

```text
Nonce
8a5c...
↓
Already Seen
↓
Rejected
```

The authorization itself is still valid.

The rejection occurs because the nonce has already been consumed.

---

## Expected Output

```text
==================================================
Tutorial 35 - Replay Attack
==================================================
Generating Execution Authorization...
✓ Authorization generated.
First Request
\--------------------------------------------------
Accepted : true
Nonce Unseen : true
Replay Attempt
\--------------------------------------------------
Accepted : false
Nonce Unseen : false
✓ Replay attack detected.
Execution rejected.
Tutorial completed successfully.
```

---

## Why Replay Protection Matters

Replay protection prevents an attacker from executing the same approved action multiple times.

Examples include:

- releasing the same payment twice
- creating duplicate purchase orders
- executing duplicate wire transfers
- approving the same invoice repeatedly

---

## Security Layers

Replay protection is only one layer of execution trust.

```text
Execution Authorization
        │
        ▼
Signature Verification
        │
        ▼
Expiration Check
        │
        ▼
Replay Detection
        │
        ▼
Authorization Binding
        │
        ▼
Policy Verification
        │
        ▼
Enterprise Execution
```

---

## Running the Example

```bash
tsx examples/tutorials/35-replay-attack/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 36 — Parameter Tampering**

The next tutorial demonstrates how modifying execution parameters changes the executable content hash and causes authorization verification to fail.

---

## Summary

In this tutorial you learned:

- Every Execution Authorization contains a unique nonce.
- The Execution Gateway records accepted nonces.
- A nonce can only be used once.
- Replay attacks are rejected before enterprise execution.
