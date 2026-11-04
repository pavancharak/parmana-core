# ADR-0004 — Runtime Pipeline

**Status:** Accepted

**Date:** 2026-06-25

**Decision Makers:** Parmana Architecture Team

---

# Context

The Runtime is responsible for orchestrating execution.

A design decision was required regarding how execution logic should be organized.

Several alternatives were considered:

- A single monolithic Runtime class.
- Event-driven orchestration.
- Workflow graphs.
- Sequential execution pipeline.

The architecture needed to satisfy the following requirements:

- Deterministic execution.
- Simple reasoning.
- Independent execution stages.
- Extensibility.
- Replay compatibility.
- Testability.

---

# Decision

The Runtime SHALL be implemented as a deterministic execution pipeline.

Execution SHALL be performed by a sequence of independent Runtime Components.

Each component receives an immutable `ExecutionTransaction` and returns a new immutable `ExecutionTransaction`.

The Runtime itself SHALL coordinate the pipeline but SHALL NOT contain business logic.

---

# Pipeline Architecture

```text
Application
      │
      ▼
Runtime
      │
      ▼
RuntimePipeline
      │
      ├── AuthorityStage
      ├── IntentStage
      ├── AuthorizationStage
      ├── ExecutionStage
      └── EvidenceStage
      │
      ▼
Completed ExecutionTransaction
```

Each stage has a single responsibility.

---

# Runtime Component Contract

Every stage SHALL implement a common contract.

```typescript
interface RuntimeComponent {
  execute(transaction: ExecutionTransaction): ExecutionTransaction;
}
```

This enables composition while keeping stages independent.

---

# Stage Responsibilities

## AuthorityStage

Records or validates the authority responsible for initiating execution.

Produces:

- Authority

---

## IntentStage

Captures the intended action.

Produces:

- Intent

---

## AuthorizationStage

Evaluates whether execution is permitted.

Produces:

- Authorization

This stage does not perform execution.

---

## ExecutionStage

Coordinates execution.

Produces:

- Execution

Execution records factual outcomes only.

---

## EvidenceStage

Generates immutable execution evidence.

Produces:

- Evidence

Evidence becomes the input to the Verification Engine.

---

# Design Principles

Every Runtime Component SHALL be:

- Deterministic
- Stateless where practical
- Independently testable
- Composable
- Side-effect aware

Components SHALL avoid hidden dependencies on other stages.

---

# Execution Flow

```text
ExecutionTransaction
        │
        ▼
AuthorityStage
        │
        ▼
IntentStage
        │
        ▼
AuthorizationStage
        │
        ▼
ExecutionStage
        │
        ▼
EvidenceStage
        │
        ▼
Completed ExecutionTransaction
```

Each stage transforms the transaction without mutating the previous instance.

---

# Consequences

## Positive

- Clear separation of concerns.
- Simple execution model.
- High testability.
- Easy extension.
- Predictable execution order.
- Deterministic replay.
- Reusable pipeline components.

---

## Negative

- More classes than a monolithic Runtime.
- Additional object allocation.
- Pipeline ordering must be managed explicitly.

These trade-offs are acceptable because they improve maintainability and preserve deterministic behavior.

---

# Rejected Alternatives

## Monolithic Runtime

Rejected because execution logic would become tightly coupled, difficult to test, and harder to extend.

---

## Event-Driven Runtime

Rejected because asynchronous event ordering can complicate deterministic replay and increase implementation complexity.

---

## Workflow Graph

Rejected because graph-based execution introduces unnecessary flexibility for the canonical execution lifecycle and makes deterministic reasoning more difficult.

---

# Relationship to Verification

The Runtime Pipeline is responsible only for producing a complete immutable `ExecutionTransaction`.

Verification is intentionally excluded from the pipeline.

```text
Runtime Pipeline
        │
        ▼
ExecutionTransaction
        │
        ▼
Verification Engine
        │
        ▼
Verification Report
```

This preserves the architectural separation between execution and trust evaluation.

---

# Impact

This decision establishes the Runtime as a lightweight orchestration layer composed of deterministic execution stages.

Future stages (for example, `PolicyStage`, `HumanApprovalStage`, or `AttestationStage`) MAY be added without changing the Runtime itself, provided they implement the `RuntimeComponent` contract and preserve deterministic execution.

This pipeline architecture provides a stable foundation for future extensions while maintaining the simplicity and predictability required by the Parmana Execution Trust Model.
