# ADR-0007 — Deterministic Execution

**Status:** Accepted

**Date:** 2026-06-25

**Decision Makers:** Parmana Architecture Team

---

# Context

Parmana exists to establish **Execution Trust**.

Execution Trust requires that an execution can be independently replayed, verified, and audited.

This requires a fundamental architectural decision:

Should execution depend on non-deterministic runtime behavior, or should identical execution requests always produce identical observable results?

Without deterministic execution:

- Replay cannot reliably reproduce execution.
- Verification may produce inconsistent results.
- Audit conclusions become implementation-dependent.
- Cryptographic evidence may become unreliable.

---

# Decision

Execution within Parmana SHALL be deterministic.

Given identical immutable inputs, a compliant implementation SHALL produce equivalent observable execution results.

Observable results include:

- ExecutionTransaction
- Evidence
- Verification inputs
- Integrity artifacts

Determinism is a platform guarantee.

---

# Definition

Deterministic execution means that execution depends solely upon recorded inputs.

Execution SHALL NOT depend upon transient runtime state that is not explicitly represented within the execution record.

---

# Deterministic Inputs

Execution MAY depend upon:

- Authority
- Intent
- Authorization
- Configuration
- Policy snapshots
- Runtime parameters explicitly recorded
- Immutable execution context

Every execution input that influences observable behavior SHOULD be represented within the execution record or otherwise preserved as verifiable execution context.

---

# Non-Deterministic Inputs

Execution SHALL NOT depend upon hidden or implicit state, including:

- Wall-clock time (unless explicitly captured)
- Random number generation (unless deterministic and recorded)
- Process identifiers
- Memory addresses
- Thread scheduling
- CPU timing
- Object allocation order
- Network latency
- Operating system scheduling
- Unrecorded external service responses

If such values influence execution, they SHALL be captured explicitly as execution context or evidence.

---

# Execution Model

```text
Request
    │
    ▼
Execution Context
    │
    ▼
Runtime Pipeline
    │
    ▼
ExecutionTransaction
    │
    ▼
Evidence
```

All observable outputs derive from recorded inputs.

---

# Replay

Replay executes using the preserved execution context.

Given equivalent recorded inputs, replay SHALL produce equivalent observable outputs.

Replay is not required to reproduce implementation-specific details such as memory layout or execution timing.

Replay is required to reproduce execution semantics.

---

# Verification

The Verification Engine depends upon deterministic execution.

Verification assumes that:

- identical execution records represent equivalent execution semantics, and
- replay produces equivalent observable behavior.

This enables consistent verification across independent implementations.

---

# Runtime Responsibilities

The Runtime SHALL:

- Preserve execution inputs.
- Record relevant execution context.
- Avoid hidden state.
- Produce deterministic execution artifacts.

The Runtime SHALL NOT introduce behavior that cannot be explained by recorded execution inputs.

---

# Evidence Responsibilities

Evidence SHALL preserve the information necessary to understand how execution occurred.

Evidence SHOULD be sufficient to explain execution outcomes without requiring hidden runtime state.

---

# Consequences

## Positive

- Deterministic replay.
- Independent verification.
- Repeatable testing.
- Reliable auditing.
- Portable execution records.
- Stable cryptographic integrity.
- Consistent behavior across implementations.

---

## Negative

- Additional execution context may need to be recorded.
- Some implementation optimizations may require explicit documentation.
- Integration with inherently non-deterministic external systems requires careful modeling.

These trade-offs are acceptable because Parmana prioritizes verifiable execution over implementation convenience.

---

# Alternatives Considered

## Best-Effort Determinism

Rejected because partial determinism leaves ambiguity during replay and verification.

Execution Trust requires predictable observable behavior.

---

## Runtime-Dependent Execution

Rejected because implementation-specific behavior would prevent independent verification and reduce interoperability.

---

# Relationship to Other ADRs

This decision builds upon:

- **ADR-0001** — ExecutionTransaction as the Aggregate Root
- **ADR-0002** — Immutable Domain Model
- **ADR-0003** — Verification Is Independent
- **ADR-0004** — Runtime Pipeline
- **ADR-0005** — Evidence Is Append-Only
- **ADR-0006** — Cryptographic Agility

Together, these decisions establish the technical foundation for the Parmana Execution Trust Model.

---

# Architectural Invariant

A compliant Parmana implementation SHALL ensure that:

1. Observable execution behavior is derived from recorded inputs.
2. Replay reproduces equivalent execution semantics.
3. Verification operates consistently across independent implementations.
4. Hidden runtime state does not determine observable execution outcomes.

---

# Impact

Deterministic execution is a foundational architectural property of Parmana.

It enables replay, independent verification, auditability, cryptographic integrity, and execution trust.

Future Runtime, Verification, SDK, API, CLI, and Storage implementations SHALL preserve deterministic execution semantics unless explicitly superseded by a future Architecture Decision Record.
