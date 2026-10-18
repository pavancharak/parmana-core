# Tutorial 30 — Policy Version Pinning

## Overview

In the previous tutorials we learned how Parmana generates, verifies, and protects Execution Authorizations.

This tutorial demonstrates an equally important governance principle:

> **A cryptographically valid authorization is not automatically executable.**

Enterprise systems may require that an authorization was issued using a specific policy version.

If the authorization references an older policy version, execution is rejected even though the signature is valid.

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
AuthorizationVerifier
        │
        ▼
✓ Authorization Verified
        │
        ▼
Enterprise Policy Check
        │
        ▼
Expected Policy Version?
        │
        ├───────────────┐
        │               │
       YES             NO
        │               │
        ▼               ▼
 Execute          Reject Execution
```

---

## Why Policy Version Pinning Exists

Policies evolve over time.

For example:

```text
vendor-payment
2.0.0
```

may later become

```text
vendor-payment
2.1.0
```

because:

- approval thresholds changed
- fraud controls were updated
- compliance requirements changed
- new business rules were introduced

An enterprise system may refuse to execute requests authorized under older policy versions.

---

## Cryptographic Verification

The authorization is first verified normally.

```ts
const verification = await verifier.verify(authorization, publicKey);
```

If verification succeeds, enterprise governance continues.

---

## Enterprise Policy Check

The receiving system compares the expected policy version with the version contained inside the authorization.

```ts
const expectedPolicyVersion = "2.1.0";
const actualPolicyVersion = authorization.payload.policyVersion;
```

If the versions differ, execution is rejected.

---

## Expected Output

```text
==================================================
Tutorial 30 - Policy Version Pinning
==================================================
Generating authorization...
✓ Authorization generated.
Verifying authorization...
✓ Authorization verified.
Enterprise Policy Check
Expected Policy : vendor-payment@2.1.0
Authorization   : vendor-payment@2.1.0
✗ Authorization rejected.
Reason: Policy version mismatch.
Tutorial completed successfully.
```

---

## Why This Is Important

Notice that the authorization is:

- correctly signed
- unmodified
- not expired

Yet execution is still rejected.

This demonstrates the difference between:

- **Cryptographic validity**
- **Enterprise governance**

Both are required before execution proceeds.

---

## Running the Example

```bash
tsx examples/tutorials/30-policy-version-pinning/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 31 — Authorization Binding**

The next tutorial demonstrates how Parmana cryptographically binds an Execution Authorization to the exact Business Transaction it approved, preventing an authorization from being reused for a different request.

---

## Summary

In this tutorial you learned:

- Authorization verification proves authenticity.
- Enterprise systems may require additional governance checks.
- Policy version pinning ensures execution uses approved policy versions.
- Cryptographic verification and governance are complementary layers of protection.
