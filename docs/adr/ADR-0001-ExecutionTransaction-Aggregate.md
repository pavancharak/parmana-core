# ADR-0001 — ExecutionTransaction as the Aggregate Root

**Status:** Accepted

**Date:** 2026-06-25

**Decision Makers:** Parmana Architecture Team

---

# Context

Parmana models an execution as a sequence of immutable facts:

- Authority
- Intent
- Authorization
- Execution
- Evidence

A fundamental architectural decision was required:

Should these concepts exist as independent aggregate roots, or should they be owned by a single aggregate?

The answer affects consistency, transaction boundaries, replay, verification, persistence, and API design.

---

# Decision

`ExecutionTransaction` SHALL be the sole aggregate root of the Parmana Core domain.

The following objects SHALL be owned by the aggregate:

- Authority
- Intent
- Authorization
- Execution
- Evidence

These objects are immutable components of a single execution record.

They SHALL NOT exist independently within the Core domain.

---

# Rationale

## Single Consistency Boundary

Execution represents one logical business event.

All recorded facts belong to the same immutable transaction.

A single aggregate guarantees internal consistency.

---

## Immutability

ExecutionTransaction is immutable.

Changes create new aggregate instances rather than modifying existing state.

This simplifies replay, auditing, and deterministic verification.

---

## Simplified Persistence

Persisting one aggregate is simpler than coordinating multiple independent aggregates.

Storage implementations only need to manage a single execution record.

---

## Replay

Replay operates on one immutable transaction.

No reconstruction from multiple aggregates is required.

---

## Verification

Verification consumes a complete execution record.

It does not require fetching related entities or reconstructing domain state.

---

## Evidence Ownership

Evidence belongs to a single execution.

Evidence SHALL NOT be shared between transactions.

This preserves isolation and simplifies integrity verification.

---

# Consequences

## Positive

- Clear transaction boundary.
- Simpler persistence.
- Deterministic replay.
- Independent verification.
- Easier serialization.
- Reduced domain complexity.

---

## Negative

- Individual components cannot evolve independently.
- Large transactions may contain many evidence artifacts.
- Partial persistence is not supported within the aggregate.

These trade-offs are acceptable because Parmana optimizes for execution integrity rather than object reuse.

---

# Rejected Alternatives

## Independent Aggregates

Each concept represented as its own aggregate.

Rejected because it would require:

- Cross-aggregate consistency.
- Complex persistence.
- Reconstruction during verification.
- Increased implementation complexity.

---

## Mutable Aggregate

ExecutionTransaction updated in place.

Rejected because mutable state conflicts with deterministic replay, immutable evidence, and trust verification.

---

# Relationship to Verification

Verification is **not** part of the aggregate.

Verification is a derived projection.

```text
ExecutionTransaction
        │
        ▼
Verification Engine
        │
        ▼
Verification Report
```

The aggregate records facts.

The Verification Engine evaluates those facts.

---

# Architectural Invariants

The following invariants SHALL always hold:

- Every ExecutionTransaction has exactly one Authority.
- Every ExecutionTransaction has exactly one Intent.
- Every ExecutionTransaction has exactly one Authorization.
- Every ExecutionTransaction has exactly one Execution.
- Every ExecutionTransaction owns its Evidence.
- Verification never modifies the aggregate.
- The aggregate remains immutable.

---

# Impact

This decision establishes the canonical transaction boundary for Parmana.

All Runtime, Verification, Storage, SDK, API, and CLI implementations SHALL treat `ExecutionTransaction` as the authoritative representation of a single execution.

Future packages MUST preserve this aggregate boundary unless superseded by a future ADR.
