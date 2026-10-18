# Tutorial 15 — Custom Runtime Component

This tutorial demonstrates how to extend the Parmana Runtime by implementing a custom **Runtime Component**.

Unlike the previous tutorial, which customized authorization logic through a Policy, this tutorial customizes the Runtime itself without modifying Parmana's core implementation.

## What You Will Learn

- Implement a custom `RuntimeComponent`.
- Access the `RuntimeContext`.
- Observe runtime execution.
- Register custom components using `RuntimeBuilder`.
- Execute the runtime with custom stages.

This demonstrates one of Parmana's core architectural principles:

> Runtime behavior is extensible through components, not by modifying the runtime engine.

## Scenario

Many organizations need additional runtime behavior, including:

- Logging
- Metrics
- Notifications
- Distributed tracing
- Security monitoring
- Compliance checks

Rather than modifying Parmana's runtime, developers implement their own Runtime Components and register them in the Runtime Pipeline.

This tutorial implements a simple logging component.

## Directory Structure

```text
15-custom-runtime-component/
├── README.md
├── run.ts
├── transaction.json
└── LoggingRuntimeComponent.ts
```

## Runtime Flow

```text
Business Transaction
        │
        ▼
Policy Evaluation
        │
        ▼
Execution Authorization
        │
        ▼
Logging Runtime Component
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

## Logging Component

The custom component observes the Runtime Context and prints:

- Business Transaction ID
- Policy
- Action
- Target

The Runtime Context is returned unchanged so the remaining runtime stages continue normally.

## Registering the Component

The component is registered using the Runtime Builder.

```ts
new RuntimeBuilder()
  .withPolicyRepository(policyRepository)
  .addStage(new LoggingRuntimeComponent())
  .build(...);
```

The Runtime Pipeline automatically executes the component during runtime execution.

## Run

```bash
tsx examples/tutorials/15-custom-runtime-component/run.ts
```

## Expected Output

The example produces:

- Logging Runtime Component output
- Execution Trust Record
- Verification
- Receipt

## Key Takeaway

Policies define **what** business actions are authorized.

Runtime Components define **how** the runtime behaves while processing authorized transactions.

By separating business authorization from runtime behavior, Parmana allows organizations to extend execution pipelines without modifying the runtime engine itself.
