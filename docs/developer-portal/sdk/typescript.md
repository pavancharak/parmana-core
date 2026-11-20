# TypeScript SDK: `@parmana/sdk`

[SDKs](README.md) · [Full method index](typescript-method-index.md) · [Python SDK](python.md) · [Offline verifier](verifier.md)

> **About the code on this page.** Blocks marked as methods, builders and signing show the call shape. Fragments such as an undefined `approval` or `record` are **illustrative**, not runnable on their own. The runnable versions are the examples linked under [Examples](#examples) (governed-flow.ts, declare-then-execute.ts and limits.ts), which were run for this portal.

## Package

|                    |                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package            | `@parmana/sdk`                                                                                                                                                                  |
| Version documented | 4.1.1 (npm)                                                                                                                                                                     |
| Purpose            | Client for the Parmana API: declare and execute Business Transactions, read and verify Execution Trust Records, manage policy and approval changes, and verify records offline. |
| Module format      | ES modules (`"type": "module"`). Use `import`, or `await import()` from CommonJS.                                                                                               |
| Runtime            | Node.js 24 or later (`engines.node >=24`). Uses the built-in `fetch`.                                                                                                           |
| Other environments | Not verified. The SDK uses `node:crypto`, so it is intended for Node.js and server-side code. Browser use is not documented.                                                    |
| Dependencies       | `dotenv` (runtime)                                                                                                                                                              |

## Install

```bash
npm install @parmana/sdk@4.1.1
```

Check the install and the exports:

```bash
node --input-type=module -e "import('@parmana/sdk').then(m => console.log(m.VERSION, typeof m.ParmanaClient))"
# 4.1.1 function
```

## Initialize the client

```typescript
import { ParmanaClient } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana.example.com", // or http://localhost:3000 for local development
  apiKey: process.env.PARMANA_API_KEY, // the caller's raw API key
  timeout: 30_000, // optional, milliseconds
});
```

The constructor throws `ConfigurationError` if `endpoint` is missing. It also throws a plain `Error` if the endpoint is not an absolute URL, is not `https://` (except `localhost`, `127.0.0.1`, `[::1]`), or contains credentials. The API key is kept out of `console.log` and `JSON.stringify`: printing the client shows only the endpoint.

`ParmanaClient` is immutable after construction. Create one per endpoint and key, and reuse it.

## Configuration

The `Configuration` interface (`import type { Configuration } from "@parmana/sdk"`):

| Field         | Type          | Required | Default         | Meaning                                                                                                                                      |
| ------------- | ------------- | -------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoint`    | `string`      | yes      | none            | Base URL of the Parmana API. Must be `https://`, or `http://` for loopback only.                                                             |
| `apiKey`      | `string`      | no       | none            | Caller's raw API key, sent as `Authorization: Bearer <key>`. Required for every route except health, readiness and the documentation routes. |
| `timeout`     | `number`      | no       | `30000`         | Milliseconds to wait for each request.                                                                                                       |
| `retryPolicy` | `RetryPolicy` | no       | retries off     | See below.                                                                                                                                   |
| `transport`   | `Transport`   | no       | `HttpTransport` | Replace the HTTP layer, for example to add tracing or to test.                                                                               |
| `userAgent`   | `string`      | no       | SDK default     | Sent with each request.                                                                                                                      |

### Retries

`RetryPolicy` has `enabled`, `maxAttempts`, `initialDelayMs` (default 1000), `maxDelayMs`, and `strategy` (`RetryStrategy.FIXED` or `RetryStrategy.EXPONENTIAL`). Retries are **off by default** (`maxAttempts` defaults to 0).

The transport retries only `GET` requests. It never retries a `POST`, so an execution is not repeated by the SDK. Keep it that way in your code: retrying `execute` with the same `businessTransactionId` returns `409 Conflict`, and retrying with a new id creates a second execution.

```typescript
import { ParmanaClient, RetryStrategy } from "@parmana/sdk";

const client = new ParmanaClient({
  endpoint: "https://parmana.example.com",
  apiKey: process.env.PARMANA_API_KEY,
  retryPolicy: {
    enabled: true,
    maxAttempts: 3,
    initialDelayMs: 500,
    strategy: RetryStrategy.EXPONENTIAL,
  },
});
```

## Exports

Everything below is exported from `@parmana/sdk`. The full list is generated from the package's `index.ts`.

| Group                       | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client                      | `ParmanaClient`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Version                     | `VERSION`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Configuration and transport | `Configuration`, `RetryPolicy`, `RetryStrategy`, `Transport`, `TransportRequest`, `TransportResponse`, `HttpTransport`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Builder                     | `createBusinessTransaction`, `CreateBusinessTransactionOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Domain model                | Every type in `src/models` (for example `BusinessTransaction`, `ExecutionTrustRecord`, `Verification`, `Receipt`, `RefusalRecord`, `ExecutionIntent`, `PolicyInEffect`, `CallerIdentity`, `PublicKeyInfo`, `ApprovalIssuer`, `AuthorityGrant`, `PendingPolicyChange`)                                                                                                                                                                                                                                                                                   |
| Errors                      | `ParmanaError`, `ConfigurationError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `ExecutionRejectedError`, `ExecutionPendingError`, `InternalServerError`, `NetworkError`, `RateLimitError`, `ReplayError`, `TimeoutError`, `VerificationError`                                                                                                                                                                                                                                                  |
| Offline checks and signing  | `verifyExecutionTrustRecordOffline`, `verifyExecutionIntentOffline`, `OfflineVerificationResult`, `PublicKeys`, `signApproval`, `SignApprovalInput`, `SignedApproval`, `ApprovalPayload`, `ApprovalScope`, `ApprovalScopeComparator`, `DEFAULT_APPROVAL_TTL_SECONDS`, `MAX_APPROVAL_TTL_SECONDS`, `signPolicyChangeStepUp`, `SignPolicyChangeStepUpInput`, `canonicalSerialize`, `verifyParmanaRelease`, `ParmanaRelease`, `ParmanaReleaseCondition`, `ParmanaReleaseVerification`, `VerifyParmanaReleaseOptions`, `DEFAULT_RELEASE_CLOCK_SKEW_SECONDS` |
| Sub-APIs                    | `HealthApi`, `ExecutionApi`, `VerificationApi`, `ReplayApi`, `PolicyV2Api`, `PolicyApi`, `PolicyValidationResult`, `ReceiptApi`, `TransactionApi`, `TrustRecordApi`, `RefusalApi`, `ExecutionIntentApi`, `AuditApi`, `CallerApi`, `ApproverApi`, `ExternalConnectorApi`, `BusinessSignalSourceApi`, `AuthorityGrantApi`                                                                                                                                                                                                                                 |

The sub-API classes are exported, but `ParmanaClient` composes them internally and does not expose them as properties. Call the methods on `ParmanaClient`. Use the exported classes only if you are writing your own transport on top of the SDK.

## Methods

`ParmanaClient` has 58 public methods. The complete table, with exact signatures and the HTTP request each one sends, is in the [generated method index](typescript-method-index.md). The table below groups them by task.

### Health and identity

| Method              | Returns                   | Request                                                                                                 |
| ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `health()`          | `Promise<HealthStatus>`   | `GET /health`                                                                                           |
| `version()`         | `Promise<unknown>`        | `GET /version`. Returns the server's response, not the SDK version.                                     |
| `endpoint()`        | `string`                  | Local. Returns the configured endpoint.                                                                 |
| `caller()`          | `Promise<CallerIdentity>` | `GET /callers/me`                                                                                       |
| `publicKey(keyId?)` | `Promise<PublicKeyInfo>`  | `GET /keys/{keyId}`. Default `keyId` is `"default"`. The result has `pem`, `algorithm`, `keyId`, `use`. |

### Declare, execute and read Business Transactions

| Method                                               | Returns                            | Request                                                                               |
| ---------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| `execute(transaction)`                               | `Promise<ExecutionTrustRecord>`    | `POST /execute`. Decides and, if approved, releases in one call.                      |
| `createTransaction(transaction)`                     | `Promise<ExecutionTrustRecord>`    | Declares then executes: `POST /transactions`, then `POST /transactions/{id}/execute`. |
| `declareTransaction(transaction)`                    | `Promise<DeclaredTransaction>`     | `POST /transactions`. Records `RECEIVED`. Decides nothing.                            |
| `executeTransaction(businessTransactionId)`          | `Promise<ExecutionTrustRecord>`    | `POST /transactions/{id}/execute`                                                     |
| `transactionStatus(businessTransactionId, options?)` | `Promise<TransactionStatusResult>` | `GET /transactions/{id}/status`. `options.history: true` includes the event history.  |
| `reconcileTransaction(businessTransactionId)`        | `Promise<ReconcileResult>`         | `POST /transactions/{id}/reconcile`. Use after a `202` or `502`.                      |
| `transaction(businessTransactionId)`                 | `Promise<BusinessTransaction>`     | `GET /transactions/{id}`                                                              |
| `transactions(page?, pageSize?)`                     | `Promise<BusinessTransaction[]>`   | `GET /transactions?page=&pageSize=`. Defaults: page 1, size 25.                       |

### Verify, replay and receipts

| Method                                         | Returns                           | Request                                                                     |
| ---------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `verify(businessTransactionId)`                | `Promise<Verification>`           | `POST /verify`. Read `status` (`VERIFIED` or `FAILED`).                     |
| `getLatestVerification(businessTransactionId)` | `Promise<Verification>`           | `GET /verification/{id}`                                                    |
| `replay(businessTransactionId)`                | `Promise<ReplayResult>`           | `POST /replay`. Read `verified`.                                            |
| `receipt(businessTransactionId)`               | `Promise<Receipt>`                | `POST /receipt`. Requires a `VERIFIED` record.                              |
| `latestReceipt(businessTransactionId)`         | `Promise<Receipt>`                | `GET /receipt/latest/{id}`                                                  |
| `trustRecord(businessTransactionId)`           | `Promise<ExecutionTrustRecord>`   | `GET /trust-records/{id}`                                                   |
| `trustRecords(page?, pageSize?, options?)`     | `Promise<ExecutionTrustRecord[]>` | `GET /trust-records`. `options` takes `since` and `until` (ISO timestamps). |
| `refusalRecord(businessTransactionId)`         | `Promise<RefusalRecord>`          | `GET /refusal/{id}`                                                         |
| `verifyRefusalRecord(record)`                  | `Promise<boolean>`                | `POST /refusal/verify`                                                      |
| `verifyAuditEvent(event, signature)`           | `Promise<boolean>`                | `POST /audit/verify`                                                        |

### Policy in effect and validation

| Method                                    | Returns                           | Request                                                                                                                                           |
| ----------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policyInEffect(capability)`              | `Promise<PolicyInEffect>`         | `GET /policies/in-effect?capability=`. Returns the policy bound to a capability. A capability with no binding returns `404 CAPABILITY_NOT_BOUND`. |
| `validatePolicy(policyId, policyVersion)` | `Promise<PolicyValidationResult>` | `POST /policies/validate`. Returns `{ valid, errors }`. It checks the named version as stored, not a document you pass in.                        |

### Policy changes (maker-checker)

| Method                                                                | Returns                            | Request                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `proposePolicyChange(name, version, input)`                           | `Promise<ProposedPolicyChange>`    | `POST /policies/{name}/{version}/pending-changes`. `input` has `proposedContent` and `reason`. |
| `policyChanges(status?)`                                              | `Promise<PolicyChangeForReview[]>` | `GET /policies/pending-changes?status=`                                                        |
| `approvePolicyChange(pendingId, stepUpAuthorization)`                 | `Promise<PendingPolicyChange>`     | `POST /policies/pending-changes/{id}/approve`. Checker only.                                   |
| `rejectPolicyChange(pendingId, rejectionReason, stepUpAuthorization)` | `Promise<PendingPolicyChange>`     | `POST /policies/pending-changes/{id}/reject`. Checker only.                                    |

Approver, external-connector, business-signal-source and authority-grant changes follow the same pattern: `propose…Change`, `…Changes(status?)`, `approve…Change(changeId, stepUpAuthorization)` and `reject…Change(changeId, reason, stepUpAuthorization)`. The approver methods are `approvers()`, `proposeApproverChange`, `approverChanges`, `approveApproverChange` and `rejectApproverChange`. Their endpoints are in the [method index](typescript-method-index.md).

The maker-checker flow, with the step-up signature, is in the [maker-checker tutorial](../tutorials/maker-checker.md).

### Execution intents (experimental)

`executionIntent`, `verifyExecutionIntent`, `unfinalizedExecutionIntents`, `finalizeExecutionIntent` and `resolveExecutionIntent` call the `/execution-intents` routes (ADR-0012). The server reports `executionIntentsConfigured: false` unless the deployment enables execution intents, so treat these as **Experimental** and do not rely on them without a test against your deployment.

### Policy v2 (experimental, opt-in)

`decidePolicyV2`, `policyV2Review`, `decidePolicyV2Review` and `policyV2Replay` call `/v2/...` routes. These routes are not in the OpenAPI document. The server mounts them only when `PARMANA_POLICY_V2_DECISIONS` and its related settings are set (see [Environment variables](../reference/environment-variables.md)). Without them the routes return `404`. Status: **Experimental**.

## Governance changes: every method

These methods cover the approver, external-connector, business-signal-source and authority-grant changes. Each follows the policy-change pattern: a `propose…Change` method, a `…Changes(status?)` list, and `approve…Change` and `reject…Change` for the checker, which take a step-up envelope. The table lists each one, with the request it sends. Like the policy methods above, the approve and reject calls need a human checker and a step-up envelope.

| Method                              | HTTP | Path                                               | Signature                                                                                                                                                              |
| ----------------------------------- | ---- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `externalConnectors`                | GET  | `/external-connectors`                             | externalConnectors(): Promise<ExternalConnector[]>                                                                                                                     |
| `proposeExternalConnectorChange`    | POST | `/external-connectors/changes`                     | proposeExternalConnectorChange(input: ProposeExternalConnectorChangeInput): Promise<ExternalConnectorChange>                                                           |
| `externalConnectorChanges`          | GET  | `/external-connectors/changes`                     | externalConnectorChanges(status?: PendingPolicyChangeStatus): Promise<ExternalConnectorChange[]>                                                                       |
| `approveExternalConnectorChange`    | POST | `/external-connectors/changes/{param}/approve`     | approveExternalConnectorChange(changeId: string, stepUpAuthorization: PolicyChangeStepUpAuthorization): Promise<ExternalConnectorChange>                               |
| `rejectExternalConnectorChange`     | POST | `/external-connectors/changes/{param}/reject`      | rejectExternalConnectorChange(changeId: string, rejectionReason: string, stepUpAuthorization: PolicyChangeStepUpAuthorization): Promise<ExternalConnectorChange>       |
| `businessSignalSources`             | GET  | `/business-signal-sources`                         | businessSignalSources(): Promise<BusinessSignalSource[]>                                                                                                               |
| `proposeBusinessSignalSourceChange` | POST | `/business-signal-sources/changes`                 | proposeBusinessSignalSourceChange(input: ProposeBusinessSignalSourceChangeInput): Promise<BusinessSignalSourceChange>                                                  |
| `businessSignalSourceChanges`       | GET  | `/business-signal-sources/changes`                 | businessSignalSourceChanges(status?: PendingPolicyChangeStatus): Promise<BusinessSignalSourceChange[]>                                                                 |
| `approveBusinessSignalSourceChange` | POST | `/business-signal-sources/changes/{param}/approve` | approveBusinessSignalSourceChange(changeId: string, stepUpAuthorization: PolicyChangeStepUpAuthorization): Promise<BusinessSignalSourceChange>                         |
| `rejectBusinessSignalSourceChange`  | POST | `/business-signal-sources/changes/{param}/reject`  | rejectBusinessSignalSourceChange(changeId: string, rejectionReason: string, stepUpAuthorization: PolicyChangeStepUpAuthorization): Promise<BusinessSignalSourceChange> |
| `authorityGrants`                   | GET  | `/authority-grants`                                | authorityGrants(): Promise<AuthorityGrant[]>                                                                                                                           |
| `proposeAuthorityGrantChange`       | POST | `/authority-grants/changes`                        | proposeAuthorityGrantChange(input: ProposeAuthorityGrantChangeInput): Promise<AuthorityGrantChange>                                                                    |
| `authorityGrantChanges`             | GET  | `/authority-grants/changes`                        | authorityGrantChanges(status?: PendingPolicyChangeStatus): Promise<AuthorityGrantChange[]>                                                                             |
| `approveAuthorityGrantChange`       | POST | `/authority-grants/changes/{param}/approve`        | approveAuthorityGrantChange(changeId: string, stepUpAuthorization: PolicyChangeStepUpAuthorization): Promise<AuthorityGrantChange>                                     |
| `rejectAuthorityGrantChange`        | POST | `/authority-grants/changes/{param}/reject`         | rejectAuthorityGrantChange(changeId: string, rejectionReason: string, stepUpAuthorization: PolicyChangeStepUpAuthorization): Promise<AuthorityGrantChange>             |

## Builder: `createBusinessTransaction`

The builder creates the nested request and keeps the ids that the server checks for consistency in step. Use it instead of writing the five objects by hand.

```typescript
import {
  createBusinessTransaction,
  type CreateBusinessTransactionOptions,
} from "@parmana/sdk";

const options: CreateBusinessTransactionOptions = {
  principalId: "alice@example.com", // the person or service the action is for
  purpose: "Vendor payment approval", // why the authority exists
  action: "payments:refund", // the capability, format namespace:name
  target: "vendor/V-100", // the resource the action acts on
  parameters: { amount: 4500, currency: "USD" },
  policy: { name: "vendor-payment", version: "2.1.0", schemaVersion: "1.0.0" },
  signals: {/* facts the policy reads; see Policy management */},
  // optional:
  businessTransactionId: undefined, // a UUID; generated when omitted
  authorityType: "SERVICE", // "USER" | "ROLE" | "SERVICE" | "ORGANIZATION"
  displayName: "Accounts payable agent",
  correlationId: "order-7731",
  tenantId: undefined,
  sourceSystem: "ap-automation",
  submittedBy: "ap-automation",
};

const transaction = createBusinessTransaction(options);
```

Each of the following is checked by the server (`400`), and the builder keeps them equal:

- `metadata.businessTransactionId` equals `businessTransactionId`.
- `authorization.authorityId` equals `authority.authorityId`.
- `intent.authorizationId` equals `authorization.authorizationId`.
- `policy.name`, `policy.version` and `intent.action` are non-empty.

The full schema is `schemas/requests/transaction-create-request.schema.json` in the repository.

## Human approvals: `signApproval`

The approver signs on the approver's own machine. The agent attaches the result to `signals.approvalArtifact` and sets `signals.humanApproved` to `true`.

```typescript
import { readFileSync } from "node:fs";
import { signApproval } from "@parmana/sdk";

const approval = signApproval({
  privateKeyPem: readFileSync("approver.private.pem", "utf8"), // stays with the approver
  approverId: "finance-approver-1", // as registered on the server
  keyId: "finance-approver-key-1", // as registered on the server
  capability: "payments:refund", // must match intent.action
  resourceId: "vendor/V-100", // must match the target the policy names
  maxAmount: 5000, // optional: the largest amount approved
  ttlSeconds: 900, // optional: default 900, at most 86400
});
```

- Without `maxAmount`, the approval names exactly `resourceId`. With `maxAmount`, it approves any amount up to that value on that resource, under the policy's `approvalSignals` value path.
- An approval is usable once. A second use is refused (tutorial 129 shows the refusal in its own run).
- `signApproval` throws if `ttlSeconds` is not a whole number from 1 to 86400, if `capability` does not match `namespace:name`, if `resourceId` is empty, or if the key is not Ed25519.

## Policy change step-up: `signPolicyChangeStepUp`

The checker signs a step-up envelope locally and sends it with their own API key.

```typescript
import { readFileSync } from "node:fs";
import { signPolicyChangeStepUp } from "@parmana/sdk";

const envelope = signPolicyChangeStepUp({
  pendingPolicyChangeId: "f3bce0b6-1095-492c-a06e-9cb27253bbce",
  action: "approve", // or "reject"
  privateKeyPem: readFileSync("checker-stepup.private.pem", "utf8"),
  keyId: "checker-step-up-key", // a label; the server checks the signature
  ttlSeconds: 120, // optional
});
```

The envelope is valid for a short time (the default is 120 seconds). Sign it immediately before you submit it.

## Offline verification: `verifyExecutionTrustRecordOffline`

```typescript
import { verifyExecutionTrustRecordOffline } from "@parmana/sdk";

const result = verifyExecutionTrustRecordOffline(record, {
  default: publicKeyPem,
});
// result: { valid, coverage, hashValid, legacySignatureValid, hybridSignaturesValid?,
//           algorithmsChecked, errors }
```

- `publicKeys` maps each `keyId` to a PEM public key. Pin these yourself (see [Evidence verification](../security/evidence-verification.md)).
- `valid` means the stored hash and the signatures check out. It does **not** mean the record is fully covered. Read `coverage`: `"full"` for a schema version 3 record, `"legacy"` otherwise. A version 2 record covers only seven top-level fields, so a change to any other field is not detected by it.
- The SDK's check does not refuse legacy records by default. The standalone verifier does. Decide in your code which you require.

`verifyExecutionIntentOffline(intent, publicKeys)` does the same for an execution intent.

## Errors

Every error the SDK throws is a subclass of `ParmanaError`. Each has `code` (an `ErrorCode`), `message`, optional `requestId`, optional `cause`, and for HTTP errors `statusCode`. Some also carry `serverCode`, the server's own `code` string.

| Class                    | `ErrorCode`                | Raised for                                                                                                                                                                        |
| ------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConfigurationError`     | `CONFIGURATION_ERROR`      | Missing or invalid configuration.                                                                                                                                                 |
| `ValidationError`        | `VALIDATION_ERROR`         | HTTP `400`: the request is malformed. Nothing was stored.                                                                                                                         |
| `AuthenticationError`    | `AUTHENTICATION_ERROR`     | HTTP `401`: no key, or an unknown key.                                                                                                                                            |
| `AuthorizationError`     | `AUTHORIZATION_ERROR`      | HTTP `403` not otherwise classified. Also `CAPABILITY_NOT_ALLOWED` and `TENANT_NOT_ALLOWED`, with `serverCode` set.                                                               |
| `ExecutionRejectedError` | `EXECUTION_REJECTED`       | HTTP `403` with `POLICY_DENIED`: the policy refused the request. Final for that request.                                                                                          |
| `NotFoundError`          | `NOT_FOUND_ERROR`          | HTTP `404`.                                                                                                                                                                       |
| `ConflictError`          | `CONFLICT_ERROR`           | HTTP `409`: the id was used, or the status does not allow the action.                                                                                                             |
| `ExecutionPendingError`  | `EXECUTION_STATUS_PENDING` | HTTP `202`: released and recorded, but the status is `EXECUTING`. Reconcile. Carries the `record`.                                                                                |
| `RateLimitError`         | `RATE_LIMIT_ERROR`         | HTTP `429`. `retryAfterSeconds` when the server sends `Retry-After`.                                                                                                              |
| `InternalServerError`    | `INTERNAL_SERVER_ERROR`    | HTTP `500` and `503`, and any other status. `serverCode` carries `EXECUTION_RECORD_INCOMPLETE`, `EXECUTION_OUTCOME_UNKNOWN`, or `SIGNING_UNAVAILABLE` where the server sends one. |
| `NetworkError`           | `NETWORK_ERROR`            | The request did not get an HTTP response.                                                                                                                                         |
| `TimeoutError`           | `TIMEOUT_ERROR`            | The request exceeded `timeout`.                                                                                                                                                   |
| `VerificationError`      | `VERIFICATION_ERROR`       | A verification step failed.                                                                                                                                                       |
| `ReplayError`            | `REPLAY_ERROR`             | A replay step failed.                                                                                                                                                             |

The mapping is in `typescript/src/transport/mapHttpErrorResponse.ts`. The codes the server sends are listed in the [error catalogue](../reference/error-codes.md).

```typescript
import {
  ExecutionRejectedError,
  ConflictError,
  ExecutionPendingError,
  ParmanaError,
} from "@parmana/sdk";

try {
  const record = await client.execute(transaction);
} catch (error) {
  if (error instanceof ExecutionRejectedError) {
    // Policy refused. Do not retry this transaction. Show the reason, record the refusal.
  } else if (error instanceof ConflictError) {
    // The id was used. Read the existing outcome with trustRecord() or transactionStatus().
  } else if (error instanceof ExecutionPendingError) {
    // Released, record exists, status not yet EXECUTED. Call reconcileTransaction(id). Do not resubmit.
  } else if (error instanceof ParmanaError) {
    console.error(
      error.code,
      (error as { statusCode?: number }).statusCode,
      error.message,
    );
  } else {
    throw error;
  }
}
```

## Examples

These examples are in the repository and were run against a local server for this portal. See [Getting started](../getting-started.md) for the server.

| Example                                                                                                                        | What it shows                                                                                          | Status                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| [`governed-quickstart/typescript/governed-flow.ts`](../examples/governed-quickstart/typescript/governed-flow.ts)               | Propose, refused self-approval, checker approval, execute, verify (server and offline), replay refused | Run; passed                  |
| [`governed-quickstart/typescript/declare-then-execute.ts`](../examples/governed-quickstart/typescript/declare-then-execute.ts) | Declare, status, execute, status after                                                                 | Run; passed                  |
| [`governed-quickstart/typescript/limits.ts`](../examples/governed-quickstart/typescript/limits.ts)                             | Three refusals: amount above approval, risk above limit, bound amount mismatch                         | Run; all refused as expected |

## Best practices

- **Create one client per endpoint and key** and reuse it. The client holds no mutable state.
- **Keep the default retry setting for `POST`.** The SDK never retries a `POST`, and you should not wrap one in a retry loop. Retry reads (`GET`) freely.
- **Use a new `businessTransactionId` for each new business action, and the same id only to recover.** After a `202` or `502`, read the status or reconcile. Do not submit a new id for the same action.
- **Store the approval artifact with the transaction** if you need to show later who approved what. The record includes it.
- **Never put a private key in code.** Load the approver's private key from a file or a secret store that the approver controls, and sign on the approver's machine.
- **Verify the record, not the response.** Keep the Execution Trust Record. Verify it when you need proof, with the pinned key and a check of `coverage`.
- **Handle `ExecutionRejectedError` as a business outcome**, not as a failure to retry.
- **Use `https://`** for every endpoint that is not on your own machine.
