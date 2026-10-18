# ADR-0002 — Immutable Domain Model

**Status:** Accepted

**Date:** 2026-06-25

**Decision Makers:** Parmana Architecture Team

---

# Context

Parmana exists to establish trust between decisions and execution.

Trust requires that recorded execution facts remain stable after they are created. If domain objects can be modified after creation, replay, verification, evidence generation, and cryptographic integrity become unreliable.

A design decision was required:

Should the domain model use mutable objects or immutable objects?

---

# Decision

All Core domain objects SHALL be immutable.

Once created, a domain object SHALL NOT change its observable state.

State transitions SHALL produce new immutable instances rather than modifying existing instances.

This decision applies to all Core domain objects, including:

- Identifier
- Timestamp
- Metadata
- Authority
- Intent
- Authorization
- Execution
- Evidence
- ExecutionTransaction

---

# Rationale

## Deterministic Behavior

Immutable objects guarantee that identical inputs produce identical outputs.

Deterministic behavior is required for replay and verification.

---

## Replay

Replay depends upon historical state remaining unchanged.

Immutable domain objects eliminate accidental mutation during replay.

---

## Verification

Verification evaluates recorded facts.

If facts could change after execution, verification results would no longer be trustworthy.

---

## Evidence Integrity

Evidence artifacts represent historical facts.

Historical facts cannot be edited.

Immutability preserves the integrity of recorded evidence.

---

## Thread Safety

Immutable objects can be safely shared across threads, asynchronous workflows, and distributed components without synchronization.

---

## Simpler Reasoning

Developers can reason about immutable objects more easily because their state never changes after construction.

This reduces hidden side effects and improves maintainability.

---

# Consequences

## Positive

- Deterministic execution.
- Simplified replay.
- Reliable verification.
- Safer concurrent execution.
- Easier debugging.
- Reduced side effects.
- Stable serialization.

---

## Negative

- More object allocation.
- State transitions create new objects.
- Large aggregates may require structural copying.

These costs are acceptable because Parmana optimizes for execution trust rather than minimizing object allocation.

---

# State Transitions

State changes SHALL be represented by creating new objects.

Example:

```typescript
const completed = transaction.withStatus(TransactionStatus.COMPLETED);
```

The original transaction remains unchanged.

---

# Prohibited Behaviors

Core implementations SHALL NOT:

- Expose mutable public state.
- Provide public setters.
- Mutate collections after construction.
- Modify existing transactions.
- Modify evidence artifacts.
- Modify verification results.

---

# Relationship to ExecutionTransaction

ExecutionTransaction is immutable.

Its owned components are also immutable.

The aggregate evolves through replacement rather than mutation.

```text
Original Transaction
        │
        ▼
withStatus(...)
        │
        ▼
New Transaction
```

The original instance remains valid for replay and audit.

---

# Relationship to Verification

Verification is performed against immutable transactions.

Verification SHALL NOT modify:

- Transactions
- Evidence
- Execution
- Intent
- Authorization

Verification produces a separate immutable Verification Report.

---

# Implementation Guidance

Core implementations SHOULD:

- Use readonly fields.
- Freeze objects where appropriate.
- Return new instances for state transitions.
- Avoid exposing mutable collections.
- Prefer immutable value objects.

---

# Alternatives Considered

## Mutable Domain Objects

Rejected because mutable state undermines deterministic replay, verification, evidence integrity, and auditability.

---

## Selective Immutability

Rejected because mixing mutable and immutable concepts introduces ambiguity and increases the risk of accidental state changes.

A consistently immutable domain model is simpler and more predictable.

---

# Impact

Immutability is a foundational property of the Parmana Core domain.

All higher-level packages—including Runtime, Verification, Storage, SDK, API, and CLI—depend on immutable domain objects to preserve deterministic execution, independent verification, and execution trust.

Future changes to the Core SHALL preserve this invariant unless explicitly superseded by a future Architecture Decision Record.
