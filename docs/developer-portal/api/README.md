# REST API reference

[Portal home](../README.md) · [Core endpoints](endpoints.md) · [Full endpoint index](endpoint-index.md) · [SDKs](../sdk/README.md)

The Parmana API is a JSON-over-HTTP API described by an OpenAPI 3.1 document (`openapi/openapi.yaml`, API version `1.0.0`). The server publishes the document at `GET /openapi.yaml` and `GET /openapi.json`. The SDKs wrap these routes. Use the REST API directly from any language, or when you need a route the SDK does not wrap.

## Base URLs

| Environment                                    | URL                                   | Notes                                                                                                        |
| ---------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Local, from source                             | `http://localhost:3000`               | The default port is 3000 (the `PORT` variable changes it). Plain HTTP is allowed for loopback only.          |
| Production (as listed in the OpenAPI document) | `https://parmana-api-real.vercel.app` | The document says this server needs a key issued by the operator. It was not contacted in this verification. |
| Your deployment                                | Your HTTPS endpoint                   | See [Deployment](../deployment/README.md).                                                                   |

## Authentication

Almost every route requires a bearer key:

```http
Authorization: Bearer <your-api-key>
```

- The key is issued to a **caller**. The server stores only the SHA-256 hash of the key (see `PARMANA_API_KEYS` in [Environment variables](../reference/environment-variables.md)).
- A caller may act only for the principals in its `allowedPrincipalIds`, and invoke only the actions in its `allowedCapabilities`. Check yours with `GET /callers/me`.
- Changes to policies, approver keys, external connectors, business signal sources and authority grants are **operator** routes. They require a caller whose credential holder is a human (`credentialHolderType: USER`), and a step-up envelope on approval. The OpenAPI document marks them `operatorBearer`.
- These routes need no key: `GET /health`, `GET /ready`, `GET /openapi.yaml`, `GET /openapi.json`, `GET /api-manifest.json`, `GET /parmana-handbook.pdf`, the handbook download-lead routes, `POST /refusal/verify`, `POST /execution-intents/verify` and `POST /audit/verify`. The last three verify a document you send; they do not reveal stored records.

Missing or unknown keys return `401`:

```bash
curl -s http://localhost:3000/version
# {"error":"authentication required"}   HTTP 401
```

## Content type and headers

| Header          | When                      | Value              |
| --------------- | ------------------------- | ------------------ |
| `Authorization` | Every authenticated route | `Bearer <key>`     |
| `Content-Type`  | Every route with a body   | `application/json` |
| `Accept`        | Optional                  | `application/json` |

Responses are `application/json; charset=utf-8`, except `GET /parmana-handbook.pdf` (PDF). An unknown route returns a JSON `404` with `code: ROUTE_NOT_FOUND` (as of this change; earlier builds returned an HTML page). A client must still check the status code and the `Content-Type` before parsing.

## Rate limits

Rate limits are applied per route class. The response headers report them. For example, `GET /health`:

```text
RateLimit-Policy: 300;w=60
RateLimit-Limit: 300
RateLimit-Remaining: 298
RateLimit-Reset: 60
```

When a limit is exceeded the API returns `429`. The SDKs raise `RateLimitError`, which carries `retryAfterSeconds` when the server sends `Retry-After`. The limits are set with `RATE_LIMIT_HEALTH_PER_MINUTE`, `RATE_LIMIT_PUBLIC_PER_MINUTE`, `RATE_LIMIT_EXECUTE_PER_MINUTE` and `RATE_LIMIT_AUTH_FAILURE_PER_MINUTE` (see [Environment variables](../reference/environment-variables.md)).

## Errors

Error bodies are JSON with an `error` message and, for most refusals, a `code`:

```json
{
  "error": "No policy is bound to capability \"test:fixture-execute\".",
  "code": "CAPABILITY_NOT_BOUND"
}
```

Some routes return a body with `error` only. Validation errors from the request-body checks name the missing fields in the message. Unknown routes return JSON `404` with `code: ROUTE_NOT_FOUND`.

The error catalogue, with each code, its status and its meaning, is in [Error codes](../reference/error-codes.md). The SDKs map status codes to error classes; see the [TypeScript errors](../sdk/typescript.md#errors) and [Python errors](../sdk/python.md#errors).

## Status codes used by the API

| Status | Meaning in Parmana                                                           | Typical cause                                                                                  |
| ------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `200`  | Success. For `POST /execute`, the body is the signed Execution Trust Record. | Approved and released.                                                                         |
| `201`  | Created. Declared, or a policy change proposed.                              | `POST /transactions` accepted as `RECEIVED`.                                                   |
| `202`  | Released and the record exists, but the status is `EXECUTING`.               | The status update failed after release. Reconcile.                                             |
| `400`  | Malformed request. Nothing was stored.                                       | Missing field, invalid UUID, mismatched ids.                                                   |
| `401`  | No key, or an unknown key.                                                   | Missing `Authorization`.                                                                       |
| `403`  | Refused: policy, caller permission, approval, or maker-checker.              | `POLICY_DENIED`, `CAPABILITY_NOT_ALLOWED`, `SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`, and others. |
| `404`  | Not found: a transaction, record, policy version, or unbound capability.     | `CAPABILITY_NOT_BOUND`, `Policy ... was not found.`                                            |
| `409`  | Conflict: the id was used, or the status does not allow the action.          | Re-submitting a `businessTransactionId`.                                                       |
| `429`  | Rate limit reached.                                                          | Too many requests in the window.                                                               |
| `500`  | Server error. Some `500`s mean the action was released (see below).          | `EXECUTION_RECORD_INCOMPLETE`.                                                                 |
| `502`  | The connector call failed after release. Outcome unknown.                    | `EXECUTION_OUTCOME_UNKNOWN`.                                                                   |
| `503`  | Temporarily unavailable. Nothing was executed.                               | `SIGNING_UNAVAILABLE` and similar.                                                             |

**Two rules matter most for retries:**

1. A `500` with `EXECUTION_RECORD_INCOMPLETE` and a `502` with `EXECUTION_OUTCOME_UNKNOWN` mean the action may already have run. Do not submit it as a new transaction. Read its status or reconcile it.
2. A `409` on an execution means that id has been used. Read the existing outcome. It does not mean the action ran twice.

## Identifiers

- `businessTransactionId`: a UUID the caller chooses. It is single-use. The server returns `400` if it is not a valid UUID.
- `pendingPolicyChangeId`, `changeId`, `trustRecordId`, `receiptId`, `verificationId`: UUIDs assigned by the server.
- `policy.name` and `policy.version`: the policy identifier and version, for example `vendor-payment` and `2.1.0`. The server looks the version up by its exact string.

## Pagination

List routes take `page` (from 1) and `pageSize`. `GET /transactions` defaults to page 1 with 25 items. Lists are returned as a bare JSON array.

## Versions

- `GET /version` returns `{"name":"Parmana","version":"4.1.1","api":"v1"}` on this build. `version` is the `@parmana/api` package version, a deployment build identifier separate from the REST API version `api`. An earlier build reported a hand-typed `0.4.0`; that is fixed.
- `GET /api-manifest.json` describes the API and links the SDKs, and reports the same build version.
- The OpenAPI document is `1.0.0`.

## Experimental and opt-in routes

| Route family                                                                        | Status               | Notes                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/execution-intents/*`                                                              | Experimental         | Enabled by the deployment's execution-intent settings. `executionIntentsConfigured: false` in the dev server.                                                                                                                                                           |
| `/kill-switch/*`                                                                    | Experimental, opt-in | Mounted only when `KILL_SWITCH_ENABLED=true`. Not mounted in the verified configuration: it returns a JSON `404` with `ROUTE_NOT_FOUND`.                                                                                                                                |
| `/v2/*` (policy v2: decisions, register, reviews, evidence, console, notifications) | Experimental, opt-in | Documented in the OpenAPI document, marked `x-stability: experimental` (tag "Policy v2 (experimental)", listed below). Mounted only when `PARMANA_POLICY_V2_DECISIONS` and related settings are set. Without them each path returns `404` with `code: ROUTE_NOT_FOUND`. |
| `/v1/inbound/*`                                                                     | Experimental, opt-in | Inbound refund decision and outcome routes (RFC-0025). Mounted only when `INBOUND_AUDIENCE` is set, and the server fails closed if the gateway's private key is not configured.                                                                                         |
| `/sandbox/approvals`                                                                | Demo, sandbox only   | Returns an approval signed by the sandbox's demo approver, and only for `sandbox:receipt`. The OpenAPI document says that in a production deployment this route does not exist.                                                                                         |

### Policy version 2 operations (experimental)

These 28 operations are in the OpenAPI document. Their shapes come from the server's routers and the SDK's policy version 2 models. The TypeScript SDK calls four of them (`decidePolicyV2`, `policyV2Review`, `decidePolicyV2Review` and `policyV2Replay`). The two notification endpoints are called by Amazon SES and the email channel, not by clients. Each is marked `x-stability: experimental`, and its shape may change in a minor release until the owner promotes it.

| Operation ID                 | Method | Path                                                              |
| ---------------------------- | ------ | ----------------------------------------------------------------- |
| `policyV2Console`            | GET    | `/v2/console/{screen}`                                            |
| `policyV2Decide`             | POST   | `/v2/decisions`                                                   |
| `policyV2Replay`             | GET    | `/v2/evidence/{recordId}/replay`                                  |
| `policyV2NotificationEvents` | POST   | `/v2/notifications/events`                                        |
| `policyV2SesNotification`    | POST   | `/v2/notifications/ses`                                           |
| `policyV2GoLiveGate`         | GET    | `/v2/register/actions/{capability}/go-live`                       |
| `policyV2GoLive`             | POST   | `/v2/register/actions/{capability}/go-live`                       |
| `policyV2RevokeReviewer`     | POST   | `/v2/register/actions/{capability}/reviewers/{reviewerId}/revoke` |
| `policyV2AddReviewer`        | POST   | `/v2/register/actions/{capability}/reviewers`                     |
| `policyV2RecordTest`         | POST   | `/v2/register/actions/{capability}/tests`                         |
| `policyV2RegisterAction`     | POST   | `/v2/register/actions`                                            |
| `policyV2ApproveApproverKey` | POST   | `/v2/register/approver-keys/{approverId}/{keyId}/approve`         |
| `policyV2RevokeApproverKey`  | POST   | `/v2/register/approver-keys/{approverId}/{keyId}/revoke`          |
| `policyV2ProposeApproverKey` | POST   | `/v2/register/approver-keys`                                      |
| `policyV2RegisterAudit`      | GET    | `/v2/register/audit`                                              |
| `policyV2SetContact`         | POST   | `/v2/register/contacts`                                           |
| `policyV2ApprovePolicy`      | POST   | `/v2/register/policies/{capability}/{policyVersion}/approve`      |
| `policyV2ProposePolicy`      | POST   | `/v2/register/policies`                                           |
| `policyV2GrantRole`          | POST   | `/v2/register/roles/grant`                                        |
| `policyV2RevokeRole`         | POST   | `/v2/register/roles/revoke`                                       |
| `policyV2ApproveSource`      | POST   | `/v2/register/sources/{name}/approve`                             |
| `policyV2RevokeSource`       | POST   | `/v2/register/sources/{name}/revoke`                              |
| `policyV2ProposeSource`      | POST   | `/v2/register/sources`                                            |
| `policyV2ApproveThreshold`   | POST   | `/v2/register/thresholds/{action}/{name}/approve`                 |
| `policyV2ProposeThreshold`   | POST   | `/v2/register/thresholds`                                         |
| `policyV2RegisterRead`       | GET    | `/v2/register`                                                    |
| `policyV2DecideReview`       | POST   | `/v2/reviews/{id}/decision`                                       |
| `policyV2GetReview`          | GET    | `/v2/reviews/{id}`                                                |

## The endpoint index

The [endpoint index](endpoint-index.md) lists all 66 operations in the OpenAPI document with their method, path, operation id, authentication requirement, the TypeScript SDK method that calls each one (where there is one), and the summary.

## Next

- [Core endpoints](endpoints.md): the request and response for each core route, with `curl`, JavaScript and Python examples.
- [Error codes](../reference/error-codes.md)
- [Troubleshooting](../troubleshooting/README.md)
