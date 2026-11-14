# The declare stage

**Status:** Agreed description, 14 November 2026. Each statement is taken from the code named in it, or is marked as part of the agreed plan.
**Owner:** Pavan Charak

## 1. What declare is

Declare is one request: `POST /transactions`. Declaring and executing are the same call. The handler passes the transaction directly to execution. No separate declare step is stored before execution.

## 2. The request

**Header:** `Authorization: Bearer <caller key>`.

- The key identifies the caller, as `callerId`. It does not identify the transaction.
- The key's holder type is `credentialHolderType`, set by the operator when the key is issued. A key with no holder type is treated as non-human.

**Body:** a Business Transaction. Fields are listed as in the types under `packages/shared/src/domain/`.

| Part            | Field                                                                        | Required | Set by               | Meaning                                                                                      |
| --------------- | ---------------------------------------------------------------------------- | -------- | -------------------- | -------------------------------------------------------------------------------------------- |
| top level       | `businessTransactionId`                                                      | Yes      | Caller               | UUID. Identifies the transaction. Checked for format.                                        |
| `metadata`      | `businessTransactionId`                                                      | Yes      | Caller               | Must equal the top-level value.                                                              |
| `metadata`      | `correlationId`                                                              | No       | Caller               | Stored as a label. Not validated.                                                            |
| `metadata`      | `tenantId`                                                                   | No       | Caller               | Checked against the caller's allowed tenants. Selects the signing key.                       |
| `metadata`      | `sourceSystem`                                                               | No       | Caller               | Stored as a label. Not validated.                                                            |
| `metadata`      | `submittedBy`                                                                | No       | Server               | The authenticated caller's ID.                                                               |
| `metadata`      | `grantedCapability`                                                          | No       | Server               | The capability the caller was checked for.                                                   |
| `metadata`      | `submittedAt`                                                                | No       | Caller, not set here | Not set by this handler.                                                                     |
| `authority`     | `authorityId`, `authorityType`, `principalId`, `issuedAt`                    | Yes      | Caller               | The authority the caller asserts.                                                            |
| `authority`     | `displayName`                                                                | No       | Caller               | Label.                                                                                       |
| `authorization` | `authorizationId`, `authorityId`, `purpose`, `issuedAt`                      | Yes      | Caller               | Links the authority to the intent.                                                           |
| `authorization` | `expiresAt`                                                                  | No       | Caller               | Expiry, if given.                                                                            |
| `intent`        | `intentId`, `authorizationId`, `action`, `target`, `parameters`, `createdAt` | Yes      | Caller               | `action` is the capability, for example `razorpay:refund`. `parameters` are caller-supplied. |
| `policy`        | `name`, `version`, `schemaVersion`                                           | Yes      | Caller               | The policy version the request relies on.                                                    |

**Authority.** `principalId` and `authorityType` are asserted by the caller. The server checks only that the key may assert that principal.

**Policy version.** The caller names the version (D17). Governance decides whether that version is in effect (D18).

## 3. Checks made at declare

The handler makes these checks before it calls execution. Each refusal writes an audit event when an audit sink is configured.

| Check                                             | Refusal                          | Audit event                  |
| ------------------------------------------------- | -------------------------------- | ---------------------------- |
| `businessTransactionId` is a UUID                 | `400`                            | `caller.structural_rejected` |
| The key may assert `authority.principalId`        | `403`                            | `caller.principal_denied`    |
| `metadata.tenantId`, if set, is one the key lists | `403`, code `TENANT_NOT_ALLOWED` | none                         |
| The key may invoke `intent.action`                | `403`                            | `caller.capability_denied`   |

When the capability check passes, the handler writes `caller.capability_granted`.

**Order.** The checks run in this order, and a refusal stops the request:

1. Structural check (`businessTransactionId` format), for every request.
2. Principal check, tenant check, capability check, in that order. These three run only when the request carries an authenticated caller (`req.callerId` is set). Without an authenticated caller they are skipped.
3. Execution (`application.execute`), reached only when every check above passes.

Source: `packages/api/src/routes/transactions.ts`. The structural check is at the start of the handler; the principal, tenant and capability checks are inside the `req.callerId !== undefined` block; `application.execute` is called after that block.

## 4. Checks made at execution, as the first step of `application.execute`

1. **Trust-chain validation.** `metadata.businessTransactionId` must equal `businessTransactionId`. A mismatch is refused. Code: `BusinessTransactionValidator.validate`, called from `BusinessTransactionService.accept`.
2. **Duplicate check.** A `businessTransactionId` already accepted is refused with `409` (`DuplicateBusinessTransactionError`).

After these two checks, the policy is loaded and evaluated. The execution stages are described in `docs/MASTER_DOCUMENT.md`, section 2.

## 5. Business Transaction ID

- Caller-generated. A UUID.
- Refused with `400` if malformed.
- Must equal `metadata.businessTransactionId`.
- A second use is refused with `409`.

## 6. Plan (agreed, not yet built)

1. **Contract test.** An integration test in `packages/api/tests/integration/` sends `POST /transactions` requests and checks: each required field; the structural refusal; the principal, tenant and capability refusals and their audit events; the ID match; the duplicate `409`; and the order in section 3. It is done when it passes on `main` and fails if any listed check is removed from the handler.
2. **Generated tables.** A script regenerates the tables in section 2 from the types in `packages/shared/src/domain/`. CI fails if this document differs from the generated output.
3. **Owner decision: separate declare step.** Option A keeps one call, as now. Option B splits it into a declare call that returns the policy decision, and an execute call. This document describes Option A. It changes only if the owner chooses Option B.

Order: item 1, then item 2, then item 3 if the owner chooses it.
