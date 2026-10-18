# Tutorial 36 — Parameter Tampering

## Overview

Parameter tampering occurs when an attacker modifies one or more execution parameters after Parmana has authorized the request.

Even if the Execution Authorization itself remains unchanged, the modified request must never execute.

Parmana prevents this attack by cryptographically binding the authorization to the executable content.

---

## Attack Scenario

```text
Original Request
Payment Amount = 25,000
        │
        ▼
Execution Authorization
        │
        ▼
Attacker modifies request
Payment Amount = 500,000
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

## Why It Works

The Execution Authorization contains:

- Business Transaction ID
- Policy Information
- Decision ID
- Executable Content Hash

The executable content hash is calculated from the exact request Parmana approved.

Changing any execution parameter changes the hash.

---

## Original Executable Content

```text
Vendor
VENDOR-1001
Invoice
INV-2026-001
Amount
25,000 USD
```

---

## Tampered Executable Content

```text
Vendor
VENDOR-1001
Invoice
INV-2026-001
Amount
500,000 USD
```

Although only one value changed, the executable content hash is completely different.

---

## Expected Output

```text
==================================================
Tutorial 36 - Parameter Tampering
==================================================
Original Hash
4b7761f6...
Tampered Hash
3013239f...
✓ Parameter tampering detected.
Execution rejected.
Tutorial completed successfully.
```

---

## Why Hashes Matter

The gateway never trusts incoming parameters.

Instead it:

1. Rebuilds the executable content.
2. Recomputes the executable content hash.
3. Compares it against the hash stored inside the Execution Authorization.

If the hashes differ, execution is rejected.

---

## Protected Parameters

Authorization Binding protects:

- payment amount
- currency
- invoice
- vendor
- account
- destination
- every executable parameter

Any modification changes the executable content hash.

---

## Running the Example

```bash
tsx examples/tutorials/36-parameter-tampering/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 37 — Action Substitution**

The next tutorial demonstrates why a valid authorization for one business action (for example, `release-payment`) cannot be reused to execute a different action (for example, `create-vendor`).

---

## Summary

In this tutorial you learned:

- Execution Authorizations are bound to executable content.
- Modifying any execution parameter changes the executable content hash.
- Hash mismatch causes execution to be rejected.
- Parameter tampering is detected before enterprise execution.
