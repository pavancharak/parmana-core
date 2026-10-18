# ADR-0012: Signed Execution Intent Before Release

**Status:** Accepted and implemented on 2026-09-21. Verified live the same day. Two limits found while building it, G-54 and G-55, were both closed in the source the same day. The SDK methods are not published.

**Date:** Proposed 2026-09-20. Decided and built 2026-09-21.

**Relates to:** `docs/VERIFICATION-GAPS.md` G-52 (the ordering gap this closes), G-53 (no way to rebuild a missing record, now repairable with a limit), G-54 and G-55 (limits found while building it), gap 61 (the closure), ADR-0011 (the mitigation this builds on), `docs/CLAIMS.md` section 2.39. Operator procedure: the docs site page `concepts/execution-intents`.

## History of the decision

On 2026-09-20 this ADR was proposed and left undecided. On 2026-09-21 the decision was first recorded as "not now", and later that day it was reversed and the work was built. Both facts are recorded here so the gap register stays honest about what was decided when.

## Context

The runtime processed a request in this order: decide, authorize, release the action to the connector through the Execution Gateway, then build, sign and persist the Execution Trust Record. The record contains the result of the execution, which is why it is built last.

ADR-0011 added two things. Before release, the engine proves the evidence signing path works and refuses with `503 SIGNING_UNAVAILABLE` if it does not. After release, a failure to produce or persist the record is `500 EXECUTION_RECORD_INCOMPLETE`, with the identifiers and a critical log.

That left two facts, recorded as G-52 and G-53:

1. A transient failure between the readiness check and the real signing, or a database failure after release, could leave an executed action with no signed record.
2. When that happened, the context needed to build the record (the decision, the authorization and the execution result) existed only in the memory of the failed request and in the connector's response. The signed record could not be recreated.

## Decision

Option B from the proposal, with the finalize operation from option A: persist a signed execution intent before release, save the execution context right after release, and provide an operation that rebuilds a missing Trust Record from that saved context.

The order of a request is now: decide, authorize, signing readiness, **sign and store the Execution Intent**, release, **save the execution context**, build and store the Trust Record, **mark the intent finalized**. If the intent cannot be signed and stored, nothing is released and the caller gets `503 EXECUTION_INTENT_UNAVAILABLE`, the same fail closed shape as `SIGNING_UNAVAILABLE`.

## The six decisions the proposal left open

**1. What the intent contains and what is signed.** The ids (`intentId`, `businessTransactionId`, `decisionId`, `authorizationId`), `policyName`, `policyVersion`, `policyContentHash`, `signalsHash` and `businessTransactionHash` (the last three copied from the signed authorization rather than recomputed, so the intent cannot disagree with it), `action`, `target`, `submittedBy`, `grantedCapability` and `createdAt`. The execution result is not in it because it does not exist yet. The raw intent parameters are not in it either: `businessTransactionHash` binds the intent to them without repeating potentially sensitive values. The signature covers a canonical projection defined once in `ExecutionIntentCanonicalView.ts`, used by both the signer and every verifier.

**2. How finalization relates to the existing record.** A **separate linked record**, not an intent section inside the Trust Record. The Trust Record is hashed and signed over everything it contains, so completing it after signing would change its hash. The Trust Record therefore keeps its format, both SDK verifiers keep verifying it unchanged, and the intent links to it by `businessTransactionId` (one intent per transaction, enforced by a unique constraint) and by `trustRecordId` once finalized. The intent's own status (`PREPARED`, `RELEASED`, `FINALIZED`, `ERRORED`, and `RESOLVED`, see below) is **unsigned operational state** stored beside the signed part, so it can change after signing without invalidating anything.

**3. The schema and migration.** A new table `execution_intents` (`supabase/migrations/20260921120000_add_execution_intents.sql`). It changes no existing table. Transactions that predate it simply have no intent, and their behavior is unchanged. A foreign key to `business_transactions`, a unique constraint on `business_transaction_id`, a check constraint on the state values, and a partial index on the unfinalized rows. **Deployment order matters:** the migration must be applied before the code is deployed, because the gate is enforced by default and there is no switch to turn it off in production. `GET /ready` returns `NOT_READY`, naming the migration file, when the table is missing.

**4. Idempotency.** `ExecutionIntentFinalizer.finalize()` is idempotent and never calls a connector. If a Trust Record already exists it returns it (`ALREADY_FINALIZED`) and builds nothing, and it corrects the intent status if that update had been lost. If the record appears between its check and its write, it treats that as already finalized. State transitions are enforced in SQL (`markReleased` and `markErrored` only move a `PREPARED` row, `markFinalized` never moves a `FINALIZED` row), so they hold under concurrency.

**5. What a verifier reports for an intent that was never finalized.** The intent verifies as valid, because it was signed. Whether it was finalized is a separate fact, reported in `status.state`, so an auditor sees the difference between a complete record and an action that was released with its result unrecorded. An intent proves what was about to be released, not that it was released. `PREPARED` and `ERRORED` are stated as "the action may or may not have run".

**6. The cost.** One more signing operation and one more database write before every release, and two more writes after it. Under AWS KMS that is one more `kms:Sign`. Measured once, on 2026-09-21: about 35 ms median (34 to 40 ms, 10 samples) from a Windows machine to `ap-south-1`. Not measured from Vercel.

## Where the build differs from the proposal

1. **The saved execution context is deleted when the intent becomes `FINALIZED`.** The proposal did not say. The context holds the full execution context, including the intent parameters, and once the Trust Record exists it has no further use, so keeping a second copy indefinitely would only duplicate sensitive data.
2. **Two states exist that the proposal did not name: `ERRORED` and the distinction between `PREPARED` and `RELEASED`.** `ERRORED` records that the release stage raised an error. It deliberately does not say "not released", because a connector timeout can happen after the connector acted. Using `PREPARED` for both would have hidden that.
3. **A fifth state, `RESOLVED`, and a resolve operation, added the same day (G-54).** Building the operator procedure showed that an intent reconciled by hand could never be closed, so the unfinalized list could never empty. `POST /execution-intents/{id}/resolve` lets a verified human close a `PREPARED` or `ERRORED` intent with what they found (`NOT_EXECUTED` or `EXECUTED`) and a required note. It is idempotent, never calls a connector, and refuses `RELEASED`, `FINALIZED` and any transaction that already has a Trust Record. The resolution is stored in the unsigned status, so it is an attributed operator statement and **not** tamper evident. A signed resolution record was considered and not built.

## Consequences

1. Positive: G-52 is closed for the risk it named, because an executed action always has signed evidence behind it. G-53 becomes a repair procedure and stops being data loss, when the context was saved.
2. Positive: nothing existing had to change format. The Trust Record, the offline verifiers and the SDK verifiers are untouched.
3. Negative: a new record type, a migration that must run before deployment, one more `kms:Sign` and three more writes per released action, and a new set of operator routes (`GET /execution-intents/{id}`, `GET /execution-intents/unfinalized`, `POST /execution-intents/{id}/finalize`, `POST /execution-intents/{id}/resolve`, and the unauthenticated `POST /execution-intents/verify`).
4. **Open, recorded rather than hidden:**
   - **G-53 residual.** The execution context is saved best effort. When that save fails too, the intent stays `PREPARED`, finalize refuses with `409 EXECUTION_INTENT_RESULT_NOT_RECORDED`, and the outcome must be established from the connector by hand. Covered by unit tests, not by live fault injection.
   - **G-54, closed the same day.** An intent reconciled by hand could not be closed, so `PREPARED` and `ERRORED` intents stayed in the unfinalized list forever. `POST /execution-intents/{id}/resolve` now closes them (state `RESOLVED`, with the resolution, a required note, who and when). The resolution is an attributed statement in unsigned status, not a signed record.
   - **G-55, closed the same day and published in SDK 1.2.0 on 2026-09-21.** The SDKs had no methods for the intent routes. Both now have `executionIntent`, `verifyExecutionIntent`, `unfinalizedExecutionIntents`, `finalizeExecutionIntent` and `resolveExecutionIntent`, and Python has an offline verifier. **They are not in 1.1.6 or earlier.** The TypeScript SDK has no offline intent verifier, as it has none for Trust Records either.

## Verification

Tests: a signed intent is stored before the connector is called and verifies; a failed intent store, and a failed intent signature, each release nothing and return `503`; a release error leaves the intent `ERRORED`; a failed record store leaves a `RELEASED` intent; finalize rebuilds a verifiable record without a second release, is idempotent, handles the race, and refuses with `409` and `404`; the offline verifier agrees with the runtime signer and detects tampering; the storage state guards; the routes and the authorization rules; the full repair over HTTP; the environment gate; and the readiness check for the missing table.

The Postgres queries were also run against a real Postgres with every migration applied (16 checks).

Live, on 2026-09-21: the production Docker image built from this code, a real Postgres, the real AWS KMS key `alias/default` (`ap-south-1`, `ECC_NIST_EDWARDS25519`) with the limited IAM user `parmana-kms-operator`, and the real `parmana-paytm-agent` with fake Paytm staging credentials, because what was under test was the intent lifecycle and not Paytm. 23 of 23 checks passed:

1. A normal request released once, ended `FINALIZED` (`INLINE`), and the intent and the Trust Record each verified offline with only the KMS public key.
2. With the Trust Record made unstorable after release: `500 EXECUTION_RECORD_INCOMPLETE`, a signed intent survived in `RELEASED`, finalize rebuilt the record (marked `REPAIRED`) with the connector called exactly once in total, verified it and issued the receipt, the rebuilt record verified offline, and a second finalize returned `ALREADY_FINALIZED`.
3. With the intent made unstorable: `503 EXECUTION_INTENT_UNAVAILABLE`, the connector was not called, and no intent row was written.

A repeat run produced an unplanned real connector timeout, recorded as an intent in state `ERRORED` with the reason `PaytmConnector "paytm" request to capability "paytm:refund" timed out after 10000ms`. That is the designed behavior.

After closing an intent by hand (G-54) was added, the whole check, four scenarios, passed 37 of 37 under the same KMS key. An earlier attempt under KMS had one scenario fail because the agent's own call to Paytm staging failed on the network (`fetch failed`): the intent correctly ended `ERRORED` and the scenario never reached the state it tests. The check no longer depends on the internet: the rig now answers the agent's one call to Paytm staging with a local stand in (the response shape real staging returned for a bad merchant id), and it passed 37 of 37 three times in a row under KMS. The 23 of 23 run above called real Paytm staging with fake credentials. A later run also failed once because the temporary AWS credentials handed to the container had expired after about 15 minutes, so the rig now records their expiry and stops early with an instruction.

**Not verified:** the Vercel OIDC role signing an intent (it uses the same signer and permissions as the Trust Record), latency from Vercel, and a real Paytm refund.

One observation from the live run, outside this repository: `parmana-paytm-agent` reports any `503` from Parmana as an "ambiguous outcome". For `EXECUTION_INTENT_UNAVAILABLE` and `SIGNING_UNAVAILABLE` the answer is not ambiguous, because those codes mean nothing was executed. The agent could read the code and say so.
