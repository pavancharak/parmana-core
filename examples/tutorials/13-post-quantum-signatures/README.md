# Tutorial 13 — Post-Quantum Signatures

## Objective

This tutorial demonstrates that Parmana's execution authorization architecture is **cryptography-agnostic**.

The runtime, execution authorization, and envelope verification remain identical regardless of the underlying signature algorithm.

Only the cryptographic provider changes.

---

## What this tutorial demonstrates

Parmana executes a Business Transaction and produces a signed Execution Authorization.

The downstream execution system verifies the authorization using the configured public key.

The same application code works with:

- Ed25519
- Dilithium3 (Post-Quantum)

No application code changes are required.

---

## Run with Ed25519

```bash
SIGNATURE\_PROVIDER=ed25519
npx tsx examples/tutorials/13-post-quantum-signatures/run.ts
```

---

## Run with Dilithium3

```bash
SIGNATURE\_PROVIDER=dilithium3
npx tsx examples/tutorials/13-post-quantum-signatures/run.ts
```

---

## Expected output

```
Signature Provider : ed25519
...
Envelope Verification
{
  "valid": true,
  "checks": {
    "signatureVerified": true,
    "notExpired": true,
    "ttlWithinPolicy": true,
    "nonceUnseen": true
  }
}
```

Running with Dilithium3 should produce the same verification result.

---

## Architecture

```
Business Transaction
        │
        ▼
Runtime
        │
        ▼
Execution Authorization
        │
        ▼
Signature Provider
        │
        ├── Ed25519
        └── Dilithium3
        │
        ▼
Envelope Verifier
        │
        ▼
Verified Execution Request
```

The signature algorithm is a pluggable implementation detail. Parmana's execution authorization model, runtime, and verification flow remain unchanged.
