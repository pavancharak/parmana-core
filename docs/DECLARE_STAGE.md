# The declare stage: what is sent and what happens

**Status:** Written 14 November 2026 from `packages/api/src/routes/transactions.ts` and the Business Transaction types in `packages/shared/src/domain`. The order of checks below was read from the handler. It has not been run against a live server in this document.
**Owner:** Pavan Charak

## 1. The request

`POST /transactions` with a Business Transaction in the body. The request carries one header:

- `Authorization: Bearer <caller key>`. The server uses it to identify the caller and its holder type.

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
4. **Execution.** The transaction is passed to `application.execute`. This starts the runtime: it loads the named policy version, checks governance, evaluates the policy, and, on approval, signs an authorization envelope. The later stages are in `docs/MASTER_DOCUMENT.md`, section 2.
5. **Response.** On success the response is `201` with the execution result.

Refusals in steps 1 to 3 happen before any policy is loaded. Nothing reaches the connector from them.

## 3. What is not yet confirmed

- Whether the transaction is stored before step 4, or only after the execution result. The handler does not show it in the section read.
- The exact fields of the request's error responses after step 4. These depend on the runtime and are covered by the execute stage, not this one.
- Whether `policy.version` is checked against governance here or only inside step 4. The runtime path is where governance runs (D19), so it is expected to be there.

## 4. Decisions that bear on this stage

- **D17:** the request defines the policy version. The request must name `policy.name` and `policy.version`; governance decides only whether that version is the one in effect (D18).
- **D18:** the version in effect comes from governance records, with no fallback to the canonical table.
- **D15 and D14:** `razorpay:refund` is not bound to any policy in code, so a declare request for that capability does not yet reach a policy check it can be bound to. See `docs/assurance/POLICY_BINDING_RAZORPAY.md`.
