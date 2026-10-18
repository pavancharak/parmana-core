# Tutorial 14 — Custom Policy

This tutorial demonstrates how to create and execute a **custom Parmana policy** without modifying the Parmana runtime.

Instead of changing the runtime or policy engine, we introduce a new business policy named **high-value-payment** that extends the existing vendor payment authorization rules.

## What You Will Learn

- Create a new policy from an existing policy.
- Add new runtime signals.
- Introduce new business authorization rules.
- Execute a Business Transaction using a custom policy.
- Keep the runtime completely unchanged.

This demonstrates one of Parmana's core design principles:

> Enterprise business rules belong in policies, not in application code.

## Scenario

A company introduces a new governance requirement:

> Any vendor payment greater than **USD 10,000** must be approved by a **Finance Director** before execution.

Rather than changing Parmana's runtime, a new policy is authored.

The runtime automatically loads the requested policy and evaluates it deterministically.

## Directory Structure

```text
14-custom-policy/
├── README.md
├── run.ts
├── transaction.json
└── policies/
    └── high-value-payment/
        └── 1.0.0/
            └── policy.json
```

## Runtime Flow

```text
Business Transaction
        │
        ▼
Policy Router
        │
        ▼
High Value Payment Policy
        │
        ▼
Policy Engine
        │
        ▼
Decision
        │
        ▼
Execution Authorization
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

## New Business Rule

The custom policy introduces a new runtime signal:

```text
financeDirectorApproved
```

The policy authorizes execution only when:

- Vendor is verified.
- Invoice is verified.
- Payment is approved.
- Funds are available.
- Risk score is acceptable.
- Payment amount is greater than USD 10,000.
- Finance Director approval is present.

If the Finance Director approval is missing, the policy rejects the transaction before execution.

## Run

```bash
tsx examples/tutorials/14-custom-policy/run.ts
```

## Expected Output

The example produces:

- Approved Decision
- Execution Authorization
- Execution Trust Record
- Verification Result
- Cryptographically signed Receipt

## Key Takeaway

Parmana separates **business policy** from **runtime infrastructure**.

New governance requirements are implemented by authoring new policies rather than changing runtime code, allowing organizations to evolve authorization rules while preserving deterministic execution, reproducibility, and cryptographic verification.
