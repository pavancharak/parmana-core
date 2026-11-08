# ADR-0005 — Evidence Is Append-Only

**Status:** Accepted

**Date:** 2026-06-25

**Decision Makers:** Parmana Architecture Team

---

# Context

Evidence is the factual record produced during execution.

It forms the foundation for replay, audit, verification, and execution trust.

A design decision was required:

Should evidence be mutable, allowing modification or deletion after creation, or should it be append-only?

Because Parmana establishes trust through recorded facts, preserving the historical record is essential.

---

# Decision

Evidence SHALL be append-only.

Once an evidence artifact has been recorded, it SHALL NOT be modified or deleted.

Additional evidence MAY be appended to an existing execution record, but previously recorded artifacts SHALL remain unchanged.

---

# Rationale

## Historical Accuracy

Evidence represents facts that occurred during execution.

Historical facts cannot be rewritten without undermining trust.

---

## Auditability

Auditors must be able to inspect the exact evidence that existed at the time of execution.

Allowing modification would make audit conclusions unreliable.

---

## Verification

The Verification Engine depends on stable evidence.

Changing evidence after execution could produce different verification outcomes for the same transaction.

Append-only evidence guarantees deterministic verification.

---

## Replay

Replay reconstructs execution from recorded artifacts.

If artifacts change, replay no longer represents the original execution.

Append-only evidence preserves replay fidelity.

---

## Cryptographic Integrity

Evidence may be protected by hashes, signatures, or integrity chains.

Modifying an existing artifact invalidates those protections.

Appending new evidence preserves the integrity of existing records.

---

# Evidence Lifecycle

```text
Execution
      │
      ▼
Evidence Artifact Created
      │
      ▼
Evidence Recorded
      │
      ▼
Evidence Frozen
      │
      ▼
Optional Additional Evidence
```

Previously recorded artifacts remain unchanged.

---

# Permitted Operations

The following operations are permitted:

- Create evidence.
- Append additional evidence.
- Read evidence.
- Verify evidence.
- Export evidence.
- Archive evidence.

---

# Prohibited Operations

The following operations are prohibited:

- Modify evidence.
- Delete evidence.
- Replace evidence.
- Reorder evidence.
- Rewrite historical artifacts.

Corrections SHALL be represented as new evidence artifacts rather than modifications to existing ones.

---

# Evidence Collection

Evidence is maintained as an ordered immutable collection.

Example:

```text
Evidence
 ├── Artifact 1
 ├── Artifact 2
 ├── Artifact 3
 └── Artifact 4
```

Appending creates:

```text
Evidence
 ├── Artifact 1
 ├── Artifact 2
 ├── Artifact 3
 ├── Artifact 4
 └── Artifact 5
```

Artifacts 1–4 remain unchanged.

---

# Consequences

## Positive

- Preserves historical accuracy.
- Supports deterministic replay.
- Enables reliable verification.
- Simplifies auditing.
- Preserves cryptographic integrity.
- Creates a complete execution history.

---

## Negative

- Storage usage increases over time.
- Incorrect evidence cannot be removed.
- Corrections require additional artifacts.

These trade-offs are acceptable because Parmana prioritizes trustworthy historical records over storage efficiency.

---

# Alternatives Considered

## Mutable Evidence

Rejected because mutable artifacts undermine verification, replay, and cryptographic integrity.

---

## Replace-in-Place Evidence

Rejected because replacing historical artifacts destroys provenance and prevents independent verification.

---

## Versioned Evidence

Rejected because maintaining multiple versions of the same artifact complicates replay and introduces ambiguity regarding which version represents historical truth.

Instead, Parmana models corrections as new evidence linked to earlier artifacts while preserving the original record.

---

# Relationship to Runtime

The Runtime produces evidence but does not modify previously recorded artifacts.

Each execution stage contributes additional facts to the execution record.

---

# Relationship to Verification

The Verification Engine consumes evidence exactly as recorded.

Verification SHALL NOT modify, reorder, or replace evidence artifacts.

Trust is established by evaluating the complete append-only evidence history.

---

# Impact

This decision establishes evidence as a permanent historical record.

Future Storage, Runtime, Verification, SDK, API, and CLI implementations SHALL preserve append-only semantics.

Implementations MAY optimize storage internally, provided the externally observable behavior remains append-only and historical evidence remains intact.

This invariant is fundamental to Parmana's Execution Trust Model and SHALL remain stable unless superseded by a future Architecture Decision Record.
