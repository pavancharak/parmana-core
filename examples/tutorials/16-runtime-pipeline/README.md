# Tutorial 16 — Runtime Pipeline

This tutorial demonstrates how to build a custom **Runtime Pipeline** by composing multiple Runtime Components.

Rather than extending the runtime with a single component, Parmana allows developers to assemble deterministic processing pipelines by registering multiple components in a specific order.

## What You Will Learn

- Build a Runtime Pipeline.
- Register multiple Runtime Components.
- Understand Runtime Component ordering.
- Observe Runtime Context flowing through the pipeline.
- Build custom runtime behavior without modifying Parmana.

## Scenario

An enterprise wants every execution to perform three additional runtime tasks:

1. Log execution details.
2. Record runtime metrics.
3. Send execution notifications.

Instead of changing Parmana's runtime, the organization builds a custom Runtime Pipeline.

## Directory Structure

```text
16-runtime-pipeline/
├── README.md
├── run.ts
├── transaction.json
├── LoggingComponent.ts
├── MetricsComponent.ts
└── NotificationComponent.ts
```

## Pipeline

```text
Business Transaction
        │
        ▼
Policy Evaluation
        │
        ▼
Logging Component
        │
        ▼
Metrics Component
        │
        ▼
Notification Component
        │
        ▼
Execution
        │
        ▼
Verification
        │
        ▼
Receipt
```

Each Runtime Component receives the same immutable Runtime Context.

A component may:

- Observe the Runtime Context.
- Record metrics.
- Produce logs.
- Send notifications.
- Enrich metadata.
- Perform additional validation.

The Runtime Context is then passed to the next component.

## Registering Components

The Runtime Pipeline is built using the Runtime Builder.

```ts
const runtime =
  new RuntimeBuilder()
    .withPolicyRepository(policyRepository)
    .addStage(new LoggingComponent())
    .addStage(new MetricsComponent())
    .addStage(new NotificationComponent())
    .build(...);
```

Components execute in the same order they are registered.

## Why Pipelines?

Pipelines make runtime behavior composable.

Organizations can introduce new functionality without modifying Parmana's runtime implementation.

Common pipeline stages include:

- Logging
- Metrics
- Distributed Tracing
- Notifications
- Audit Enrichment
- Compliance Validation
- Security Monitoring
- Rate Limiting

## Run

```bash
tsx examples/tutorials/16-runtime-pipeline/run.ts
```

## Expected Output

The example demonstrates:

- Logging Component execution
- Metrics Component execution
- Notification Component execution
- Execution Trust Record generation
- Verification
- Receipt generation

## Key Takeaway

Parmana's runtime is a deterministic processing pipeline.

Organizations extend runtime behavior by composing Runtime Components rather than modifying the runtime engine itself. This approach keeps the core runtime stable while allowing enterprise-specific behavior to be added through reusable pipeline stages.
