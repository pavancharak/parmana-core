# Tutorial 39 — Policy Substitution

## Overview

Policy substitution is an attack where an attacker attempts to execute a request under a different policy than the one Parmana originally evaluated.

An Execution Authorization is valid **only** for the policy name and policy version that produced it.

Changing either value invalidates the authorization.

---

## Attack Scenario

```text
Policy Evaluation
vendor-payment@2.1.0
        │
        ▼
Execution Authorization
        │
        ▼
Attacker changes policy
vendor-payment@2.1.0
        │
        ▼
vendor-payment@3.0.0
        │
        ▼
Gateway compares policy
        │
        ▼
✗ Policy Mismatch
        │
        ▼
Execution Rejected
```

---

## Authorized Policy

```text
Policy Name
vendor-payment
Version
2.0.0
```

---

## Modified Policy

```text
Policy Name
vendor-payment
Version
3.0.0
```

Only the policy version changed.

Even though the execution request is identical, the authorization is no longer valid.

---

## Expected Output

```text
==================================================
Tutorial 39 - Policy Substitution
==================================================
Authorized Policy
vendor-payment@2.1.0
Substituted Policy
vendor-payment@3.0.0
✓ Policy substitution detected.
Execution rejected.
Policy Integrity
\--------------------------------------------------
Authorizations are valid only for the policy
under which they were originally issued.
Tutorial completed successfully.
```

---

## Why Policy Integrity Matters

Enterprise policies evolve over time.

Examples include:

- approval thresholds
- segregation-of-duty rules
- compliance requirements
- risk scoring
- regulatory controls

An authorization issued under one policy version must never be interpreted as approval under another.

---

## Gateway Validation

The Execution Gateway verifies that:

- Policy name matches.
- Policy version matches.
- Authorization was issued for that policy.

Only then may execution continue.

---

## Running the Example

```bash
tsx examples/tutorials/39-policy-substitution/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 40 — Signature Forgery**

The next tutorial demonstrates why an attacker cannot fabricate an Execution Authorization without Parmana's private signing key.

---

## Summary

In this tutorial you learned:

- Execution Authorizations are bound to the policy that approved them.
- Changing the policy name or version invalidates the authorization.
- The Execution Gateway detects policy mismatches.
- Policy substitution is rejected before enterprise execution.
