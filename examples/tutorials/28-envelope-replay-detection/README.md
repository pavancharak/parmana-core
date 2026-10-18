# Tutorial 28 — Envelope Replay Detection

## Overview

In the previous tutorials we learned how Parmana generates and verifies Execution Authorizations.

This tutorial demonstrates how Parmana prevents the **same authorization** from being accepted more than once.

Even when:

- the signature is valid,
- the authorization has not expired,
- the payload has not been modified,

the second attempt is rejected because the authorization nonce has already been consumed.

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
EnvelopeVerifier
        │
        ▼
MemoryNonceStore
        │
        ▼
First Request
        │
        ▼
✓ Accepted
Second Request
        │
        ▼
✗ Replay Detected
```

---

## Why Replay Protection Exists

Without replay protection an attacker could capture a valid authorization and execute it repeatedly until it expired.

Replay detection guarantees that every authorization can only be accepted once.

---

## Building the Runtime

```ts
const runtime = new RuntimeBuilder()
  .withPolicyRepository(new FilePolicyRepository("policies"))
  .build(new MemoryExecutionTrustRecordRepository());
```

---

## Generating the Authorization

```ts
const { context } = await runtime.execute(transaction);
const authorization = context.authorization!;
```

---

## Creating the Envelope Verifier

```ts
const verifier = new EnvelopeVerifier({
  publicKey,
  nonceStore: new MemoryNonceStore(),
});
```

The verifier combines:

- signature verification
- expiration validation
- TTL policy
- replay detection

---

## First Verification

```ts
const first = await verifier.verify(authorization);
```

Result:

```text
✓ Accepted
```

The nonce is recorded.

---

## Second Verification

```ts
const second = await verifier.verify(authorization);
```

Result:

```text
✗ Replay Detected
```

The authorization itself has not changed.

Only the nonce state has changed.

---

## Expected Output

```text
==================================================
Tutorial 28 - Envelope Replay Detection
==================================================
Generating authorization...
✓ Authorization generated.
First verification...
Valid           : true
Nonce Unseen    : true
✓ Authorization accepted.
Second verification...
Valid           : false
Nonce Unseen    : false
✓ Replay detected.
Tutorial completed successfully.
```

---

## Verification Lifecycle

```text
Authorization
        │
        ▼
Verify Signature
        │
        ▼
Verify Expiration
        │
        ▼
Verify TTL
        │
        ▼
Consume Nonce
        │
        ▼
Execute
```

The nonce is consumed only after every other verification succeeds.

This prevents invalid or forged authorizations from exhausting nonce values.

---

## Development vs Production

This tutorial uses:

```text
MemoryNonceStore
```

The in-memory implementation is intended only for examples and local development.

Production deployments should use a persistent implementation backed by Redis, a database, or another durable store so replay protection survives process restarts.

---

## Running the Example

```bash
tsx examples/tutorials/28-envelope-replay-detection/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 29 — Authorization Tampering**

The next tutorial demonstrates how modifying any field of a signed Execution Authorization causes signature verification to fail.

---

## Summary

In this tutorial you learned:

- Replay attacks are detected independently of signature verification.
- Every authorization nonce can be accepted only once.
- EnvelopeVerifier combines cryptographic verification with replay protection.
- NonceStore provides the foundation for secure execution authorization.
