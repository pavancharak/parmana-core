# Tutorial 47 — Canonical JSON

## Overview

Digital signatures are created over **bytes**, not objects.

Unfortunately, the same JSON object can be represented in many different textual forms.

Without canonicalization, two systems could sign logically identical objects but produce different signatures.

Parmana solves this by converting every object into **Canonical JSON** before hashing or signing.

---

## The Problem

These two objects contain identical information.

### Object A

```json
{
  "vendorId": "VENDOR-1001",
  "amount": 25000,
  "currency": "USD"
}
```

### Object B

```json
{
  "currency": "USD",
  "amount": 25000,
  "vendorId": "VENDOR-1001"
}
```

Although they are semantically identical, their raw JSON text differs.

---

## Canonical Serialization

Parmana converts both objects into the same canonical representation.

```text
Object A
        │
        ▼
Canonical Serializer
        │
        ▼
Canonical Bytes
=
Object B
        │
        ▼
Canonical Serializer
        │
        ▼
Canonical Bytes
```

This guarantees that identical business data always produces identical bytes.

---

## Expected Output

```text
==================================================
Tutorial 47 - Canonical JSON
==================================================
Object A
...
Object B
...
Canonical JSON A
{"amount":25000,"currency":"USD","vendorId":"VENDOR-1001"}
Canonical JSON B
{"amount":25000,"currency":"USD","vendorId":"VENDOR-1001"}
✓ Canonical serialization is deterministic.
Tutorial completed successfully.
```

---

## Why Canonical JSON Matters

Canonical serialization guarantees:

- identical hashes
- identical signatures
- deterministic verification
- platform-independent behavior
- reproducible trust records

Without canonicalization, simply changing the property order would invalidate every signature.

---

## Cryptographic Pipeline

```text
Business Object
        │
        ▼
Canonical JSON
        │
        ▼
SHA-256
        │
        ▼
Digital Signature
        │
        ▼
Verification
```

Every signature in Parmana begins with canonical serialization.

---

## Running the Example

```bash
tsx examples/tutorials/47-canonical-json/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 48 — Deterministic Signatures**

The next tutorial demonstrates that identical canonical bytes always produce identical hashes, forming the foundation for reproducible cryptographic verification.

---

## Summary

In this tutorial you learned:

- Digital signatures operate on bytes, not objects.
- JSON property order is not reliable.
- Canonical serialization produces deterministic bytes.
- Canonical JSON is the foundation of every Parmana signature.
