# Tutorial 24 — SDK Integration Patterns

## Overview

This tutorial demonstrates the recommended way to integrate Parmana into an application.

Rather than exposing the Runtime throughout the application, Parmana should be encapsulated behind a business-oriented service.

This approach keeps application code independent of Runtime implementation details while centralizing pre-execution authorization.

---

## Recommended Architecture

```
                    Application
                         │
                 Payment Controller
                         │
                         ▼
                  PaymentService
                         │
                         ▼
                 Parmana Runtime
                         │
                         ▼
               Policy Evaluation
                         │
                         ▼
               Execution Decision
                         │
                         ▼
            Execution Trust Record
```

Only the service layer interacts with Parmana.

---

## Why Use a Service Layer?

Instead of calling the Runtime directly from controllers:

```ts
// Avoid

await runtime.execute(transaction);
```

wrap Parmana behind an application service:

```ts
await paymentService.releasePayment(transaction);
```

This keeps business logic independent from Runtime implementation.

---

## Payment Service

The tutorial introduces a simple application service.

```ts
export class PaymentService {
  constructor(private readonly runtime: Runtime) {}
  async releasePayment(transaction: BusinessTransaction) {
    return this.runtime.execute(transaction);
  }
}
```

Application code depends on the service—not on Parmana itself.

---

## Building the Runtime

Infrastructure is configured once.

```ts
const runtime = new RuntimeBuilder()
  .withPolicyRepository(policyRepository)
  .build(repository);
```

The Runtime is then injected into the application service.

---

## Benefits

Separating the Runtime behind a service provides:

- Clear architecture
- Better testability
- Dependency injection
- Easier maintenance
- Centralized governance
- Reusable business services

---

## Running the Example

```bash
tsx examples/tutorials/24-sdk-integration-patterns/run.ts
```

or execute the complete tutorial suite:

```bash
npm run examples
```

---

## Expected Output

```text
==================================================
Tutorial 24 - SDK Integration Patterns
==================================================
Submitting payment request...
✓ Payment released.
Trust Record ID   : ...
Trust Record Hash : ...
==================================================
SDK Integration completed successfully.
==================================================
```

---

## Typical Enterprise Structure

```
src/
├── controllers/
├── services/
│     └── PaymentService.ts
├── runtime/
│     └── RuntimeBuilder.ts
├── repositories/
├── policies/
└── app.ts
```

The Runtime is initialized during application startup and shared with application services.

---

## Design Principles

Parmana should be treated as infrastructure, not business logic.

Business services express application intent.

Parmana provides deterministic policy evaluation, execution authorization, and Execution Trust generation.

This separation keeps application code clean while ensuring every sensitive action is governed consistently.

---

## Summary

In this tutorial you learned how to:

- Integrate Parmana into an application
- Hide Runtime implementation behind a service layer
- Configure Runtime once during application startup
- Keep business logic independent of infrastructure
- Apply a clean, maintainable enterprise architecture

This concludes the tutorial series.

You now have a complete progression from basic Runtime usage through governance, extensibility, execution patterns, production configuration, and enterprise SDK integration.
