# Tutorial 43 — Stolen Authorization

## Overview

An attacker may obtain a legitimate Execution Authorization.

Possession alone, however, does **not** grant permission to execute arbitrary requests.

Every Execution Authorization is cryptographically bound to the exact executable content that Parmana approved.

Changing the request invalidates the authorization.

---

## Attack Scenario

```text
Attacker steals
Execution Authorization
        │
        ▼
Changes payment amount
25,000 USD
        │
        ▼
500,000 USD
        │
        ▼
Execution Gateway
        │
        ▼
Recompute Executable Content Hash
        │
        ▼
Hash Mismatch
        │
        ▼
✗ Execution Rejected
```

---

## Original Request

```text
Action
release-payment
Target
sap.payment.release
Amount
25,000 USD
```

---

## Stolen Authorization

The attacker possesses a completely valid authorization.

```text
✓ Valid Signature
✓ Valid Policy
✓ Valid Authorization
```

But then changes the request.

```text
Amount
25,000 USD
↓
500,000 USD
```

---

## Expected Output

```text
==================================================
Tutorial 43 - Stolen Authorization
==================================================
✓ Valid Execution Authorization generated.
Authorization Binding
\--------------------------------------------------
Authorized Hash : 4b7761f6...
Presented Hash  : 92afde17...
✓ Stolen authorization detected.
Execution rejected.
Tutorial completed successfully.
```

---

## Why This Works

The gateway never trusts the request itself.

Instead it:

1. Rebuilds the executable content.
2. Computes its hash.
3. Compares it with the hash stored inside the authorization.

If they differ, execution stops.

---

## Security Guarantee

A stolen authorization is only valid for:

- the original transaction
- the original action
- the original target
- the original parameters

It cannot be transferred to another request.

---

## Running the Example

```bash
tsx examples/tutorials/43-stolen-authorization/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 44 — Direct API Bypass**

The next tutorial demonstrates why enterprise APIs should reject requests that bypass Parmana entirely.

---

## Summary

In this tutorial you learned:

- A valid authorization can be stolen.
- Possession alone does not grant execution rights.
- Execution Authorization is bound to the original executable content.
- Modified requests are rejected before enterprise execution.
