# Tutorial 26 — Execution Authorization Verification

## Overview

In Tutorial 25, the Runtime generated a signed Execution Authorization after successfully evaluating a Business Transaction.

This tutorial demonstrates how an enterprise system independently verifies that authorization before allowing execution.

Verification proves that:

- The authorization was issued by Parmana.
- The authorization has not been modified.
- The authorization format is supported.
- The authorization has not expired.

Only verified authorizations should be trusted to cross the execution boundary.

---

## Execution Flow

```
Business Transaction
        │
        ▼
Parmana Runtime
        │
        ▼
Signed Execution Authorization
        │
        ▼
AuthorizationVerifier
        │
        ▼
✓ VALID
        │
        ▼
Enterprise Execution
```

---

## Building the Runtime

The Runtime produces a signed Execution Authorization.

```ts
const runtime = new RuntimeBuilder()
  .withPolicyRepository(new FilePolicyRepository("policies"))
  .build(new MemoryExecutionTrustRecordRepository());
```

---

## Executing the Transaction

```ts
const { context } = await runtime.execute(transaction);
```

The Runtime Context contains the generated authorization.

```ts
const authorization = context.authorization;
```

---

## Loading the Public Key

The Runtime signs using Parmana's private key.

Verification uses the corresponding public key.

```ts
const keyProvider = new FileKeyProvider();
const publicKey = await keyProvider.getPublicKey(authorization.keyId);
```

---

## Verifying the Authorization

```ts
const verifier = new AuthorizationVerifier(CryptoBootstrap.create());
const result = await verifier.verify(authorization, publicKey);
```

The verifier performs multiple independent checks.

---

## Verification Checks

The verification result contains:

| Check               | Purpose                       |
| ------------------- | ----------------------------- |
| `versionSupported`  | Payload version is recognized |
| `signatureVerified` | Digital signature is valid    |
| `notExpired`        | Authorization is still valid  |
| `valid`             | Overall verification result   |

Every check is reported independently to simplify troubleshooting.

---

## Expected Output

```text
==================================================
Tutorial 26 - Execution Authorization Verification
==================================================
Executing transaction...
✓ Execution Authorization generated.
Verifying authorization...
Valid               : true
Version Supported   : true
Signature Verified  : true
Not Expired         : true
✓ Execution Authorization verified.
Tutorial completed successfully.
```

---

## Why Verification Matters

Execution Authorization should never be trusted simply because it was received.

The receiving system must independently verify:

- Signature authenticity
- Payload integrity
- Authorization validity
- Supported payload version

This prevents forged or modified authorizations from reaching enterprise systems.

---

## Running the Example

```bash
tsx examples/tutorials/26-execution-authorization-verification/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 27 — Authorization Expiration**

The next tutorial demonstrates how expired Execution Authorizations are rejected even when their signatures remain valid.

---

## Summary

In this tutorial you learned how to:

- Retrieve the Runtime-generated Execution Authorization.
- Load Parmana's public key.
- Verify the authorization independently.
- Interpret the verification checks.
- Allow execution only after successful verification.

Execution Authorization verification is the first step in protecting the execution boundary between AI systems and enterprise applications.
