# Tutorial 17 — Multi Policy Routing

This tutorial demonstrates how Parmana automatically routes a Business Transaction to the correct policy.

Unlike previous tutorials that focused on a single policy, this example shows that the runtime is completely independent of business policies. The runtime simply loads the policy referenced by the Business Transaction.

## What You Will Learn

- How Policy Routing works.
- How the Runtime locates policies.
- Why Runtime code never changes when new policies are added.
- How Policy References drive deterministic execution.

## Scenario

An enterprise may have hundreds of policies.

For example:

- Vendor Payments
- Purchase Orders
- Customer Refunds
- Production Deployments
- Database Changes
- GitHub Pull Requests

Instead of hardcoding these policies into the runtime, Parmana loads the correct policy at runtime using the Policy Reference contained within the Business Transaction.

## Directory Structure

```text
17-multi-policy-routing/
├── README.md
├── run.ts
└── transaction.json
```

## Policy Routing Flow

```text
Business Transaction
        │
        ▼
Policy Reference
(name + version)
        │
        ▼
Policy Router
        │
        ▼
Load Exact Policy
        │
        ▼
Policy Engine
        │
        ▼
Decision
        │
        ▼
Execution
```

## Policy Reference

Every Business Transaction specifies the exact policy to execute.

```json
{
  "policy": {
    "name": "vendor-payment",
    "version": "2.0.0",
    "schemaVersion": "1.0.0"
  }
}
```

The Runtime does not know anything about vendor payments, purchase orders, or any other business process.

It simply loads the requested policy and executes it.

## Why This Matters

As organizations grow, they continuously introduce new governance policies.

With Parmana:

- New policies are added.
- Existing policies are versioned.
- Old policies remain reproducible.
- The Runtime never changes.

This separation allows the Runtime to remain stable while business authorization logic evolves independently.

## Run

```bash
tsx examples/tutorials/17-multi-policy-routing/run.ts
```

## Expected Output

The example demonstrates:

- Policy loading
- Policy routing
- Deterministic policy evaluation
- Execution Trust Record generation
- Verification
- Receipt generation

## Key Takeaway

The Parmana Runtime is policy-agnostic.

Business Transactions identify the exact policy to execute, the Policy Router loads that policy, and the Runtime executes it without containing any business-specific logic. This architecture enables a single runtime to support hundreds of independently versioned enterprise policies.
