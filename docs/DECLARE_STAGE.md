# The declare stage: what is sent and what happens

**Status:** Written 14 November 2026. Revised the same day to clarify the caller, authority and policy fields. from `packages/api/src/routes/transactions.ts` and the Business Transaction types in `packages/shared/src/domain`. The order of checks below was read from the handler. It has not been run against a live server in this document.
**Owner:** Pavan Charak

## 1. The request

`POST /transactions` with a Business Transaction in the body. Declaring and executing are one call: the handler passes the transaction straight to execution, and no separate declare step is stored before it. The request carries one header:

- `Authorization: Bearer <caller key>`. The key identifies the caller (`callerId`), not the transaction. Its holder type (human or service) is set by the operator at issue time; if absent it is treated as non-human.

The body has these parts.

| Part                    | Fields                                                                                                                                | Notes                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `businessTransactionId` | a UUID                                                                                                                                | Checked for format first.                                                                              |
| `metadata`              | `businessTransactionId`, `correlationId`, `createdBy`, `createdAt`; optional `tenantId`, `sourceSystem`, `submittedBy`, `submittedAt` | Describes the request.                                                                                 |
| `authority`             | `authorityId`, `authorityType` (for example `USER`), `principalId`, `issuedAt`; optional `displayName`                                | `principalId` is the party the caller says it acts for.                                                |
| `authorization`         | `authorizationId`, `authorityId`, `purpose`, `issuedAt`; optional `expiresAt`                                                         | Links the authority to the intent.                                                                     |
| `intent`                | `intentId`, `authorizationId`, `action`, `target`, `parameters`, `createdAt`                                                          | `action` is the capability, for example `razorpay:refund`. `parameters` holds values such as `amount`. |
| `policy`                | `name`, `version`, `schemaVersion`                                                                                                    | The policy version the request relies on. A request must name it.                                      |

## 2. What the server does, in this order

1. **Structural check.** `businessTransactionId` must be a valid UUID. If not, the response is `400` and an audit event `caller.structural_rejected` is written, when an audit sink is configured.
2. **Principal check.** If the key is identified, `authority.principalId` must be allowed for that key. If not, the response is `403` ("Caller is not permitted to assert this authority.principalId") and an audit event `caller.principal_denied` is written. An unset allowed-principal list means the key may assert only its own caller ID.
3. **Capability check.** `intent.action` must be allowed for that key. If not, the response is `403` ("Caller is not permitted to invoke this capability") and an audit event `caller.capability_denied` is written. When allowed, `caller.capability_granted` is written.
4. **Execution.** The transaction is passed to `application.execute`. Its first step is `accept`, which runs the ID match check and the duplicate check (section 5). This starts the runtime: it loads the named policy version, checks governance, evaluates the policy, and, on approval, signs an authorization envelope. The later stages are in `docs/MASTER_DOCUMENT.md`, section 2.
5. **Response.** On success the response is `201` with the execution result.

Refusals in steps 1 to 3 happen before any policy is loaded. Nothing reaches the connector from them.

## 5. The Business Transaction ID

`businessTransactionId` identifies one business transaction. The caller generates it. It is a UUID.

- **Format:** checked first, at the declare stage (step 1 above). An invalid value is refused with `400`.
- **Metadata match: confirmed in code.** `metadata.businessTransactionId` must equal the top-level `businessTransactionId`. The path is: `POST /transactions` handler, then `application.execute` (built by `RuntimeFactory`), then `ExecutionTrustApplication.execute`, then `BusinessTransactionService.accept`, which calls `BusinessTransactionValidator.validate` (`packages/runtime/src/validators/BusinessTransactionValidator.ts`, "metadata.businessTransactionId must match businessTransactionId"). A mismatch is refused with a validation error before any policy is loaded. The test suite does not have a dedicated test for this check on `POST /transactions` that this review found.
- **Uniqueness: confirmed in code.** The same `accept` step checks whether the ID already exists and refuses a duplicate with `DuplicateBusinessTransactionError`, which the error handler maps to `409` (`packages/api/src/middleware/error-handler.ts`). The test suite checks this on `POST /execute`. The `POST /transactions` path uses the same `accept` step.
- **Purpose:** the ID ties together the request, its audit events, and its execution record. A retry with the same ID is refused rather than executed twice.

## 6. The metadata fields

The metadata type is `TransactionMetadata` (`packages/shared/src/domain/metadata.ts`). Its comment says it is immutable, supplied by the calling application, and never evaluated by Policy.

Correction: an earlier version of this document listed `createdBy` and `createdAt` as metadata fields. They are not in the type. `createdAt` exists on the Business Transaction itself, and is the time Parmana accepted it; the caller does not set it.

| Field                   | Required | Set by          | Purpose                                                                                                                                                                                                  |
| ----------------------- | -------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `businessTransactionId` | Yes      | Caller          | The primary identifier of the transaction. It is also the idempotency key (a repeat is refused) and the root identifier of the Execution Trust Record. Must equal the top-level `businessTransactionId`. |
| `correlationId`         | No       | Caller          | Ties this request to other requests across systems, for tracing. Storage was not checked in this review. The type does not say it affects any decision.                                                  |
| `tenantId`              | No       | Caller          | Selects the signing key (`tenant.<tenantId>`). Checked: a caller may name only a tenant its own key lists, otherwise `403` with `TENANT_NOT_ALLOWED`. `null` and absent both mean no tenant.             |
| `sourceSystem`          | No       | Caller          | Names the application or service that sent the transaction, for audit.                                                                                                                                   |
| `submittedBy`           | No       | Server          | The identity of the authenticated caller. The type says it is server-set and never trusted from the client.                                                                                              |
| `grantedCapability`     | No       | Server          | The capability (`intent.action`) that the caller was checked and allowed to invoke. It is signed into the authorization payload. Present only when caller authentication is enabled.                     |
| `submittedAt`           | No       | Caller, as sent | `POST /transactions` does not set it; the value is stored as the caller sent it, and is not validated. Only the inbound partner flow sets it (`inbound-checks.ts`).                                      |

**Checks on these fields, from the code:**

- `tenantId` is checked on `POST /transactions` (`packages/api/src/routes/transactions.ts`), after the principal check and before execution. Its value also selects the signing key.
- `submittedBy` and `grantedCapability` are set by the server from the authenticated caller and the capability check.
- `submittedAt` is not validated and not set on this path. It is stored as the caller sent it.
- `correlationId` and `sourceSystem` are not validated on any path reviewed. Neither is used in a decision; they are recorded only.

**Still open for the owner:** whether `submittedAt` should be server-set, and whether `correlationId` and `sourceSystem` need length or format limits.

## 3. What is not yet confirmed

- Whether the transaction is stored before step 4, or only after the execution result. The handler does not show it in the section read.
- The exact fields of the request's error responses after step 4. These depend on the runtime and are covered by the execute stage, not this one.
- Whether `policy.version` is checked against governance here or only inside step 4. The runtime path is where governance runs (D19), so it is expected to be there.

## 4. Decisions that bear on this stage

- **D17:** the request defines the policy version. The request must name `policy.name` and `policy.version`; governance decides only whether that version is the one in effect (D18).
- **D18:** the version in effect comes from governance records, with no fallback to the canonical table.
- **D15 and D14:** `razorpay:refund` is not bound to any policy in code, so a declare request for that capability does not yet reach a policy check it can be bound to. See `docs/assurance/POLICY_BINDING_RAZORPAY.md`.

## 7. Long-term fix for the declare stage (agreed plan, 14 November 2026)

**Why this section exists.** The earlier description of this stage was written from memory of the concepts, not from the handler. Nothing checked it against the code, so it contained errors: the key was described as identifying the authority, `createdBy` and `createdAt` were listed as metadata, and `tenantId` was described as a label. This plan prevents that from happening again.

### 7.1 Contract test (no owner decision needed)

- **What:** a test, in `packages/api/tests/integration/`, that sends `POST /transactions` requests and checks the behaviour this document describes.
- **It must check:**
  1. Each required field: a request without `businessTransactionId`, `metadata.businessTransactionId`, `authority`, `authorization`, `intent` or `policy` is refused.
  2. The structural check: a malformed `businessTransactionId` returns `400` and writes `caller.structural_rejected`.
  3. The principal check: a principal the key may not assert returns `403` and writes `caller.principal_denied`.
  4. The capability check: an action the key may not invoke returns `403` and writes `caller.capability_denied`.
  5. The tenant check: a `tenantId` the key does not list returns `403` with `TENANT_NOT_ALLOWED`.
  6. The ID match: a mismatched `metadata.businessTransactionId` is refused.
  7. The duplicate check: a reused `businessTransactionId` returns `409`.
  8. The order: a request that fails check 2 is refused before check 3 is reached, and no policy is loaded for any refusal in checks 1 to 5.
- **Done when:** the test passes on `main`, and it fails if any one of those checks is removed from the handler.

### 7.2 Field tables generated from the types (no owner decision needed)

- **What:** the tables in sections 1 and 6 are generated from `TransactionMetadata`, `Authority`, `Authorization`, `Intent` and `PolicyReference` in `packages/shared/src/domain/`.
- **Done when:** a script regenerates the tables, and CI fails if the committed document differs from the generated output.

### 7.3 Whether declare is a separate step (owner decision)

- **Today:** `POST /transactions` declares and executes in one call. A caller cannot see the policy decision before execution.
- **Option A:** keep one call. This is the current behaviour, and it needs no change.
- **Option B:** split into two calls. The first declares and returns the policy decision without executing. The second executes a declared transaction. This changes the API and needs a new contract test.
- **Until the owner decides,** this document describes Option A, the current behaviour.

### 7.4 Order of work

1. Contract test (7.1).
2. Generated tables (7.2).
3. Owner decision on 7.3, then any change it requires.
