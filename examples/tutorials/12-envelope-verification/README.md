# Tutorial 12 — Envelope Verification

## Objective

This tutorial demonstrates how a downstream execution system verifies a Parmana Execution Authorization before executing business logic.

Unlike policy evaluation, envelope verification does **not** determine whether an action should be allowed. It verifies that Parmana has already authorized the action.

---

## What this tutorial demonstrates

The runtime:

- Evaluates policy
- Produces a Decision
- Generates a signed Execution Authorization

The downstream system:

- Verifies the signature
- Confirms the authorization has not expired
- Validates the authorization TTL
- Performs replay protection using the nonce

Only after all checks succeed should execution proceed.

---

## Run

```bash
npx tsx examples/tutorials/12-envelope-verification/run.ts
```

---

## Expected output

The verification result contains:

```json
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

---

## Architecture

```
Business Transaction
        │
        ▼
 Runtime
        │
        ▼
Signed Execution Authorization
        │
        ▼
Envelope Verifier
        │
        ├── Signature Verification
        ├── Expiry Verification
        ├── TTL Verification
        └── Replay Protection (Nonce)
        │
        ▼
Verified Execution Request
        │
        ▼
Execution System
```

This tutorial demonstrates the trust boundary between Parmana and downstream execution systems. Execution systems do not re-evaluate enterprise policy—they verify that Parmana authorized the request and that the authorization remains valid.
