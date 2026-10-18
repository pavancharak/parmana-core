# Tutorial 29 — Authorization Tampering

## Overview

In the previous tutorials we learned how Parmana generates, verifies, and protects Execution Authorizations from replay.

This tutorial demonstrates another important security property:

> **A signed Execution Authorization cannot be modified.**

Changing even a single field invalidates the cryptographic signature.

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
Modify Payload
        │
        ▼
AuthorizationVerifier
        │
        ▼
✗ Signature Verification Failed
```

---

## Why Tamper Detection Matters

An attacker must never be able to modify:

- Policy Version
- Decision ID
- Business Transaction ID
- Expiration Time
- Executable Content Hash

without detection.

Because the digital signature covers the complete authorization payload, any modification immediately invalidates the signature.

---

## Generating the Authorization

```ts
const { context } = await runtime.execute(transaction);
const authorization = context.authorization!;
```

---

## Tampering With the Payload

For demonstration purposes we modify the policy version after signing.

```ts
const tampered = {
  ...authorization,
  payload: {
    ...authorization.payload,
    policyVersion: "2.0.1",
  },
};
```

The signature is **not regenerated**.

---

## Verifying the Tampered Authorization

```ts
const result = await verifier.verify(tampered, publicKey);
```

The verifier recomputes the canonical payload and compares it against the signed payload.

Because they no longer match, signature verification fails.

---

## Expected Output

```text
==================================================
Tutorial 29 - Authorization Tampering
==================================================
Generating authorization...
✓ Authorization generated.
Authorization payload modified.
Verifying tampered authorization...
Valid               : false
Version Supported   : true
Signature Verified  : false
Not Expired         : true
✓ Tampering detected.
Tutorial completed successfully.
```

---

## Why Signature Verification Failed

Originally the authorization contained:

```text
Policy Version
2.0.0
```

After modification:

```text
Policy Version
2.0.1
```

Although only one value changed, the payload hash changed.

Since the signature was generated from the original payload, verification fails.

---

## Security Guarantees

Execution Authorization protects against unauthorized modification of:

- Decision identifiers
- Policy information
- Business transaction identifiers
- Authorization lifetime
- Executable content

This guarantees that enterprise systems execute exactly what Parmana authorized.

---

## Running the Example

```bash
tsx examples/tutorials/29-authorization-tampering/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 30 — Policy Version Pinning**

The next tutorial demonstrates why enterprise systems must reject Execution Authorizations that reference an unexpected policy version, even when the authorization itself is otherwise valid.

---

## Summary

In this tutorial you learned:

- Execution Authorizations are immutable.
- Digital signatures protect the complete authorization payload.
- Modifying even a single field invalidates the signature.
- Tampering is detected before enterprise execution begins.
