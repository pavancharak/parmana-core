# Tutorial 37 — Action Substitution

## Overview

Action substitution is an attack where a valid Execution Authorization is reused to execute a different business operation than the one originally approved.

For example, an authorization issued for **releasing a payment** must never be accepted to **create a vendor**.

Parmana prevents this by binding the authorization to the complete executable content, including the business action.

---

## Attack Scenario

```text
Authorized Request
Action
release-payment
        │
        ▼
Execution Authorization
        │
        ▼
Attacker modifies action
release-payment
        │
        ▼
create-vendor
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
vendor
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
create-vendor
Target
vendor
Parameters
invoiceId
vendorId
paymentAmount
currency
```

Only the action changed.

That single modification changes the executable content hash.

---

## Expected Output

```text
==================================================
Tutorial 37 - Action Substitution
==================================================
Authorized Action
release-payment
Substituted Action
create-vendor
Original Hash
4b7761f6...
Substituted Hash
b93b8c27...
✓ Action substitution detected.
Execution rejected.
Tutorial completed successfully.
```

---

## Why This Matters

Without authorization binding an attacker could reuse a valid authorization for an entirely different business operation.

Examples include:

- release-payment → create-vendor
- create-vendor → release-payment
- approve-invoice → release-payment
- release-payment → delete-vendor

Execution Authorization prevents this because the action is part of the signed executable content.

---

## Protected Fields

The executable content includes:

- action
- target
- parameters
- business transaction identifier

Changing any of these values changes the executable content hash.

---

## Running the Example

```bash
tsx examples/tutorials/37-action-substitution/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 38 — Target Substitution**

The next tutorial demonstrates that even if the action remains unchanged, changing the execution target (for example SAP → Oracle) invalidates the authorization.

---

## Summary

In this tutorial you learned:

- Execution Authorization is bound to the business action.
- Changing the action changes the executable content hash.
- The gateway detects the mismatch.
- Action substitution is rejected before enterprise execution.
