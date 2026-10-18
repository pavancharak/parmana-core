# Parmana TypeScript SDK

The official TypeScript SDK for **Parmana**.

Parmana ensures that only Parmana-approved actions are executed.

Parmana is an **Execution Trust Infrastructure** for AI systems.

It ensures that autonomous systems execute **only policy-compliant actions** and produces cryptographically verifiable evidence for every execution.

---

# Why Parmana?

Modern AI systems can make decisions autonomously, but organizations need assurance that those decisions comply with business policies before execution.

Parmana provides that assurance.

Using Parmana, organizations can:

- Execute only policy-compliant actions
- Produce verifiable execution evidence
- Build an auditable authorization-to-execution trust chain
- Independently verify every execution
- Support governance and regulatory compliance

---

# Core Principle

Parmana does not execute business actions.

Parmana authorizes execution.

Only Parmana-approved actions are executed.

---

# Architecture

```
Application
      │
      ▼
Parmana TypeScript SDK
      │
      ▼
Parmana Runtime
      │
      ▼
Execution Trust Infrastructure
      │
      ▼
Execution Trust Record
      │
      ▼
Independent Verification
```

---

# Installation

```bash
npm install @parmana/sdk
```

---

# Quick Start

```typescript
import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://runtime.example.com",
  apiKey: process.env.PARMANA_API_KEY,
});
```

---

# Runtime Health

```typescript
const health = await client.health();
```

---

# Execute

```typescript
const trustRecord = await client.execute(transaction);
```

The Runtime:

1. Loads the requested policy.
2. Evaluates policy deterministically.
3. Produces a Decision.
4. Enforces execution approval.
5. Executes the Runtime Pipeline.
6. Produces an Execution Trust Record.

---

# Verify

```typescript
const verification = await client.getLatestVerification(
  trustRecord.businessTransactionId,
);
```

Verification independently validates the Execution Trust Record.

---

# Replay

```typescript
const replay = await client.replay(trustRecord.businessTransactionId);
```

`replay()` checks the stored Trust Record's hash and signature again and returns the result (`POST /replay`). It does not evaluate the policy again and executes nothing.

---

# Validate Policy

```typescript
const result = await client.validatePolicy("customer-refund", "1.2.0");
// { valid: true, errors: [] }
```

Checks that the named policy version can be loaded by the server. It does not take a policy document.

---

# Policy Governance (1.3.0)

A policy decides nothing until two different people have approved it. One proposes, the other approves with a step up signature made on their own machine:

```typescript
import { readFileSync } from "node:fs";
import { signPolicyChangeStepUp } from "@parmana/sdk";

const change = await proposer.proposePolicyChange("customer-refund", "1.3.0", {
  proposedContent: policyJson,
  reason: "Adopt the customer-refund policy.",
});

const stepUp = signPolicyChangeStepUp({
  pendingPolicyChangeId: change.pendingPolicyChangeId,
  action: "approve",
  privateKeyPem: readFileSync("step-up.private.pem", "utf8"),
  keyId: "bob",
});

await approver.approvePolicyChange(change.pendingPolicyChangeId, stepUp);
```

Also: `policyChanges(status?)` to review, `rejectPolicyChange(id, reason, stepUp)`.

---

# Offline Verification (1.3.0)

```typescript
import { verifyExecutionTrustRecordOffline } from "@parmana/sdk";

const { pem } = await client.publicKey("default");
const result = verifyExecutionTrustRecordOffline(await client.trustRecord(id), {
  default: pem,
});
// result.valid === true
```

No network call: only the record and the public key. `verifyExecutionIntentOffline()` does the same for an Execution Intent.

---

# SDK Architecture

```
ParmanaClient
│
├── HealthApi
├── ExecutionApi
├── VerificationApi
├── ReplayApi
├── ReceiptApi
├── TransactionApi
├── TrustRecordApi
├── PolicyApi            (validation and governance)
├── RefusalApi
├── ExecutionIntentApi
├── AuditApi
└── CallerApi            (caller identity and public keys, 1.3.0)
```

Every operation and its Python equivalent: https://docs.parmanasystems.com/sdks/api-coverage

The client is intentionally small.

Each API encapsulates a single Parmana capability.

---

# Canonical Domain Model

The SDK re-exports the canonical Parmana domain model from `@parmana/shared`.

Core artifacts include:

- Authority
- Authorization
- Intent
- PolicyReference
- BusinessTransaction
- Decision
- Execution
- ExecutionEvidence
- ExecutionTrustRecord
- Verification
- Receipt
- Override

The SDK does not redefine these models.

---

# Error Handling

All SDK exceptions inherit from:

```typescript
ParmanaError;
```

Common errors include:

- ConfigurationError
- ValidationError (400)
- AuthenticationError (401)
- AuthorizationError (403, with the server's code on `serverCode`, for example `CAPABILITY_NOT_ALLOWED`)
- ExecutionRejectedError (403 `POLICY_DENIED`)
- NotFoundError (404)
- ConflictError (409)
- RateLimitError (429, with `retryAfterSeconds`)
- VerificationError
- ReplayError
- NetworkError
- TimeoutError
- InternalServerError

---

# Configuration

```typescript
const client = new ParmanaClient({
  endpoint: "https://runtime.example.com", // required
  apiKey: process.env.PARMANA_API_KEY, // sent as Authorization: Bearer <apiKey>
  timeout: 120_000, // milliseconds
  // retryPolicy, userAgent and transport are optional
});
```

The SDK configuration controls communication with the Parmana Runtime. It does not control policy evaluation or runtime behavior.

Every route except the health, readiness, documentation and public verification routes needs an API key. A request without one gets `401`.

---

# Examples

See the `examples/` directory.

- Runtime Health
- Execute
- Verify
- Replay
- Policy Validation

---

# Documentation

The complete SDK documentation is at https://docs.parmanasystems.com/sdks/typescript, and every operation with its Python equivalent is at https://docs.parmanasystems.com/sdks/api-coverage.

---

# License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). This SDK is a client: it needs a Parmana server, which is licensed separately. Licensing inquiries: founder@parmanasystems.com

---

# About Parmana

Parmana is an Execution Trust Infrastructure for autonomous and AI systems.

It establishes a cryptographically verifiable trust chain linking:

Authority → Authorization → Intent → Policy → Decision → Execution → Evidence → Verification

This enables organizations to confidently deploy AI in high-impact workflows while maintaining governance, auditability, and independent verification.
