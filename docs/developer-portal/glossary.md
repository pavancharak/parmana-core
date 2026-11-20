# Glossary

[Portal home](README.md) · [Overview](overview.md) · [Reference](reference/README.md)

Terms are in alphabetical order. Where a term has a page with more detail, the entry links to it.

## Approval artifact

The signed JSON that a human approver produces with `signApproval()` (TypeScript) or `sign_approval()` (Python). It names the capability, the target (`resourceId`), an optional maximum amount (`maxAmount`), an expiry, and a nonce, and is signed with the approver's Ed25519 key. The agent or application attaches it to `signals.approvalArtifact`. See [Overview](overview.md#core-concepts) and the [TypeScript SDK](sdk/typescript.md#human-approvals-signapproval).

## Authority

The party a Business Transaction acts for (`authority`): its id, its type (`USER`, `ROLE`, `SERVICE`, `ORGANIZATION`), and its principal id. The caller's key must be allowed to act for the principal.

## Authorization

The grant that makes the action allowed (`authorization`), linked to the authority by `authorityId`.

## Bound signal

A policy fact that must equal a field of the request, such as `paymentAmount` equals `parameters.amount`. The server checks the equality before the rules run. See [Policy management](policies/README.md#signals).

## Business Transaction

The declared request for one business action. It has a `businessTransactionId` (a UUID the caller chooses and which is single-use), `metadata`, `authority`, `authorization`, `intent`, `policy` and `signals`. See the [request schema](https://github.com/pavancharak/parmana-core/blob/main/schemas/requests/transaction-create-request.schema.json).

## Canonical JSON

The byte form of a JSON value that signatures and hashes are computed over: object keys sorted, no insignificant whitespace, non-ASCII characters as they are, UTF-8. The same rule holds in the server, both SDKs and the verifiers. See [Security](security/README.md#hashing-and-canonical-json).

## Checker

The second person in a maker-checker approval. A checker must be listed for the policy in `POLICY_CHANGE_CHECKERS`, must be a human, must not be the maker, and approves with a step-up envelope. See [Maker-checker](tutorials/maker-checker.md).

## Connector

The component that performs the business call (for example a payment), reached only through the execution gateway, with signed releases. Implementations are in the `parmana-connectors` repository. See [Architecture](architecture.md) and the [connector SDK](sdk/connector-sdk.md).

## Coverage

What a record's signatures protect. `full` for a schema 3 record that verifies: every top-level field except the excluded lists. `legacy` for a schema 2 record: only the seven covered fields. See [Security](security/README.md#schema-versions-and-coverage).

## Declare

Record a Business Transaction as `RECEIVED` with `POST /transactions` (`declareTransaction()`). Nothing is decided or released. A declared transaction executes as declared, and its approval must be inside it when it is declared.

## Decision

The outcome of evaluating a policy for a transaction: the rules that matched and the result. An approved request's record carries it at `executions[0].decision`. A refusal produces a refusal record with a `decision`.

## Execute

Decide and, if approved, release a transaction. `POST /execute` does it in one request. `POST /transactions/{id}/execute` executes a declared transaction. See [API: execute](api/endpoints.md#execute-and-declare).

## Execution gateway

The only path through which Parmana releases an approved request to a connector. It re-verifies the signed authorization before release. See [Architecture](architecture.md#components).

## Execution Trust Record

The signed evidence for one Business Transaction. It holds the transaction, the authorization, the overrides, the executions (with their decisions), the verifications, the receipts, an evidence anchor, timestamps, the `trustRecordHash`, and the signature. Verify it with the server or offline. See [Evidence verification](security/evidence-verification.md).

## Fail closed

Refuse rather than guess. When a fact cannot be verified, or a source does not answer, or signing is unavailable, Parmana refuses and does not execute. See [Security](security/README.md#fail-closed-behaviour).

## Gateway attestation

The gateway's signed statement about a release, made with the `gateway` key.

## Human approval

A signed approval from a person (see [approval artifact](#approval-artifact)). The agent cannot create it. The server verifies it against the approvers it trusts. A declared `humanApproved: true` without a verified approval is refused.

## Intent

The action a Business Transaction asks for (`intent`): its `action` (a capability in the form `namespace:name`), its `target`, its `parameters`, and its id, linked to the authorization.

## Maker

The person who proposes a policy change. A maker cannot approve their own change. See [Maker-checker](tutorials/maker-checker.md).

## Maker-checker

Two-person governance for policy changes: a maker proposes a version, and a different, listed checker approves it with a step-up envelope. Only then does the version take effect. See [Policy management](policies/README.md#how-a-policy-version-is-approved).

## Offline verification

Checking an Execution Trust Record without contacting the server, against public keys you pin. The standalone verifier and the SDK functions both do it. See [Evidence verification](security/evidence-verification.md).

## Pinned key

A public key you trust, identified by its fingerprint, which you compared with a value from a second source before you accepted it. Verification uses only pinned keys. See [Evidence verification](security/evidence-verification.md#step-2-pin-the-keys-you-trust).

## Policy

A JSON document, named and versioned, that states the rules for one kind of action. The organization writes it and owns it. See [Policy management](policies/README.md).

## Policy version in effect

The most recently approved version for a policy name. The server executes only that version. A request that names an older version is refused as superseded. See [Policy management](policies/README.md#versions-and-the-version-in-effect).

## Principal

The party an action is for (`authority.principalId`), such as a person or a service account. A caller's key lists the principals it may act for.

## Receipt

A signed statement that a record was verified, with its hash. Issued by `POST /receipt`, which requires a `VERIFIED` record. See [API: receipts](api/endpoints.md#verify-replay-and-receipts).

## Refusal record

The signed record of a refused execution, retrievable by its business transaction id with `GET /refusal/{id}`.

## Replay

Checking a stored record's hash and signature again with `POST /replay`. It runs no policy and executes nothing.

## Reconcile

Comparing a transaction whose outcome is pending or unknown (a `202`, `500` or `502`) with the connector and the audit events, and setting its status. `POST /transactions/{id}/reconcile`. Do not resubmit the transaction instead.

## Schema version

The version of the record's signed structure. `2` (or none) signs seven top-level fields. `3` signs the whole record except the excluded lists. See [Security](security/README.md#schema-versions-and-coverage).

## Signals

The facts a policy reads, on the request (`signals`). Each fact is bound, sourced, approved, or declared. See [Policy management](policies/README.md#signals).

## Sourced fact

A policy fact that a registered source answers, not the caller. Parmana asks the source about a subject (the target, or a parameter), and the answer is valid for a freshness window (`maxAgeSeconds`). The caller's value is ignored. An example is `paymentRefundable` in the refund policy. See [Refund authorization](tutorials/refund-authorization.md).

## Step-up envelope

A short-lived signed statement, made with the checker's own step-up key, that approves or rejects one pending policy change. Valid for 120 seconds by default. See [Maker-checker](tutorials/maker-checker.md#step-4-the-checker-reviews-and-approves).

## Superseded

A policy version that is no longer the one in effect, because a later version was approved. Requests naming it are refused.

## Trust set (trust file)

The JSON list of public keys a verifier accepts, each with its fingerprint, validity window and compromise flag, and the optional legacy settings. See [Verifier](sdk/verifier.md#the-trust-file).

## Verification

Checking a record: on the server with `POST /verify` (the result is `VERIFIED` or `FAILED`), or offline with a pinned trust set. A `200` from the verify route is not the result: read the `status`.
