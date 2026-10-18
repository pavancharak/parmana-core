# Tutorial 23 — Production Deployment

## Overview

This tutorial demonstrates how to configure Parmana for a production environment.

Unlike previous tutorials that focus on Runtime behavior, this tutorial focuses on configuring the Runtime using persistent storage, policy repositories, and environment variables.

The same Runtime programming model is used in development and production.

---

## Production Architecture

```
                 Application
                       │
                       ▼
               RuntimeBuilder
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
 FilePolicyRepository      Trust Record Repository
          │                         │
          ▼                         ▼
     Policy Engine         Persistent Storage
          │                         │
          └────────────┬────────────┘
                       ▼
                    Runtime
                       │
                       ▼
             Execution Trust Record
```

---

## Runtime Configuration

A production Runtime is configured using the same builder API used throughout the tutorial series.

```ts
const runtime = new RuntimeBuilder()
  .withPolicyRepository(policyRepository)
  .build(trustRecords);
```

The Runtime itself does not change between environments.

Only the supporting infrastructure changes.

---

## Policy Repository

Policies are loaded from the configured repository.

```ts
const policyRepository = new FilePolicyRepository("policies");
```

In production, organizations typically version and review policies through their deployment process.

---

## Trust Record Repository

This tutorial uses a repository abstraction.

Development environments may use:

- MemoryExecutionTrustRecordRepository

Production environments typically use a persistent implementation such as:

- SupabaseExecutionTrustRecordRepository

The Runtime code remains unchanged.

---

## Environment Configuration

The included `.env.example` demonstrates typical production configuration.

Example settings include:

- Storage backend
- Policy directory
- Authorization TTL
- Logging
- Runtime environment

Environment-specific values should never be committed with secrets.

---

## Running the Example

```bash
tsx examples/tutorials/23-production-deployment/run.ts
```

or execute the full tutorial suite:

```bash
npm run examples
```

---

## Expected Output

```text
==================================================
Tutorial 23 - Production Deployment
==================================================
Loading production configuration...
✓ Policy Repository configured.
✓ Trust Record Repository configured.
✓ Runtime initialized.
Executing transaction...
✓ APPROVED
Execution Trust Record stored.
Trust Record ID   : ...
Trust Record Hash : ...
==================================================
Production Runtime completed successfully.
==================================================
```

---

## Production Checklist

Before deploying Parmana, verify:

- Policy repository is configured.
- Persistent storage is configured.
- Environment variables are loaded.
- Secrets are stored securely.
- Authorization TTL is configured appropriately.
- Logging is enabled.
- Production policies have been reviewed.

---

## Design Principles

Parmana separates Runtime behavior from deployment configuration.

This provides several advantages:

- The same Runtime code runs in every environment.
- Storage implementations can be replaced without changing business logic.
- Policies remain independently versioned.
- Infrastructure concerns remain outside the Runtime.

---

## Summary

In this tutorial you learned how to:

- Configure a Runtime for production use.
- Configure policy and storage repositories.
- Use environment variables for deployment.
- Separate Runtime behavior from deployment infrastructure.

This separation allows Parmana to move from local development to enterprise production deployments while preserving the same deterministic Runtime programming model.
