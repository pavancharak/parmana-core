# ADR-0003 — Verification Is Independent

**Status:** Accepted

**Date:** 2026-06-25

**Decision Makers:** Parmana Architecture Team

---

# Context

Parmana establishes trust by independently verifying execution.

A key architectural decision was required:

Should verification be part of the Runtime, or should it operate as an independent subsystem?

Embedding verification within the Runtime would simplify implementation but tightly couple execution with trust evaluation. This coupling would make independent auditing, deterministic replay, and external verification more difficult.

---

# Decision

Verification SHALL be an independent subsystem.

The Runtime SHALL produce immutable execution facts.

The Verification Engine SHALL consume those facts without modifying them.

Verification SHALL operate entirely outside the Runtime execution pipeline.

---

# Rationale

## Separation of Responsibilities

The Runtime answers:

> "What happened?"

The Verification Engine answers:

> "Can the recorded execution be trusted?"

These are distinct responsibilities and should remain independent.

---

## Independent Trust

Trust is stronger when it can be established by a component that did not participate in execution.

An independent verifier reduces the possibility that execution and verification share the same implementation defects or assumptions.

---

## Replay

Verification must support deterministic replay.

Operating on immutable execution records enables replay without re-running business logic or the Runtime.

---

## Auditability

Auditors should be able to verify an execution using only recorded artifacts.

Verification should not require:

- Runtime state
- Runtime memory
- Network services
- Internal implementation details

---

## Technology Independence

The Verification Engine should remain portable across environments.

It should be usable:

- Offline
- In CI/CD pipelines
- By external auditors
- By regulatory bodies
- By third-party implementations

---

# Architectural Relationship

```text
Application
      │
      ▼
Runtime
      │
      ▼
ExecutionTransaction
      │
      ├──────────────┐
      ▼              ▼
Storage     Verification Engine
                    │
                    ▼
          Verification Report
```

The Runtime and Verification Engine communicate only through immutable execution records.

---

# Consequences

## Positive

- Independent trust evaluation.
- Deterministic replay.
- Easier auditing.
- Clear package boundaries.
- Technology independence.
- Support for offline verification.
- Simpler testing.

---

## Negative

- Additional implementation complexity.
- Verification becomes a separate package.
- Execution and verification are no longer a single process.

These trade-offs are acceptable because Parmana prioritizes verifiable trust over implementation simplicity.

---

# Prohibited Behaviors

The Runtime SHALL NOT:

- Verify its own execution.
- Produce verification reports.
- Modify verification results.

The Verification Engine SHALL NOT:

- Execute business logic.
- Modify transactions.
- Generate execution artifacts.
- Depend on Runtime internals.

---

# Runtime Contract

The Runtime guarantees that it produces a complete immutable `ExecutionTransaction`.

It makes no claim regarding trust.

Trust is established only after independent verification.

---

# Verification Contract

The Verification Engine guarantees that identical immutable transactions produce identical verification results.

Verification is deterministic, side-effect free, and independent of execution.

---

# Alternatives Considered

## Verification Inside Runtime

Rejected because execution and verification would become tightly coupled, reducing auditability and limiting independent verification.

---

## Runtime Callback Verification

Rejected because callbacks create implicit coupling between execution and verification and complicate deterministic replay.

---

## Impact

This decision establishes one of Parmana's core architectural boundaries:

- Runtime is responsible for execution.
- Verification is responsible for trust.

Future implementations SHALL preserve this separation unless explicitly superseded by a future Architecture Decision Record.

This boundary is fundamental to Parmana's Execution Trust Model and enables independent verification across different environments, organizations, and implementations.
