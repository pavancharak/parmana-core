# Tutorial 41 — Expired Authorization

## Overview

A correctly signed Execution Authorization is valid only for a limited period of time.

After its expiration time, the authorization must be rejected even though its signature is still valid.

This prevents attackers from reusing old authorizations long after they were issued.

---

## Attack Scenario

```text
Execution Authorization
        │
        ▼
Valid Signature
        │
        ▼
Time Passes
        │
        ▼
Authorization Expires
        │
        ▼
Execution Gateway
        │
        ▼
Expiration Check
        │
        ▼
✗ Authorization Expired
        │
        ▼
Execution Rejected
```

---

## Authorization Lifetime

Every Execution Authorization contains two timestamps:

- **authorizedAt**
- **expiresAt**

The gateway compares the current time with **expiresAt** before allowing execution.

---

## Expected Output

```text
==================================================
Tutorial 41 - Expired Authorization
==================================================
Authorization Lifetime
\--------------------------------------------------
Authorized At : 2026-07-10T12:00:00Z
Expires At    : 2026-07-10T12:02:00Z
Verified At   : 2026-07-10T12:02:01Z
Verification
\--------------------------------------------------
Version Supported : true
Signature Valid   : true
Not Expired       : false
✓ Expired authorization detected.
Execution rejected.
Tutorial completed successfully.
```

---

## Why Expiration Matters

Without expiration, an attacker who captures a valid authorization could replay it days, weeks, or even months later.

A short authorization lifetime limits the window in which a stolen authorization can be abused.

---

## Gateway Validation

Before forwarding a request, the Execution Gateway verifies:

- Payload version
- Digital signature
- Expiration time
- Replay protection
- Authorization binding
- Policy validation

Only if every check succeeds is the request forwarded.

---

## Running the Example

```bash
tsx examples/tutorials/41-expired-authorization/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 42 — Nonce Reuse**

The next tutorial demonstrates how the gateway prevents the same authorization from being accepted twice, even when it has not yet expired.

---

## Summary

In this tutorial you learned:

- Execution Authorizations have a limited lifetime.
- A valid signature does not override expiration.
- Expired authorizations are rejected before execution.
- Short-lived authorizations reduce the impact of credential theft.
