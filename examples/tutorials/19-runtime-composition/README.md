# Tutorial 19 — Runtime Composition

## Overview

This tutorial demonstrates how to compose a Parmana Runtime from reusable building blocks.

Instead of creating a monolithic Runtime, Parmana encourages composing small, focused components that each have a single responsibility.

In this tutorial, the Runtime is composed from:

- Policy Repository
- Runtime Component
- Logging Hook
- Metrics Hook

---

## Runtime Composition

```
Business Transaction
        │
        ▼
Policy Repository
        │
        ▼
Runtime Hooks
        │
        ▼
Runtime Components
        │
        ▼
Execution Trust Record
```

Each piece has a dedicated responsibility and can be reused across multiple Runtime configurations.

---

## Components Used

### Policy Repository

Responsible for loading the correct policy version.

```ts
new FilePolicyRepository("policies");
```

---

### Runtime Component

Runtime Components participate in execution.

Typical responsibilities include:

- Runtime enrichment
- Validation
- Metadata generation
- Custom execution logic

```ts
.addStage(
    new CustomRuntimeComponent(),
)
```

---

### Runtime Hooks

Hooks observe Runtime execution.

Typical responsibilities include:

- Logging
- Metrics
- Tracing
- Notifications
- Auditing

Hooks must never modify Runtime state.

```ts
.addHook(
    new LoggingHook(),
)
.addHook(
    new MetricsHook(),
)
```

---

## Building the Runtime

```ts
const runtime = new RuntimeBuilder()
  .withPolicyRepository(new FilePolicyRepository("policies"))
  .addStage(new CustomRuntimeComponent())
  .addHook(new LoggingHook())
  .addHook(new MetricsHook())
  .build(repository);
```

---

## Runtime Components vs Runtime Hooks

| Runtime Components                  | Runtime Hooks                           |
| ----------------------------------- | --------------------------------------- |
| Participate in execution            | Observe execution                       |
| May enrich Runtime Context          | Must not modify Runtime Context         |
| Change Runtime behaviour            | Record Runtime behaviour                |
| Execute within the Runtime Pipeline | Execute alongside the Runtime lifecycle |

---

## Running the Example

```bash
tsx examples/tutorials/19-runtime-composition/run.ts
```

---

## Expected Output

```text
==================================================
Tutorial 19 - Runtime Composition
==================================================
\[Hook] Loading policy...
\[Metrics] Policy Load: 1.12 ms
\[Hook] Evaluating policy...
\[Metrics] Policy Evaluation: 0.38 ms
\[Component] Enriching execution metadata.
\[Hook] Runtime pipeline completed.
==================================================
Execution Complete
==================================================
Runtime successfully composed from:
✓ Policy Repository
✓ Runtime Component
✓ Logging Hook
✓ Metrics Hook
Tutorial completed successfully.
```

---

## Design Principles

Parmana promotes composition over inheritance.

Each Runtime capability is implemented as an independent building block that can be combined as needed.

This approach provides:

- Reusable Runtime configurations
- Clear separation of responsibilities
- Easier testing
- Simpler maintenance
- Enterprise extensibility

---

## Summary

In this tutorial you learned how to compose a Runtime from reusable components rather than embedding all behavior into a single implementation.

This composition model enables organizations to build Runtime configurations tailored to their governance, compliance, and operational requirements while keeping each extension focused and maintainable.
