# Parmana end to end: how an action is approved, checked, released and recorded

This document describes, step by step, how Parmana decides whether an action may run. It covers the three paths that exist today:

1. **Execute**: an agent asks Parmana to run an action through `POST /execute`.
2. **Inbound check and redemption**: a partner's system asks Parmana for a decision, then redeems it once before acting.
3. **Trusted facts**: how facts a policy relies on are established.

Each statement below was checked against the code in this repository. Where a behaviour is not guaranteed, the document says so in the section "What is not guaranteed".

---

## 1. Definitions

| Term                       | Meaning                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Caller**                 | The authenticated client making a request, identified by an API key.                                                                          |
| **Business transaction**   | One request to do one action. It has a unique `businessTransactionId`.                                                                        |
| **Intent**                 | What the action is: `intent.action` (the capability), `intent.target`, `intent.parameters`.                                                   |
| **Policy**                 | The rules that decide whether an action may run. It is loaded by `name` and `version`.                                                        |
| **Declared fact (signal)** | A value the caller puts in `signals`. By itself it is not trusted.                                                                            |
| **Bound signal**           | A signal the policy requires to equal a value in the Intent (`boundSignals`).                                                                 |
| **Approval artifact**      | A signed statement from a registered human approver, covering one action, one resource and a scope, valid for a limited time and usable once. |
| **Sourced fact**           | A fact the policy declares in `signalSources`. Parmana asks a registered business system for it.                                              |
| **Trusted fact**           | A value Parmana obtained from a registered business system, verified by its signature, and not older than the policy allows.                  |
| **Verified fact**          | A declared fact that is bound to the Intent, backed by an approval artifact that verifies, or is a trusted fact.                              |
| **Probe**                  | A decision Parmana runs with only verified facts, to check whether the caller's declared facts were needed for the approval.                  |
| **Decision**               | The outcome of evaluating a policy: `APPROVED` or `REJECTED`, with a reason.                                                                  |
| **Authorization**          | The signed record that lets the execution gateway release one approved action.                                                                |
| **Trust record**           | The signed record of what was decided and why, written for every execution.                                                                   |

---

## 2. The rule that governs every approval

**A caller's declared facts can cause a refusal. They can never be the reason for an approval.**

Concretely, an approval is valid only if every fact the approval depends on is one of:

- a value bound to the Intent (`boundSignals`), or
- backed by an approval artifact that verifies (`approvalSignals`), or
- a trusted fact from a registered business system (`signalSources`).

If the policy reaches APPROVED only because of a declared fact that is none of these, Parmana refuses the request with the reason `requires_trusted_facts`.

This rule is enforced in two places:

- **Execute path:** `RuntimeEngine.execute` (`packages/runtime/src/RuntimeEngine.ts`).
- **Inbound check path:** `POST /v1/inbound/checks` (`packages/api/src/routes/inbound-checks.ts`).

---

## 3. Path 1: `POST /execute`

### 3.1 Request

The caller sends a business transaction as JSON to `POST /execute` with `Authorization: Bearer <api key>`. The body includes at least `businessTransactionId`, `intent`, `policy` (`name`, `version`), `signals`, `metadata` and `status`.

### 3.2 Steps, in order

1. **Caller authentication.** With caller authentication on, a request without a valid key is refused with `401`. Caller identity is set on the request; it is not read from the body.
2. **Principal and capability checks.** The caller must be allowed to act as the principal in the request and allowed to invoke `intent.action`. Otherwise `403`.
3. **Structural validation.** A malformed transaction, or one whose `businessTransactionId` was already accepted, is refused with `400` or `409`.
4. **Declaration.** The transaction is recorded as `RECEIVED`.
5. **Probe (only when `signals` is not empty).**
   - Parmana runs the policy again with only the verified facts:
     - declared signals whose names are in the policy's `boundSignals`, or in its `approvalSignals` together with the artifact key of each approval (default `approvalArtifact`);
     - and nothing else. Every other declared signal is removed.
   - Sourced facts are then answered by their trusted source, whatever the caller declared.
   - The probe does not consume approvals and does not write a refusal record.
   - If the probe does not reach APPROVED, the request is refused with `requires_trusted_facts`. The probe runs **before** any approval is consumed, so the approval is still unused when the probe checks it.
6. **Main decision.** Parmana evaluates the policy with all declared signals:
   - **Binding.** Each bound signal must equal its Intent value. A mismatch refuses the request (`INVALID`).
   - **Approval.** Each approval-backed signal set to `true` must be backed by an approval artifact that verifies: correct approver key, approved capability, approved resource, scope covering the value, not expired, and not used before. A verified approval is consumed here.
   - **Sourced facts.** Each sourced fact is requested from its registered business system (section 5). The caller's value for the same fact must equal the trusted value, otherwise the request is refused as `INVALID`.
   - **Policy rules.** The rules are evaluated on the verified values. A rule that needs a fact that is not present refuses the request (the fact was "not sent").
7. **Outcome.**
   - `REJECTED`: the trust record is written with the reason, and the request is refused. For a refusal by the policy, a refusal record is also written.
   - `APPROVED`: an authorization is signed, and the request goes to the execution gateway.
8. **Execution gateway (`ExecutionGateway.verify`, then release).** Before any connector runs, the gateway checks:
   - an authorization is presented;
   - its signature and expiry are valid;
   - the policy's current content hash matches the hash the authorization was signed under;
   - the signals still hold, when a signal state verifier is configured;
   - the authorization has not been revoked;
   - the decision it rests on was `APPROVED`;
   - the nonce has not been used before (it is consumed last, and only on success).
     If any check fails, nothing is released.
9. **Release and record.** The connector runs. The execution evidence and trust record are written and signed.

### 3.3 Responses

| Outcome                                                                 | Status | Body                                                         |
| ----------------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| Approved and released                                                   | `200`  | The trust record, signed.                                    |
| Refused by a policy rule                                                | `403`  | Error with the policy's reason.                              |
| Refused: declared facts alone approved it                               | `403`  | `Execution rejected: requires_trusted_facts`                 |
| Refused: a trusted source did not answer, answered stale, or conflicted | `403`  | `SOURCE_UNAVAILABLE` (or the source's failure) in the reason |
| Refused: no valid approval                                              | `403`  | Reason names the missing or invalid approval                 |
| Not authenticated                                                       | `401`  |                                                              |
| Not allowed to act for this principal or capability                     | `403`  |                                                              |
| Malformed transaction                                                   | `400`  |                                                              |
| Transaction id already accepted                                         | `409`  |                                                              |

---

## 4. Path 2: partner inbound check and redemption

Used when an external agent (through a partner's system) asks Parmana whether a refund-like action may proceed. The action itself is performed by the partner's system.

### 4.1 Request a decision

`POST /v1/inbound/checks` with the partner's credential.

```json
{
  "capability": "payments:refund",
  "audience": "<the audience registered for the partner>",
  "target": "pay_XXXXXXXX",
  "parameters": { "amount": 100000 },
  "signals": { "<declared facts, optional>": "..." }
}
```

- `capability` must match `namespace:verb` in lower case.
- `audience` must equal the server's configured `INBOUND_AUDIENCE`.
- Every limited value (for example `parameters.amount`) must be a **whole number greater than zero**. Otherwise `400`.
- The partner must hold a current grant for the capability. Otherwise `403 no_active_grant`.
- The grant's maximum applies to the limited value. Above the maximum, the decision is `REJECTED` with `approval_required`.
- The grant's minimum, if set, applies. Below it, the decision is `REJECTED` with `below_limit_minimum`.
- The policy bound to the capability must exist and load. Otherwise `403 no_policy_bound` or `403 policy_unavailable`.
- The policy is run **twice** when the partner declared signals:
  - once with the declared signals;
  - once as a probe (only verified facts).
    If the first run approves but the probe does not, the decision is `REJECTED` with `requires_trusted_facts`.

### 4.2 The decision

A successful request returns `201` with:

- `decisionId`, `outcome` (`approved` or `rejected`), `reason` when rejected;
- `partnerId`, `capability`, `target`, `amount`;
- `policyName`, `policyVersion`;
- `expiresAt` (ten minutes after the decision);
- `audience`;
- `signature` (Ed25519, gateway key);
- `secondarySignature` (ML-DSA-65, post-quantum key), when the server has the ML-DSA-65 key configured.

Both signatures cover the same canonical bytes: every field except the two signatures, keys sorted at the top level, compact JSON.

A decision is valid only when `outcome` is `approved`, **both** signatures verify (when a secondary signature is present; decisions issued before it existed have only `signature`), and the time is before `expiresAt`.

### 4.3 Redeem the decision once

Before the partner's system acts on an approved decision, it must redeem it:

`POST /v1/inbound/checks/{decisionId}/redeem`, with the same partner credential.

| Status | Body                                | Meaning                                         |
| ------ | ----------------------------------- | ----------------------------------------------- |
| `200`  | `decisionId`, `redeemedAt`          | Redeemed now. Act once.                         |
| `409`  | `already_redeemed`                  | Redeemed before. Do not act.                    |
| `409`  | `decision_not_approved`             | The decision was a refusal. Do not act.         |
| `409`  | `decision_expired`                  | Older than ten minutes. Request a new decision. |
| `403`  | `not_the_partner_for_this_decision` | Issued to another partner.                      |
| `404`  | `decision_not_found`                | No such decision.                               |
| `401`  | `unauthenticated`                   | No partner identity.                            |
| `503`  | `redemption_not_configured`         | The server has no redemption store.             |

**Order:** request a decision, verify both signatures, redeem, then act. A decision that was not redeemed is not a permission to act.

### 4.4 Refusal reasons on the decision

| `reason`                 | Meaning                                              |
| ------------------------ | ---------------------------------------------------- |
| `policy_rejected`        | The policy did not approve.                          |
| `approval_required`      | Above the grant's maximum.                           |
| `below_limit_minimum`    | Below the grant's minimum.                           |
| `requires_trusted_facts` | Approved only because of facts the partner declared. |

---

## 5. Trusted facts: business systems

### 5.1 What a business system is

A business system is an HTTPS endpoint, owned by the organisation, that answers questions such as "is order 123 confirmed?". Parmana asks it directly. The partner's agent does not supply the answer.

### 5.2 Registration (maker checker)

1. A maker proposes a source: `POST /business-signal-sources/changes` with `action: "register"`, `name`, `endpointUrl` (https), `publicKeyPem` (Ed25519 public key, **required**), and optionally `keyId` (requires `publicKeyPem`), `timeoutMs` (integer from 1000 to 30000; default 10000), and `reason`.
2. A **different** person (the checker) approves it: `POST /business-signal-sources/changes/{id}/approve`, with a step-up authorization for that change. The maker cannot approve their own change.
3. Parmana checks the endpoint's address when proposed and again when approved. Private, loopback and non-resolving addresses are refused.
4. Revocation uses `action: "revoke"` through the same maker checker process.

A source without `publicKeyPem` cannot be registered.

### 5.3 The query Parmana sends

For each sourced fact, Parmana sends a query signed by Parmana. It contains: the claim, the subject (`target` or an Intent path), the Intent action, the business transaction id, a nonce, `issuedAt` and `expiresAt` (60 seconds). Only the parameters named in the policy are sent.

### 5.4 The answer the system returns

HTTP 200 with an envelope: `answer` plus `signature` (Ed25519, with the source's key). The answer contains:

| Field        | Meaning                                   |
| ------------ | ----------------------------------------- |
| `status`     | `observed`, `not_found` or `conflicting`. |
| `value`      | Required when `observed`.                 |
| `observedAt` | When the value was observed. Required.    |
| `validUntil` | Optional.                                 |
| `nonce`      | Must equal the query's nonce.             |

### 5.5 How Parmana accepts an answer

Parmana accepts the answer **only if all of these hold**:

- the response is HTTP 200, is at most 16 KB, and the connection is pinned to the registered address; redirects are not followed;
- the envelope signature verifies with the source's registered key;
- the answer's nonce equals the query's nonce;
- `observedAt` is valid and not more than 60 seconds in the future;
- the value is not older than the policy's `maxAgeSeconds` (default 300, at most 86400);
- the answer arrives within the source's `timeoutMs`.

Anything else refuses the request:

| Source result                                                      | Effect                                |
| ------------------------------------------------------------------ | ------------------------------------- |
| Unreachable, timeout, bad signature, wrong nonce, stale, malformed | Request refused: `SOURCE_UNAVAILABLE` |
| `not_found`                                                        | Request refused: missing fact         |
| `conflicting`                                                      | Request refused: conflicting data     |

A source that is registered without a key is never used, because its answers could not be verified.

### 5.6 How a policy declares a sourced fact

```json
"signalSources": {
  "vendorVerified": {
    "source": "orders-system",
    "claim": "vendor.verified",
    "subject": "target",
    "maxAgeSeconds": 60,
    "parameters": ["amount"]
  }
}
```

- `source`: the registered name.
- `claim`: what to ask.
- `subject`: `target`, or a dot path into the Intent parameters such as `parameters.orderId`.
- `maxAgeSeconds` (optional): default 300.
- `parameters` (optional): up to 16 names of Intent parameters the source needs.

A fact declared here is not read from the caller's signals to approve.

---

## 6. Keys and signatures

| Item                    | Algorithm | Used for                                         | Where it comes from                                                                      |
| ----------------------- | --------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Gateway key             | Ed25519   | Authorizations; `signature` on inbound decisions | `PARMANA_GATEWAY_KEY_ID` in `PARMANA_KEY_MATERIAL_JSON` (or the configured key provider) |
| `default-secondary` key | ML-DSA-65 | `secondarySignature` on inbound decisions        | Key id `default-secondary` in `PARMANA_KEY_MATERIAL_JSON`                                |
| Approver keys           | Ed25519   | Approval artifacts                               | Registered approvers, maker checker                                                      |
| Business source keys    | Ed25519   | Signed answers from business systems             | Registered with the source, maker checker                                                |

The server refuses to start when `INBOUND_AUDIENCE` is set and either inbound key is missing.

---

## 7. Operator checklist: making this work in an environment

1. **Keys.** Provide the gateway key and the `default-secondary` ML-DSA-65 key. Confirm the server starts with them.
2. **Business systems.** For each policy that declares `signalSources`, register each named source with its public key (section 5.2). A policy whose sources are not registered refuses every request. This is intended.
3. **Approvers.** Register each human approver's Ed25519 key through maker checker, with the capabilities they may approve.
4. **Inbound.** Set `INBOUND_AUDIENCE`. For each partner, grant the capability, with a maximum and, where needed, a minimum for the limited value. Each grant must have limits; a grant without limits lets the policy approve any amount it allows.
5. **Partner systems.** The partner verifies both signatures, checks expiry, redeems each decision once, and only then acts. The partner must stop holding the direct credential for the action, or the action can still happen outside Parmana.

---

## 8. What is guaranteed

Within Parmana's own path, and given the assumptions in section 9:

- An action released through the execution gateway has a signed authorization that was approved under the policy version in force, and that authorization is used once.
- A caller's declared fact cannot, on its own, produce an approval.
- A sourced fact is used only when its registered source answered with a valid signature, a matching nonce and a value that is not stale.
- An inbound decision is valid only with both signatures (when present) and before expiry; it can be redeemed once.
- A signed trust record is written for each execution.

## 9. What is not guaranteed

- **Direct calls.** An agent or partner that holds a downstream system's credential can act without Parmana. Parmana cannot see or stop this. Open gap G-129.
- **Redemption is not enforced by Parmana.** Parmana refuses a second redemption. It cannot stop the partner from acting without redeeming. Open gap G-129.
- **Key compromise.** A compromised gateway, approver, source, or `default-secondary` key, or write access to the database, is not detected. These are stated assumptions.
- **Host and deployment.** Parmana assumes the host, container, image and source it runs from are not compromised.
- **Declared facts for inbound grants without limits.** Any amount the policy allows is approved.
- **Parameters outside the approval.** An approval names the action and resource, not every parameter.
- **Human approval for inbound checks.** Inbound decisions are made by policy and grant limits. No person approves each one.
- **Older inbound route.** `POST /v1/inbound/decisions` (refund decisions) is not dual-signed and is not redeemed by this path.
- **Persistence of the secondary signature** is covered by the code and migration; a dedicated read-back test is not present.

## 10. Known gaps, by identifier

| ID    | Gap                                                                                  | Status           |
| ----- | ------------------------------------------------------------------------------------ | ---------------- |
| G-129 | Direct calls to business systems are not checked.                                    | Open             |
| G-143 | Approval fields on inbound records are not read by anything outside this repository. | Partly closed    |
| G-144 | Permanent source of facts for inbound decisions.                                     | Draft (RFC-0026) |
| G-146 | No business system calls the inbound check; the probe is not scheduled.              | Partly closed    |

## 11. Where each rule lives in the code

| Rule                                   | Location                                                            |
| -------------------------------------- | ------------------------------------------------------------------- |
| Execute: probe and declared-facts rule | `packages/runtime/src/RuntimeEngine.ts`, `execute()` and `decide()` |
| Execute: release checks                | `packages/execution-gateway/src/ExecutionGateway.ts`, `verify()`    |
| Approval verification                  | `packages/approval/src/ApprovalSignalVerifier.ts`                   |
| Trusted fact resolution                | `packages/runtime/src/business-validation/TrustedSignalResolver.ts` |
| Business system protocol and checks    | `packages/api/src/business-sources/HttpBusinessSignalSource.ts`     |
| Source registration                    | `packages/api/src/routes/business-signal-sources.ts`                |
| Inbound check                          | `packages/api/src/routes/inbound-checks.ts`                         |
| Inbound check wiring and keys          | `packages/api/src/app.ts`, `packages/api/src/server.ts`             |
| Policy format                          | `packages/policy/src/types/Policy.ts`                               |

## 12. Test evidence

- Unit and integration suites: the full suite passes (4,675 tests) with a local database.
- Examples: `npm run examples` completes all tutorials.
- The test seam for trusted facts (`createApplication`, `RuntimeFactory`, `RuntimeBuilder`) is test-only. Production passes no registry and uses the registered business systems.
