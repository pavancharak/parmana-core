# Core endpoints

[REST API overview](README.md) · [Endpoint index (all 66)](endpoint-index.md) · [Error codes](../reference/error-codes.md)

This page covers the routes most integrations use. For each one: the purpose, the authentication, the request, the response, the errors, and a `curl` and JavaScript example. Where the verification run covered a route, the responses are real output from a local server; each one says so. Other responses are described from the OpenAPI document and the code, and say so.

Conventions used in the examples:

```bash
export PARMANA_API_URL=http://localhost:3000        # your Parmana endpoint
export PARMANA_API_KEY=<your-caller-key>            # raw key, never the hash
```

Responses are abbreviated with `…` where they are long. Everything is JSON unless noted.

The runnable version of most of these calls is [`examples/governed-quickstart/rest-smoke.sh`](../examples/governed-quickstart/rest-smoke.sh). It runs against the local server that the [getting-started guide](../getting-started.md) starts.

---

## Health and identity

### `GET /health`

Liveness. No key.

```bash
curl -s "$PARMANA_API_URL/health"
```

```json
{ "status": "UP" }
```

Verified: `200`.

### `GET /ready`

Readiness. Reports whether the server is ready and what storage it uses. No key.

```bash
curl -s "$PARMANA_API_URL/ready"
```

```json
{ "status": "READY", "storage": "not-supabase-backed", "authDisabled": false }
```

Verified on memory storage: `200`. With `PARMANA_STORAGE=postgres` (or `supabase`) the server checks the database connection before it reports ready. `authDisabled: true` means the server was started with `PARMANA_AUTH_DISABLED=true`, which must never happen in a real deployment.

### `GET /version`

The server's name and version. Requires a key.

```bash
curl -s -H "Authorization: Bearer $PARMANA_API_KEY" "$PARMANA_API_URL/version"
```

```json
{ "name": "Parmana", "version": "0.4.0", "api": "v1" }
```

Verified: `200` with a key, `401` without. **The version reports `0.4.0` on this build, not the 4.1.1 package version.** Do not use it to check the SDK version.

### `GET /callers/me`

The caller this key identifies, and what it may do. Requires a key.

```bash
curl -s -H "Authorization: Bearer $PARMANA_API_KEY" "$PARMANA_API_URL/callers/me"
```

```json
{
  "callerId": "demo",
  "allowedPrincipalIds": ["demo"],
  "allowedCapabilities": ["test:fixture-execute"],
  "unrestrictedCapabilities": false
}
```

Verified: `200`. Read this before you build a request. A request for a principal or action not in these lists is refused.

### `GET /keys/{keyId}`

The public key for a key id, as PEM and JWK. Use it to pin a key for offline verification. Requires a key.

```bash
curl -s -H "Authorization: Bearer $PARMANA_API_KEY" "$PARMANA_API_URL/keys/default"
```

```json
{
  "keyId": "default",
  "algorithm": "ed25519",
  "use": "sig",
  "pem": "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----\n",
  "jwk": { "kty": "OKP", "crv": "Ed25519", "x": "…" }
}
```

Verified: `200`. Take the key from this route only for a first look. For verification, pin the fingerprint from a second source (see [Evidence verification](../security/evidence-verification.md)).

### `GET /.well-known/jwks.json`

The same keys as a JWK set, for tools that expect one. Requires a key.

```bash
curl -s -H "Authorization: Bearer $PARMANA_API_KEY" "$PARMANA_API_URL/.well-known/jwks.json"
```

Verified: `200`, listing the `default` and `gateway` keys.

---

## Execute and declare

The request body for each of the three routes below is a Business Transaction. Its fields and required checks are the same for all three:

```json
{
  "businessTransactionId": "3b9d2c1e-5f7a-4b8c-9d0e-1f2a3b4c5d6e",
  "metadata": {
    "businessTransactionId": "3b9d2c1e-5f7a-4b8c-9d0e-1f2a3b4c5d6e",
    "correlationId": "order-7731",
    "sourceSystem": "ap-automation",
    "submittedBy": "ap-automation",
    "submittedAt": "2026-11-20T05:00:00.000Z"
  },
  "authority": {
    "authorityId": "a-1",
    "authorityType": "SERVICE",
    "principalId": "demo",
    "displayName": "Accounts payable agent",
    "issuedAt": "2026-11-20T05:00:00.000Z"
  },
  "authorization": {
    "authorizationId": "z-1",
    "authorityId": "a-1",
    "purpose": "Authorize vendor payment",
    "issuedAt": "2026-11-20T05:00:00.000Z"
  },
  "intent": {
    "intentId": "i-1",
    "authorizationId": "z-1",
    "action": "test:fixture-execute",
    "target": "vendor://payments",
    "parameters": { "amount": 1000, "currency": "USD" },
    "createdAt": "2026-11-20T05:00:00.000Z"
  },
  "policy": {
    "name": "vendor-payment",
    "version": "2.1.1",
    "schemaVersion": "1.0.0"
  },
  "signals": {
    "humanApproved": true,
    "approvalArtifact": { "…": "the signed approval, from signApproval()" },
    "vendorVerified": true,
    "invoiceVerified": true,
    "paymentApproved": true,
    "sufficientFunds": true,
    "paymentAmount": 1000,
    "riskScore": 5,
    "vendorId": "vendor://payments"
  }
}
```

The server checks these before anything is evaluated, and returns `400` on failure:

- `businessTransactionId` is a UUID.
- `metadata.businessTransactionId` equals `businessTransactionId`.
- `authorization.authorityId` equals `authority.authorityId`.
- `intent.authorizationId` equals `authorization.authorizationId`.
- `policy.name`, `policy.version` and `intent.action` are non-empty.

The server assigns `status` and `createdAt`, and overwrites `metadata.submittedBy` with the caller's identity. The SDK builder includes `status` and `createdAt` in what it sends, and the server accepts the request, but the values you send are not used. Do not rely on them.

The signal names in the example are the ones the `vendor-payment` policy reads. Each policy declares its own signals; see [Policy management](../policies/README.md).

The full schema is `schemas/requests/transaction-create-request.schema.json`.

### `POST /execute`

Decide and, if approved, release, in one call. Returns the signed record.

```bash
curl -s -X POST "$PARMANA_API_URL/execute" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  --data @transaction.json
```

Responses:

| Status | Body                                                                                                                             | Meaning                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `200`  | Execution Trust Record (see below)                                                                                               | Approved and released.                                                                    |
| `202`  | `{"businessTransactionId":"…","status":"EXECUTING","outcome":"pending","reconcile":"/transactions/{id}/reconcile","record":{…}}` | Released and recorded, status not yet set to executed. Reconcile. Do not resend.          |
| `400`  | `{"error":"…"}`                                                                                                                  | Malformed request. Nothing was stored.                                                    |
| `403`  | `{"error":"…","code":"POLICY_DENIED"}`                                                                                           | The policy refused. Final for this request.                                               |
| `403`  | `{"error":"Caller is not permitted to invoke this capability.","code":"CAPABILITY_NOT_ALLOWED"}`                                 | The key may not invoke this action.                                                       |
| `403`  | `{"error":"Caller is not permitted to act for this tenantId.","code":"TENANT_NOT_ALLOWED"}`                                      | The key may not act for this tenant.                                                      |
| `403`  | `{"error":"Caller is not permitted to assert this authority.principalId."}`                                                      | The key may not act for this principal.                                                   |
| `404`  | `{"error":"Policy 'vendor-payment' version '2.1.0' was not found."}`                                                             | No such policy version on this server.                                                    |
| `409`  | `{"error":"Business Transaction '…' already exists."}`                                                                           | The id was used before. Nothing ran again.                                                |
| `500`  | `EXECUTION_RECORD_INCOMPLETE`                                                                                                    | Released, but the signed record could not be produced. Do not retry as a new transaction. |
| `502`  | `EXECUTION_OUTCOME_UNKNOWN`                                                                                                      | Released, and the connector call failed. Reconcile.                                       |
| `429`  | rate-limit body                                                                                                                  | Too many requests. Honor `Retry-After`.                                                   |

A refused execution (for example a policy rejection) is recorded as a refusal record. Verified: after a refused `POST /execute`, `GET /refusal/{businessTransactionId}` returned the refusal record, with its `decision`.

Verified responses on this build: `200` (approved), `403` with `POLICY_DENIED`-style messages for the three limit cases, `404` for an unknown policy version, `409` for a repeated id, and `403` for an approval that does not verify. See [Transaction limits](../tutorials/transaction-limits.md) and [Troubleshooting](../troubleshooting/README.md#approval-failures).

**Execution Trust Record (the `200` body), abbreviated:**

```json
{
  "trustRecordId": "06210f86-c28c-4226-aea3-acf45d7fed69",
  "businessTransactionId": "66412b22-256e-4b81-b590-c37047ab6ba5",
  "transaction": { "…": "the Business Transaction as stored" },
  "authorization": { "…": "the signed authorization" },
  "overrides": [],
  "executions": [{ "decision": { "outcome": "APPROVED", "…": "…" }, "…": "…" }],
  "verifications": [],
  "receipts": [],
  "evidenceAnchor": { "…": "…" },
  "createdAt": "2026-11-20T05:05:33.907Z",
  "updatedAt": "2026-11-20T05:05:33.907Z",
  "trustRecordHash": "4e6acd511e9313727e90b21d73cda68b6aea07fb31352732f415298d06a0c578",
  "signature": {
    "algorithm": "ed25519",
    "keyId": "default",
    "value": "…",
    "signedAt": "…"
  }
}
```

Verified: the fields above are present on the record that `POST /execute` returned in the governed run. The `…` values are omitted for length.

JavaScript (Node.js 24, built-in `fetch`):

```javascript
const res = await fetch(`${process.env.PARMANA_API_URL}/execute`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.PARMANA_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(transaction), // built as in the request example above
});
const body = await res.json();
if (res.status === 200) console.log("trust record", body.trustRecordId);
else if (res.status === 202) console.log("reconcile", body.reconcile);
else console.error(res.status, body.code ?? "", body.error);
```

SDK equivalents: `client.execute(transaction)` (TypeScript) and `client.execute(transaction)` (Python). See the [TypeScript SDK](../sdk/typescript.md) and [Python SDK](../sdk/python.md).

### `POST /transactions` (declare)

Record a Business Transaction as `RECEIVED`. Nothing is decided, signed or released.

```bash
curl -s -X POST "$PARMANA_API_URL/transactions" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  --data @transaction.json
```

Responses: `201` with `{"businessTransactionId":"…","status":"RECEIVED","acceptedAt":"…","transaction":{…}}`. Verified: `201`-equivalent acceptance returned `RECEIVED`. A repeat returns `409`: `{"error":"Business Transaction '…' already exists."}`. Verified.

### `POST /transactions/{businessTransactionId}/execute`

Decide and release a transaction that was declared. No body.

```bash
curl -s -X POST "$PARMANA_API_URL/transactions/$TXN_ID/execute" \
  -H "Authorization: Bearer $PARMANA_API_KEY"
```

Responses: `200` with the record; `202` for an `EXECUTING` status; `404` if the policy version is not found; `403` as for `/execute`; `409` if the status does not allow execution (for example `VERIFIED`), or the outcome is pending. Verified: `200` with `APPROVED` for a transaction declared with `2.1.1` in effect, where the approval was in the transaction at declaration. A transaction declared without its approval was refused on execution. An approval cannot be added to a declared transaction. Verified: a declared transaction whose policy version had been superseded was refused with `ExecutionRejectedError`: `policy "vendor-payment"@"2.1.0" was superseded`.

### `GET /transactions/{businessTransactionId}/status`

The current status and, with `?history=true`, the history.

```bash
curl -s -H "Authorization: Bearer $PARMANA_API_KEY" \
  "$PARMANA_API_URL/transactions/$TXN_ID/status?history=true"
```

```json
{
  "businessTransactionId": "66412b22-256e-4b81-b590-c37047ab6ba5",
  "current": {
    "eventId": "0ecffa23-…",
    "businessTransactionId": "66412b22-…",
    "sequence": 6,
    "status": "VERIFIED",
    "stage": "verify",
    "occurredAt": "2026-11-20T05:05:33.907Z",
    "legacy": false
  },
  "history": [
    {
      "eventId": "f9b212ce-…",
      "sequence": 1,
      "status": "RECEIVED",
      "stage": "declare",
      "…": "…"
    }
  ]
}
```

Verified: `200`. A transaction that is not found returns `404`.

### `POST /transactions/{businessTransactionId}/reconcile`

Compare a transaction whose status is `EXECUTING` (or whose outcome is unknown) with the connector and the audit events, and set its status. No body. Use it after a `202` or a `500`/`502`. **Not run in this verification**; the request and status codes are from the OpenAPI document and the SDK source.

```bash
curl -s -X POST "$PARMANA_API_URL/transactions/$TXN_ID/reconcile" \
  -H "Authorization: Bearer $PARMANA_API_KEY"
```

### `GET /transactions` and `GET /transactions/{businessTransactionId}`

```bash
curl -s -H "Authorization: Bearer $PARMANA_API_KEY" "$PARMANA_API_URL/transactions?page=1&pageSize=2"
curl -s -H "Authorization: Bearer $PARMANA_API_KEY" "$PARMANA_API_URL/transactions/$TXN_ID"
```

The list returns a bare JSON array of the Business Transactions your key submitted, with no paging metadata. **A page can hold fewer than `pageSize` items, or none, when items belonging to other callers are filtered out (the OpenAPI description says so).** Do not treat a short or empty page as the end of the list. The single read returns the transaction; `404` if it does not exist for this caller. Verified: `200` with the array, and `404` for an unknown id.

---

## Verify, replay and receipts

### `POST /verify`

Check a stored record. The result is in the body. A `200` does not mean the record is valid: read `status`.

```bash
curl -s -X POST "$PARMANA_API_URL/verify" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"businessTransactionId\":\"$TXN_ID\"}"
```

```json
{
  "verificationId": "b61d0fa7-742a-4a26-b535-a79b3674b51d",
  "businessTransactionId": "66412b22-256e-4b81-b590-c37047ab6ba5",
  "status": "VERIFIED",
  "message": "Execution Trust Record verified successfully.",
  "verifiedAt": "2026-11-20T05:10:41.286Z",
  "trustRecordHash": "4e6acd511e9313727e90b21d73cda68b6aea07fb31352732f415298d06a0c578"
}
```

Verified: `200`, `VERIFIED`. `400` if the id is not a UUID. `404` with `code: VERIFICATION_FAILED` if the key has no record with that id.

### `GET /verification/{businessTransactionId}`

The latest verification for the transaction. Same shape as `POST /verify`. Requires a key.

### `POST /replay`

Check the stored record's hash and signature again. Does not run the policy and executes nothing.

```bash
curl -s -X POST "$PARMANA_API_URL/replay" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"businessTransactionId\":\"$TXN_ID\"}"
```

```json
{
  "businessTransactionId": "66412b22-256e-4b81-b590-c37047ab6ba5",
  "trustRecordHash": "4e6acd51…",
  "verified": true
}
```

Verified: `200`, `verified: true`. Read `verified`; a `200` alone does not mean the signature verified.

### `POST /receipt`

Issue a signed receipt for a record. The record's latest verification must be `VERIFIED`; run `POST /verify` first.

```bash
curl -s -X POST "$PARMANA_API_URL/receipt" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"businessTransactionId\":\"$TXN_ID\"}"
```

```json
{
  "receiptId": "a89d0054-…",
  "businessTransactionId": "66412b22-…",
  "trustRecordHash": "4e6acd51…",
  "receiptHash": "e05feb67…",
  "issuedAt": "2026-11-20T05:10:47.207Z",
  "algorithm": "ed25519",
  "signature": "…"
}
```

Verified: `200` after a `VERIFIED` result. `409` if the latest verification is not `VERIFIED`.

### `GET /receipt/latest/{businessTransactionId}`

The most recent receipt for the transaction. Verified: `200`, returning the receipt above.

---

## Trust records and refusals

### `GET /trust-records/{businessTransactionId}`

The full stored Execution Trust Record.

```bash
curl -s -H "Authorization: Bearer $PARMANA_API_KEY" "$PARMANA_API_URL/trust-records/$TXN_ID"
```

Verified: `200`, the record with `trustRecordId`, `transaction`, `executions`, `trustRecordHash` and `signature`. `404` with `{"error":"Execution Trust Record not found."}` for an unknown id.

### `GET /trust-records`

A bulk export of your signed Trust Records (transaction, decision, executions, verifications, receipts), a page at a time, for audit and compliance. Filter by date with `since` and `until`. Like `GET /transactions`, it returns a bare array with no paging metadata, and a short or empty page does not mean the end. Requires a key.

### `GET /refusal/{businessTransactionId}`

The refusal record for a transaction that was refused. Requires a key.

### `POST /refusal/verify`

Check a refusal record you hold. No key. The body must be a refusal record with `refusalRecordId`, `businessTransactionId`, `decision`, `refusalRecordHash` and `signature`. A body missing these returns `400`, and the message names them. Verified: `400` on an empty body.

---

## Policy

### `GET /policies/in-effect?capability=<action>`

The policy bound to a capability. `capability` is required.

```bash
curl -s -H "Authorization: Bearer $PARMANA_API_KEY" "$PARMANA_API_URL/policies/in-effect?capability=payments:refund"
```

Verified: `400` with `capability is required, for example ?capability=erp:invoice-pay.` when the parameter is missing. For a capability with no binding on this build, the response is `404` with `{"error":"No policy is bound to capability \"test:fixture-execute\".","code":"CAPABILITY_NOT_BOUND"}`. Verified.

### `POST /policies/validate`

Check that a policy version can be loaded by the server, by name and version. It does not take a document.

```bash
curl -s -X POST "$PARMANA_API_URL/policies/validate" \
  -H "Authorization: Bearer $PARMANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"policyId":"vendor-payment","policyVersion":"2.1.0"}'
```

```json
{ "valid": true, "errors": [] }
```

Verified: `200`, `valid: true`, for `vendor-payment` `2.1.0` and `payment-refund` `1.0.0`.

### `POST /policies/{name}/{version}/pending-changes`

Propose a policy version (maker). Operator route: requires a human caller (`USER`). The body is the policy document and a reason.

```bash
curl -s -X POST "$PARMANA_API_URL/policies/vendor-payment/2.1.1/pending-changes" \
  -H "Authorization: Bearer $MAKER_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"proposedContent\": $(cat vendor-payment-2.1.1.json), \"reason\": \"Limit change\"}"
```

Responses: `201` with `pendingPolicyChangeId` and the proposal (status `PENDING_APPROVAL`). `403 NON_HUMAN_CALLER_DENIED` for a service caller. Verified: `201` and `403` for the service caller, in the maker-checker tutorial.

### `GET /policies/pending-changes?status=`

List changes. `status` filters the list. Operator route.

### `POST /policies/pending-changes/{pendingPolicyChangeId}/approve`

Approve (checker). Body: `{"stepUpAuthorization": { … }}`, the envelope from `signPolicyChangeStepUp()` or `parmana-ops approval sign`. The checker must be listed for the policy in `POLICY_CHANGE_CHECKERS`, must be a different caller from the maker, and must be a human.

| Status | Code                                   | Meaning                                                                 |
| ------ | -------------------------------------- | ----------------------------------------------------------------------- |
| `200`  | none                                   | Approved. The approval record is stored and the policy file is written. |
| `403`  | `SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE` | The maker tried to approve its own change.                              |
| `403`  | `STEP_UP_AUTHORIZATION_INVALID`        | No envelope, or it does not verify, or it is expired.                   |
| `403`  | `NON_HUMAN_CALLER_DENIED`              | A service caller.                                                       |

Verified: all four outcomes in the maker-checker tutorial and in the governed flow.

### `POST /policies/pending-changes/{pendingPolicyChangeId}/reject`

Reject (checker). Body: `{"rejectionReason": "…", "stepUpAuthorization": { … }}`. Same checks as approval.

---

## Other governance changes

Approver keys (`/approval-issuers/...`), external connectors (`/external-connectors/...`), business signal sources (`/business-signal-sources/...`) and authority grants (`/authority-grants/...`) each follow the same pattern as policy changes: a `GET` list, a `POST .../changes` to propose, `GET .../changes` to list, and `POST .../changes/{id}/approve` and `/reject`. They are all operator routes. See the [endpoint index](endpoint-index.md) for the full set.

---

## Experimental routes

`/execution-intents/*`, `/kill-switch/*`, `/v2/*` and `/v1/inbound/*` are described in the [API overview](README.md#experimental-and-opt-in-routes). Their availability depends on the deployment's configuration.

## Every other operation

The operations below are in the OpenAPI document and are not described in the sections above. Each row gives the method, path, operation id and summary from `openapi/openapi.yaml`. The [endpoint index](endpoint-index.md) lists all 66 with their authentication requirement and SDK method.

| Method | Path                             | operationId                       | Summary (from the OpenAPI document)                                  |
| ------ | -------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| GET    | `/handbook/download-leads`       | `getHandbookDownloadLead`         | Capture an email address, then redirect straight to the handbook PDF |
| POST   | `/handbook/download-leads`       | `createHandbookDownloadLead`      | Capture an email address before unlocking the handbook PDF download  |
| GET    | `/execution-intents/unfinalized` | `listUnfinalizedExecutionIntents` | List Execution Intents that never reached a signed Trust Record      |
| POST   | `/kill-switch/trip`              | `tripKillSwitch`                  | Trip the operator kill switch                                        |
| POST   | `/kill-switch/reset`             | `resetKillSwitch`                 | Reset the operator kill switch                                       |
| POST   | `/kill-switch/probes`            | `recordKillSwitchProbe`           | Record a kill switch probe result                                    |
