# Tutorial 27 — Authorization Expiration

## Overview

In the previous tutorial, we verified that a newly generated Execution Authorization was valid.

This tutorial demonstrates that a valid digital signature alone is **not sufficient**.

Every Execution Authorization has an expiration time. Once that time has passed, the authorization must be rejected even if its signature remains cryptographically valid.

---

## Execution Flow

```text
Business Transaction
        │
        ▼
Parmana Runtime
        │
        ▼
Signed Execution Authorization
        │
        ▼
Time Advances
        │
        ▼
AuthorizationVerifier
        │
        ▼
✗ Authorization Expired
```

---

## Why Expiration Exists

Execution Authorizations are intentionally short-lived.

Short-lived authorizations reduce the impact of:

- intercepted authorization envelopes
- delayed execution
- replay attacks
- compromised execution channels

An authorization should only be usable during the period for which Parmana explicitly approved it.

---

## Executing the Transaction

```ts
const { context } = await runtime.execute(transaction);
```

The Runtime returns a signed authorization.

```ts
const authorization = context.authorization;
```

---

## Simulating Time Passing

The verifier accepts an optional verification time.

Instead of verifying using the current time, this tutorial verifies after the authorization has expired.

```ts
const expiresAt =
  new Date(
    authorization.payload.expiresAt,
  );
const future =
  new Date(
    expiresAt.getTime() + 60\_000,
  );
```

---

## Verifying the Authorization

```ts
const result = await verifier.verify(authorization, publicKey, future);
```

The signature is still valid.

However, the authorization has expired.

---

## Expected Output

```text
==================================================
Tutorial 27 - Authorization Expiration
==================================================
Executing transaction...
✓ Execution Authorization generated.
Verifying expired authorization...
Valid               : false
Version Supported   : true
Signature Verified  : true
Not Expired         : false
✓ Authorization correctly rejected.
Tutorial completed successfully.
```

---

## Verification Results

| Check              | Result |
| ------------------ | ------ |
| Version Supported  | ✓      |
| Signature Verified | ✓      |
| Not Expired        | ✗      |
| Overall Valid      | ✗      |

Notice that the signature remains valid.

The authorization is rejected solely because it has expired.

---

## Security Benefits

Expiration prevents previously valid authorizations from being reused indefinitely.

Even if an attacker obtains a signed authorization, it becomes unusable after its expiration time.

This limits the lifetime of every execution request.

---

## Running the Example

```bash
tsx examples/tutorials/27-authorization-expiration/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 28 — Envelope Replay Detection**

The next tutorial demonstrates how Parmana prevents the same authorization from being accepted more than once.

---

## Summary

In this tutorial you learned:

- Execution Authorizations are time-limited.
- Signature verification alone is not sufficient.
- Expired authorizations are rejected.
- Authorization expiration is an important defense against replay attacks.

Expiration is one of several independent checks performed before enterprise execution is allowed.
