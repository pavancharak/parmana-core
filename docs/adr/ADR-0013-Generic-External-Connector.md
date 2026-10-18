# ADR-0013: Generic External Connector

**Status:** Accepted by the operator on 2026-09-30, with the proposed answers to the three open questions. Being built in the order below. Step 1 (registrations through maker checker, PR #92) is merged, its migration applied in production and live since 2026-09-30. Step 2 (the signed release adapter, PR #93) and step 3 (the SDK helpers, PR #94) are merged and deployed. Step 4 (a registered capability released to its endpoint, its policy bound from the registration) is merged and deployed (PR #97). Step 5 (examples, tutorial and the guide "Connect any external system") is merged (PRs #98 and #99). Step 6 (the live check) passed in production on 2026-10-01 against `https://parmana-release-check.vercel.app/api/release` (`examples/live-checks/external-connector/README.md`, `docs/CLAIMS.md` 2.50). All six steps are done; the SDK helpers ship with the next SDK release.

**Date:** Proposed and accepted 2026-09-30.

**Relates to:** ADR-0009 (the signed authorization the Paytm connector service verifies, which this generalizes), ADR-0012 (Execution Intents, unchanged by this), `docs/CLAIMS.md` 2.45 (approver keys through maker checker, the governance pattern reused here), 2.47 (every action needs a signed approval), 2.48 (the server tells an agent what a request must carry).

## Context

An agent that wants Parmana to govern an action on a new external system cannot get there today without a change to Parmana's own code. Adding the Slack connector touched about 20 source files in five packages: a connector package, a gateway adapter, the connector catalog and factory, `createConnectorRegistry.ts`, `createConnectorAuthenticator.ts`, a credential provider, a signal verifier, the capability to policy binding table and the policy. A customer's agent, or a customer's engineer using only the docs and the SDKs, cannot do that on the hosted service.

One connector already works differently. `paytm:refund` is released to a separate service over HTTPS (`GatewayPaytmAdapter`). Parmana signs what it approved with its own key, with an expiry, and sends it with a shared secret. The service verifies the signature against Parmana's public key before it touches Paytm, and Parmana accepts the result only when the response echoes the request. Parmana never holds Paytm's merchant key. That pattern is sound, in production, and specific to Paytm: its canonical string, its parameters and its path are fixed in code.

## Decision

Make that pattern general. An operator registers an **external connector**: a capability name bound to an HTTPS endpoint the operator runs, and to the policy that governs it. Registration goes through maker checker, like approver keys, and takes effect with no deploy. When a request for that capability is approved, Parmana releases it to the endpoint as a **signed release**. The endpoint verifies the release with a helper from either SDK, performs the action in its own system with its own credentials, and answers with a result Parmana checks and records.

After this, connecting a new external system needs no change to Parmana: write a policy, register the connector, build the endpoint with an SDK, get both approved.

### 1. The registration

Stored in a new table, changed only through maker checker (a proposal by one human caller, approval by another with a step up signature), exactly as `approval_issuers` is. One active registration per capability.

| Field               | Rule                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capability`        | `namespace:verb`. Must not be a capability of a built in connector (`paytm:`, `hubspot:`, `github:`, `slack:` stay code).                                                                      |
| `endpointUrl`       | `https://` only. Refused if the host is an IP literal, `localhost`, or resolves to a private, loopback or link local range, checked at registration and again at every release (see Security). |
| `policy`            | The policy name that governs it. The version in effect is still decided by policy governance, as for every policy (2.43).                                                                      |
| `allowedParameters` | The only parameter names Parmana will forward. Any other parameter in a request is refused before release, as `GatewayPaytmAdapter` does.                                                      |
| `timeoutMs`         | Default 10000, at most 30000.                                                                                                                                                                  |
| `status`            | `active` or `revoked`. Nothing is deleted, so every release can be explained later.                                                                                                            |

The capability to policy binding moves, for these capabilities only, from the code table (`CANONICAL_CAPABILITY_POLICY_BINDINGS`) to the registration. `GET /policies/in-effect` answers for them the same way.

### 2. The signed release

Parmana sends `POST {endpointUrl}` with this body:

```json
{
  "release": {
    "version": 1,
    "connectorId": "ext-<capability>",
    "audience": "https://erp.example.com/parmana/release",
    "businessTransactionId": "…",
    "authorizationId": "…",
    "capability": "erp:create-invoice",
    "target": "customer-42",
    "parameters": { "amount": 1200, "currency": "INR" },
    "policy": { "name": "erp-invoice", "version": "1.0.0", "contentHash": "…" },
    "approvedBy": [
      {
        "approverId": "manager-x",
        "keyId": "manager-x-key-1",
        "approvalId": "…"
      }
    ],
    "issuedAt": "2026-10-01T10:00:00.000Z",
    "expiresAt": "2026-10-01T10:01:00.000Z"
  },
  "signature": {
    "algorithm": "Ed25519",
    "keyId": "default",
    "value": "<base64>"
  }
}
```

The signature covers the canonical JSON of `release` (the same canonical serialization the SDKs already use for step up and approvals). `audience` is the registered endpoint URL, so a release sent to one endpoint cannot be replayed to another. `expiresAt` is 60 seconds after `issuedAt`. No shared secret: the signature is the authentication, and the public key is published at `GET /keys/default`.

### 3. What the endpoint must do (and the SDK helper does)

`verifyParmanaRelease(body, { publicKey, audience, now })` in TypeScript and `verify_parmana_release(...)` in Python return the verified release or refuse with the failed checks, in this order:

1. The signature verifies against Parmana's public key.
2. `audience` equals the endpoint's own URL.
3. `expiresAt` is in the future (a small clock skew allowance, 30 seconds).
4. `businessTransactionId` was not executed before. The helper takes a store callback for this; the endpoint must persist it, because Parmana may retry after a timeout.

Then the endpoint performs the action, using only `capability`, `target` and `parameters` from the verified release, and answers `200` with:

```json
{
  "businessTransactionId": "…",
  "capability": "erp:create-invoice",
  "success": true,
  "result": { "invoiceId": "INV-991" },
  "executedAt": "2026-10-01T10:00:02.000Z"
}
```

A replayed `businessTransactionId` must return the first result again, not act twice.

### 4. What Parmana does with the answer

It accepts the result only if `businessTransactionId` and `capability` echo the release, `success` is a boolean, and `result` is an object of at most 16 KB. The result goes into the Execution Trust Record as connector evidence. Anything else, a non `200`, a timeout or a mismatch, is `502 EXECUTION_OUTCOME_UNKNOWN` with an `ERRORED` Execution Intent, the same as a built in connector today: the action may have run, and the operator resolves it.

### 5. Documentation and SDKs

A new docs page, "Connect any external system", with the complete order: write the policy (with its approval signal), propose and approve it, register the connector, build the endpoint with the SDK helper, get the registration approved, grant the capability to the agent's key, then send a request. Every step with the exact request, the expected answer and what to do if it differs, in the same form as `agents/integrate`. A runnable example endpoint in TypeScript and in Python, and a tutorial that runs the whole path against a local server.

## Security

- **SSRF.** Parmana makes an HTTPS request to a URL an operator entered. The URL is checked at registration and the resolved address again at release (so a DNS change cannot point it inside Parmana's network). Redirects are not followed. Only two humans together can register an endpoint.
- **A compromised endpoint** can report a false result, as a built in vendor could. It cannot widen what Parmana approved: the release names one capability, target and parameter set, all approved by a person, and the endpoint's answer is recorded as its claim, not as proof.
- **Parameters** are allowlisted per registration, so a request cannot smuggle fields the endpoint would act on.
- **No new secret for Parmana to hold.** The endpoint's own credentials to its system stay in the endpoint.

## What this does not do

- It does not replace the built in connectors; they stay as they are.
- It does not verify an endpoint's facts before the decision (signal state verification), as HubSpot's verifier does. Policies for external connectors therefore rely on the signed approval, which every policy now needs anyway (2.47).
- It does not run customer code inside Parmana.

## Alternatives considered

1. **Document the code path only.** Accurate, but only people who can change and deploy Parmana can follow it. Rejected by the operator on 2026-09-30.
2. **Keep a shared secret per connector, as Paytm does.** Parmana would have to store customer secrets. The signature with an audience gives the same authentication without one.
3. **Let the agent call the external system itself after an approval.** Then Parmana would not control release, and a manipulated agent could act without it. Rejected: Parmana must release the action.

## Open questions, decided 2026-09-30

1. May a registration override a built in capability namespace? **No.**
2. Should a registration carry a per endpoint rate limit? **Not in version 1.**
3. Should the endpoint sign its answer, so the result is attributable to it? **Optional in version 1, recorded when present.**

## Order of work if accepted

1. Migration and repository for registrations and their changes; routes under `/external-connectors` with maker checker; tests.
2. The generic gateway adapter: signed release, address checks, answer validation; hermetic tests with a mock endpoint, including SSRF, replay, audience, expiry and mismatch.
3. SDK helpers in both languages, with tests that verify a release signed by the real server code.
4. Binding and `GET /policies/in-effect` for registered capabilities.
5. Docs page, example endpoints, tutorial, OpenAPI, `llms-full.txt`, CLAIMS entry.
6. A live check against a deployed example endpoint before the claim is made.
