# Decision Record: Canonical Policy Language v1.0

**Status:** Accepted

**Date:** 2026-07-04

**Decision Type:** Architecture Decision Record (ADR)

---

# Title

Adopt a Canonical Policy Language for Parmana

---

# Context

The initial implementation of the Policy Engine supported a minimal policy syntax:

```json
{
  "signal": "vendorVerified",
  "equals": true
}
```

and

```json
{
  "signal": "amount",
  "greater\_than": 1000
}
```

This syntax was sufficient for early prototypes but became inadequate as Parmana expanded to support multiple enterprise domains including:

- AI Governance
- Multi-Agent Systems
- Banking
- Healthcare
- DevOps
- Enterprise Security
- Autonomous Systems

The new policy library introduced a richer syntax based on:

```json
{
  "fact": "...",
  "operator": "...",
  "value": ...
}
```

During implementation it became clear that the existing Policy Engine and the new policy library were incompatible.

---

# Decision

Parmana shall adopt a single canonical policy language.

The previous policy syntax using

```json
signal
equals
greater\_than
```

is deprecated and will be removed before v1.0 release.

All policies shall use the canonical format.

---

# Canonical Leaf Condition

Every leaf condition SHALL be represented as

```json
{
  "fact": "riskScore",
  "operator": "lte",
  "value": 25
}
```

---

# Canonical Logical Conditions

AND

```json
{
  "all": \[
    {
      "fact": "toolAllowed",
      "operator": "eq",
      "value": true
    },
    {
      "fact": "riskScore",
      "operator": "lte",
      "value": 25
    }
  ]
}
```

OR

```json
{
  "any": \[
    ...
  ]
}
```

Nested logical conditions are permitted.

---

# Supported Operators (v1)

The Policy Engine SHALL support the following deterministic operators.

| Operator   | Description                            |
| ---------- | -------------------------------------- |
| eq         | equals                                 |
| neq        | not equals                             |
| gt         | greater than                           |
| gte        | greater than or equal                  |
| lt         | less than                              |
| lte        | less than or equal                     |
| in         | value exists within collection         |
| not_in     | value does not exist within collection |
| exists     | fact exists                            |
| not_exists | fact does not exist                    |

Future operators may be added in later schema versions.

---

# Determinism Requirements

Changing the policy language SHALL NOT affect determinism.

The Policy Engine SHALL remain a pure deterministic evaluator.

Given identical

- Policy
- Policy Version
- Schema Version
- Runtime Signals
- Policy Engine Version

the engine SHALL always produce identical

- Decision
- Outcome
- Matched Rule
- Reason
- Evaluation Trace

---

# Determinism Rules

The Policy Engine SHALL NOT

- call LLMs
- call external APIs
- query databases
- use current timestamps
- generate random numbers
- mutate runtime state

Policy evaluation SHALL depend exclusively upon

- Policy
- Runtime Signals

---

# Evaluation Order

Policy evaluation SHALL remain deterministic.

Rules SHALL be evaluated sequentially.

The first matching rule SHALL determine the decision.

---

# Runtime Responsibilities

The Policy Engine SHALL

- evaluate policies
- evaluate logical conditions
- evaluate operators
- return deterministic decisions

The Policy Engine SHALL NOT

- authorize execution
- execute business actions
- invoke AI models
- create trust records
- perform replay
- generate receipts

---

# Engine Refactoring

The engine SHALL be refactored into deterministic stages.

```text
PolicyEngine
    │
    ▼
evaluate()
    │
    ▼
findFirstMatch()
    │
    ▼
evaluateCondition()
    │
    ▼
evaluateLeaf()
    │
    ▼
evaluateOperator()
```

Operator evaluation SHALL be isolated into a dedicated component.

---

# Policy Versioning

Policy versions remain independent of schema versions.

Example

```json
{
  "policyId": "vendor-payment",
  "policyVersion": "2.0.0",
  "schemaVersion": "1.0.0"
}
```

Future language changes SHALL increment

```
schemaVersion
```

rather than policy versions.

---

# Migration

Before Parmana v1.0 release

- migrate all bundled policies
- remove legacy syntax
- remove legacy evaluator
- update SDK examples
- update documentation

No backward compatibility is required because Parmana has no production customers and no public compatibility commitments.

---

# Consequences

## Benefits

- Single policy language
- Consistent SDK examples
- Simpler documentation
- Extensible operator model
- Better readability
- Easier policy authoring
- Enterprise-ready policy framework
- Preserves deterministic replay

## Costs

- One-time migration of bundled policies
- Refactoring of Policy Engine
- Update of policy documentation
- Update of SDK examples

---

# Architecture Principle

> **Policy Language is part of Parmana's public contract.**

>

> The language SHALL remain deterministic, versioned, replayable, auditable, and independent of execution, authorization, and trust record generation.
