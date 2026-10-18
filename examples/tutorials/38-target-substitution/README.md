# Tutorial 38 — Target Substitution

## Overview

Target substitution is an attack where a valid Execution Authorization is reused against a different execution target than the one Parmana originally approved.

For example, an authorization issued for:

```
sap.payment.release
```

must never be accepted for:

```
oracle.payment.release
```

Parmana prevents this by including the execution target in the executable content hash.

---

## Attack Scenario

```text
Authorized Request
Action
release-payment
Target
sap.payment.release
        │
        ▼
Execution Authorization
        │
        ▼
Attacker changes target
sap.payment.release
        │
        ▼
oracle.payment.release
        │
        ▼
Gateway recomputes executable hash
        │
        ▼
✗ Hash Mismatch
        │
        ▼
Execution Rejected
```

---

## Original Request

```text
Action
release-payment
Target
sap.payment.release
Parameters
invoiceId
vendorId
paymentAmount
currency
```

---

## Modified Request

```text
Action
release-payment
Target
oracle.payment.release
Parameters
invoiceId
vendorId
paymentAmount
currency
```

Only the execution target changed.

That single modification changes the executable content hash.

---

## Expected Output

```text
==================================================
Tutorial 38 - Target Substitution
==================================================
Authorized Target
sap.payment.release
Substituted Target
oracle.payment.release
Original Hash
4b7761f6...
Substituted Hash
5c2e87ab...
✓ Target substitution detected.
Execution rejected.
Tutorial completed successfully.
```

---

## Why This Matters

A valid authorization for one enterprise system must never be accepted by another.

Examples include:

- SAP → Oracle
- Oracle → Workday
- Payment API → Vendor API
- Production → Sandbox

Execution Authorization prevents these attacks because the execution target is cryptographically bound to the authorization.

---

## Protected Fields

The executable content includes:

- businessTransactionId
- action
- target
- parameters

Changing any field changes the executable content hash.

---

## Running the Example

```bash
tsx examples/tutorials/38-target-substitution/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 39 — Policy Substitution**

The next tutorial demonstrates why a valid authorization issued under one policy version cannot be reused under another policy.

---

## Summary

In this tutorial you learned:

- Execution Authorization is bound to the execution target.
- Changing the target changes the executable content hash.
- The gateway detects the mismatch.
- Target substitution is rejected before enterprise execution.
