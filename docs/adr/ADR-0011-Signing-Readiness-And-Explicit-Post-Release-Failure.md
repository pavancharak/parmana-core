# ADR-0011: Signing Readiness Before Release and Explicit Failure After Release

**Status:** Accepted, implemented, and the success path verified live against production (2026-09-20). The failure paths are verified in tests only, see "Verification status" below.

**Date:** 2026-09-20

**Relates to:** `docs/VERIFICATION-GAPS.md` G-52 (this decision mitigates it), gap 60 (the mitigation), G-53 (what remains), `docs/CLAIMS.md` section 2.38, ADR-0010.

## Context

The runtime processes a request in this order: decide, authorize, release the action to the connector through the Execution Gateway, then build, sign and persist the Execution Trust Record. The record comes last because it contains the result of the execution.

On 2026-09-20 a live `paytm:refund` returned `500` because AWS KMS refused to sign the record (ADR-0010). The Paytm connector service had already logged `POST /connector/paytm-refund`. The action was released and no signed trust record was produced. That is G-52: any failure after release, whether a signing outage, a database error or a key problem, leaves an executed action with no signed record. The caller saw only a generic `500 Internal Server Error`, which reads as "nothing happened" and invites a blind retry.

ADR-0010 removed the most likely cause, but not the ordering.

## Decision

Two changes. Neither claims to close G-52 completely.

### 1. Prove the signing path before releasing

Before the action is released, the engine calls `signingReadiness.assertReady()`. If signing cannot currently produce a signature that verifies, the request is refused with `503 SIGNING_UNAVAILABLE` and nothing has been executed. This is fail closed.

- **The probe** is `VerificationCrypto.probeSigning()`. It signs a synthetic artifact through the same `Signer` and key id used for Execution Trust Records, then verifies the result against the public key the same `Signer` publishes. The artifact is padded past 4096 bytes so the large message path from ADR-0010 is exercised. It catches a missing, disabled or access denied key, a KMS or network outage, a signing and verification key mismatch, and the KMS size limit. It signs nothing that is stored or trusted.
- **Caching.** `CachedSigningReadiness` trusts a success for 60 seconds, never caches a failure so recovery is seen on the next request, and shares one in flight probe between concurrent requests. Under KMS this is one `Sign` and one `GetPublicKey` call at most once a minute per instance, using permissions the deployment already needs.
- **Default.** Enforced everywhere except when `NODE_ENV` is exactly `test` or `development`, where it stays off unless `SIGNING_READINESS_CHECK` is exactly `true`. In production, or with `NODE_ENV` unset or unrecognized, no variable can turn it off. This is the same rule as `createPolicyExecutionVerifier()`.

### 2. Say so explicitly when the record fails after release

Any failure after the pipeline released the action, in the trust record pipeline, the `afterExecution` and `beforeTrustRecord` hooks, or persisting the record, is thrown as `ExecutionRecordIncompleteError`: `500 EXECUTION_RECORD_INCOMPLETE`. The message names the `businessTransactionId` and `authorizationId`, states that the action was released, and says not to retry as a new transaction and to reconcile instead. A critical log event is written with the same identifiers and the cause: `execution_released_record_failed` or `execution_released_record_persist_failed`.

A failure before release, such as a policy rejection, is not reclassified.

## What this does not do

- **A transient failure between the readiness check and the real signing still happens.** The window is smaller and the persistent causes are caught, but the ordering is unchanged.
- **It does not help when the database is the failure.** The record can still be missing after a release.
- **There is no two phase record and no rebuild path.** A missing record is reported honestly and logged, but it cannot be reconstructed automatically (G-53).

## Why not the two phase record now

The complete answer to G-52 is to persist a signed execution intent before release and finalize it afterwards, so an executed action always has a signed record. It was not built here because it changes more than this decision should:

- The trust record repository holds exactly one record per transaction, and the record contains the execution result. A preliminary record that is later replaced or extended changes storage, `findByTransactionId`, verification, receipts and replay.
- It needs a schema change and a migration story for existing records and the offline verifiers.
- It needs a decision on how a finalized record chains to its preliminary one.

That is a design decision for its own ADR. Until then the mitigation above is the stated position.

## Alternatives considered

1. **Only the explicit failure, no readiness gate.** Cheaper, but the connector is still called before a persistent signing problem is discovered. Rejected.
2. **Probe on every request.** Adds a KMS round trip and cost to every execution. A one minute cache gives nearly the same protection. Rejected.
3. **Sign a preliminary record before release.** The complete answer, deferred as described above.

## Consequences

- A persistent signing problem now stops the request with `503` before anything runs. Callers can retry once signing is healthy, using a new `businessTransactionId` because the original was already accepted.
- A failure after release is distinguishable from a failure before it, and carries what an operator needs to reconcile.
- Startup logs now include `signingReadinessConfigured`, so an operator can confirm the gate is on.

## Verification status

Verified in tests:

- `packages/runtime/tests/unit/signing-readiness.test.ts`: cache hit, expiry, failures never cached, concurrent callers share one probe, `503` carries the cause.
- `packages/runtime/tests/unit/execution-record-incomplete.test.ts`: when readiness fails the release counter stays at zero and the error is a `503`. When the trust pipeline fails after release the counter is one, the error is `EXECUTION_RECORD_INCOMPLETE` with the identifiers and a critical log. A persistence failure is reported the same way. A policy rejection before release is not reclassified.
- `packages/crypto/tests/unit/signing-probe.test.ts`: the probe succeeds with a matching key, fails with a missing key, and fails when the published public key does not match the signing key.
- `packages/api/tests/unit/bootstrap/create-signing-readiness.test.ts`: enforced in production, cannot be disabled by the environment variable, enforced when `NODE_ENV` is unset or unrecognized, off in test and development unless exactly `true`.

Verified live on 2026-09-20 against production commit 4047536 and the real AWS KMS service: the startup log shows `signingReadinessConfigured: true`, and one synthetic `paytm:refund` through `/execute` returned `200` with the decision APPROVED, `verifications[0].status` `VERIFIED`, a signed chain and a signed receipt. That request could only proceed because the readiness probe passed, so a real KMS `Sign` and `GetPublicKey` round trip with a message over 4096 bytes succeeded, and there was no `SIGNING_UNAVAILABLE` or `ValidationException` in the runtime log. The failure paths (a refusal with `503 SIGNING_UNAVAILABLE`, and `500 EXECUTION_RECORD_INCOMPLETE`) are covered by unit tests, not by a live fault injection against production.
