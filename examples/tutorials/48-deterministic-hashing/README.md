# Tutorial 48 — Deterministic Hashing

## Overview

After canonical serialization, Parmana computes a deterministic cryptographic hash.

The same canonical bytes must always produce the same hash.

This property is fundamental to:

- Execution Authorization
- Trust Records
- Digital Signatures
- Independent Verification
- Replay Protection

---

## Architecture

```text
Business Object
        │
        ▼
Canonical Serializer
        │
        ▼
Canonical JSON
        │
        ▼
SHA-256
        │
        ▼
Deterministic Hash
```

---

## Why Deterministic Hashing Matters

Two identical business objects should always produce the same hash.

```text
Object A
        │
        ▼
Canonical JSON
        │
        ▼
SHA-256
        │
        ▼
4b7761f6...
──────────────────────
Object B
        │
        ▼
Canonical JSON
        │
        ▼
SHA-256
        │
        ▼
4b7761f6...
```

Because the canonical JSON is identical, the hash is identical.

---

## Expected Output

```text
==================================================
Tutorial 48 - Deterministic Hashing
==================================================
Canonical JSON
{"currency":"USD","invoiceId":"INV-2026-001","paymentAmount":25000,"vendorId":"VENDOR-1001"}
Hash #1 : 4b7761...
Hash #2 : 4b7761...
✓ Deterministic hashing verified.
Tutorial completed successfully.
```

---

## Why This Matters

Parmana never hashes arbitrary JSON.

Every cryptographic operation follows the same pipeline:

```text
Business Object
        │
        ▼
Canonical Serializer
        │
        ▼
Canonical JSON
        │
        ▼
SHA-256
        │
        ▼
Hash
```

Because the hash is deterministic:

- signatures are reproducible
- verification is independent
- replay is deterministic
- trust records remain verifiable

---

## Running the Example

```bash
tsx examples/tutorials/48-deterministic-hashing/run.ts
```

or

```bash
npm run examples
```

---

## Next Tutorial

**Tutorial 49 — Detached Signatures**

The next tutorial demonstrates how Parmana stores signatures separately from business data, allowing immutable payloads to be verified without modification.

---

## Summary

In this tutorial you learned:

- Canonical JSON always produces the same bytes.
- SHA-256 always produces the same hash for the same bytes.
- Deterministic hashing is the foundation of Parmana's cryptographic trust model.
