# ADR-0006 — Cryptographic Agility

**Status:** Accepted

**Date:** 2026-06-25

**Decision Makers:** Parmana Architecture Team

---

# Context

Parmana establishes execution trust through cryptographic integrity.

Cryptographic algorithms evolve over time. Algorithms that are considered secure today may become weak, deprecated, or vulnerable due to advances in cryptanalysis, computing power, or new technologies such as quantum computing.

A design decision was required:

Should cryptographic algorithms be embedded into the Core domain model, or should they remain replaceable?

---

# Decision

Parmana SHALL adopt Cryptographic Agility.

The Core domain model SHALL NOT depend upon any specific cryptographic algorithm.

Hash algorithms, digital signature algorithms, key providers, and integrity mechanisms SHALL be replaceable through well-defined interfaces.

Cryptography is an implementation concern, not a domain concern.

---

# Rationale

## Long-Term Viability

The expected lifetime of execution records exceeds the expected lifetime of many cryptographic algorithms.

The platform must be capable of adopting stronger algorithms without redesigning the domain model.

---

## Algorithm Independence

Execution trust depends on cryptographic integrity, not on a specific algorithm.

The platform should support multiple approved algorithms throughout its lifetime.

---

## Quantum Readiness

Future advances in quantum computing may require migration to post-quantum cryptographic algorithms.

By isolating cryptography behind provider interfaces, Parmana can adopt new standards while preserving the Core architecture.

---

## Regulatory Evolution

Governments and industry standards periodically revise approved cryptographic algorithms.

Cryptographic agility enables implementations to remain compliant without changing business logic.

---

# Architectural Principle

The Core domain records cryptographic metadata.

The Cryptography package performs cryptographic operations.

The Core never computes hashes or signatures directly.

---

# Package Relationship

```text
Core
   │
   ▼
Cryptography Interfaces
   │
   ▼
Provider Implementations
   │
   ├── SHA-256
   ├── SHA-3
   ├── BLAKE3
   ├── Ed25519
   ├── ECDSA
   ├── ML-DSA (Post-Quantum)
   └── Future Algorithms
```

The Runtime and Verification Engine depend only on cryptographic interfaces.

---

# Cryptographic Metadata

Execution records MAY contain metadata describing:

- Hash algorithm
- Signature algorithm
- Key identifier
- Provider identifier
- Algorithm version

This metadata enables future verification using the appropriate implementation.

---

# Provider Model

Cryptographic operations SHALL be delegated to providers.

Example responsibilities include:

- Hash generation
- Signature generation
- Signature verification
- Key management integration
- Integrity validation

Providers SHALL expose stable interfaces independent of specific algorithms.

---

# Consequences

## Positive

- Long-term maintainability.
- Easier algorithm migration.
- Support for multiple cryptographic standards.
- Improved regulatory flexibility.
- Readiness for post-quantum migration.
- Clear separation between domain and implementation.

---

## Negative

- Additional abstraction layer.
- Provider management complexity.
- Algorithm compatibility testing becomes necessary.

These trade-offs are acceptable because they preserve the long-term integrity of the platform.

---

# Rejected Alternatives

## Hard-Coded Algorithms

Embedding a specific algorithm (for example, SHA-256 or Ed25519) into the Core was rejected because it would tightly couple the domain model to implementation details and complicate future migrations.

---

## Runtime-Specific Cryptography

Allowing each Runtime implementation to define its own cryptographic behavior without a common interface was rejected because it would reduce interoperability and make verification inconsistent across implementations.

---

# Relationship to Verification

The Verification Engine SHALL validate cryptographic artifacts through provider interfaces.

Verification SHALL remain independent of the concrete algorithm implementation.

A compliant Verification Engine may support multiple algorithms simultaneously.

---

# Relationship to Storage

Storage preserves cryptographic artifacts and associated metadata.

Storage SHALL NOT reinterpret or regenerate cryptographic values.

---

# Migration Strategy

When stronger algorithms become available:

1. Existing execution records remain valid.
2. Existing cryptographic metadata remains preserved.
3. New executions MAY use newer providers.
4. Verification implementations MAY support multiple generations of algorithms concurrently.

This strategy allows gradual migration without invalidating historical execution records.

---

# Impact

Cryptographic Agility is a foundational architectural principle of Parmana.

The platform guarantees that cryptographic algorithms may evolve independently of the Core domain model.

This decision protects the longevity of execution records and enables Parmana to adapt to future cryptographic standards, including post-quantum algorithms, without requiring changes to the fundamental execution trust architecture.

Future implementations SHALL preserve this separation unless explicitly superseded by a future Architecture Decision Record.
