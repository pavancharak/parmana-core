# Open items: vendor adapter hash, ledger connection, authority version

**Status:** Proposed, with decisions needed. Nothing here is implemented.
**Date:** 14 November 2026
**Related:** [ASSURANCE_RESULTS.md](../ASSURANCE_RESULTS.md) (results of 14 November 2026).

These are the three items left open after the connector hash and reconciliation work. Each section states what the repository already does, what is missing, the options, and the decision needed.

## 1. Vendor adapter hash (gap in G-R)

**Already done.** `HttpConnector` hashes the body it sends and returns `wireContentHash`. The gateway records it as `dispatchedContentHash`, with `dispatchedHashSource: "connector-wire"`.

**Missing.** `GatewayHttpAdapter` and `GatewayExternalAdapter` transform the verified content into their own vendor requests. A hash over the outbound request cannot be compared with `authorizedContentHash`, because the two are different forms of the same action.

**Options.**

- **A. Declared mapping per adapter.** Each adapter declares, in code, how each content field maps to request fields. The verifier rebuilds the expected request from the content and compares its hash with the hash of the request actually sent. Strong, but every adapter needs a mapping specification, and the mapping has to be kept in step with the vendor API.
- **B. Connector attestation.** The external connector returns a signed statement of the content it received, and the gateway checks it against the authorized hash. This needs key management for connectors and trusts the connector's signature. It is the only option that covers connectors outside this repository.
- **C. Accept the gap.** Record that vendor-side changes after dispatch are not detected for these adapters, and state it in any paper.

**Recommendation.** A for the adapters in this repository, which have fixed mappings. B for external connectors later. Do not claim coverage for any adapter until its option is implemented and tested.

**Decision needed (D10):** choose A, B, or C for the in-repository adapters, and whether B is in scope.

## 2. Ledger connection (gap G-L)

**Already done.** `reconcileExecutionEvidence(outcomes, trustRecords)` is a pure function. It fails when a completed execution has no trust record, and it never reports an empty or in-flight set as passed.

**Missing.** The reconciliation has no source of inputs in production:

- `ExecutionTrustRecordRepository` finds records by transaction ID only. It has no listing method.
- `ExecutionOutcomeStore` has `get(nonce)` and `listStuck(now)`. It has no listing of completed outcomes.

Also, an execution is written to the outcome store before its trust record exists. A reconciliation run that does not allow for that gap would report false failures.

**Options.**

- **A. Scheduled reconciliation job.** Add listing methods to both stores. A job compares completed outcomes older than a window (for example, 10 minutes) with the trust records, and writes its result to the audit log and an alert. Simple, and it detects removal after the fact.
- **B. Check at read time.** Reconcile whenever a trust record is read for export. Cheaper to start, but it only detects loss when someone looks.
- **C. Anchored ledger.** Publish the hash of each record to an external anchor, so a third party can detect removal. Strongest, and the largest change.

**Recommendation.** A first, with the window set from measured write latency, and C later if an external verifier must be able to detect removal. Adding listing methods is a storage change and needs review.

**Decision needed (D11):** choose A, B or C, the window length, and whether the listing methods may be added to the storage interfaces.

## 3. Authority version (gap G-A)

**Already done.** The authorization binds `authorityGrant.grantId`, and the gateway checks that the grant is still the caller's active grant (`checkAuthorityGrant`).

**Missing.** There is no version on the grant. A grant that is replaced by a newer version of the same authority is detected only if it gets a new `grantId`. Nothing states what happens when the authority is re-issued under the same identifier.

**Options.**

- **A. Add a version to the grant and to the authorization.** The gateway rejects an authorization whose version is not the current version. The signed payload changes, so the authorization schema needs a version bump, and existing authorizations need a migration rule.
- **B. Treat a grant ID as immutable.** Re-issuing authority always creates a new grant ID, and the existing check covers it. No schema change. Requires that the grant registry never reuses an ID.
- **C. Leave as is.** AM-04 stays a gap.

**Recommendation.** B, if the grant registry can enforce immutable IDs, which is a check on the registry, not a schema change. Choose A only if the business needs to reason about versions. Test AM-04 under whichever option is chosen.

**Decision needed (D12):** choose A, B or C, and confirm whether the grant registry can enforce immutable IDs.

## Summary of decisions

| Decision | Item                | Recommendation                                                |
| -------- | ------------------- | ------------------------------------------------------------- |
| D10      | Vendor adapter hash | A for in-repository adapters; B later for external connectors |
| D11      | Ledger connection   | A (scheduled job), with a measured window; C later if needed  |
| D12      | Authority version   | B if the registry can enforce immutable IDs; otherwise A      |

## Long-term direction (recommendation, not decided)

These are the recommendations for the long term. They are not decisions. The owner decides D10 to D12.

- **Vendor adapters (D10).** Use a declared mapping per in-repository adapter now, since Parmana controls those mappings and can test them. Connectors outside Parmana's control need attestation (option B), because a mapping cannot show what an external system did. Until external connectors are a real deployment mode, keep option C documented as an explicit gap.
- **Ledger connection (D11).** Build the scheduled job (option A) first. It does not meet the long-term goal on its own: anyone who can delete records can also delete the job's findings. Only an external anchor (option C) lets an outside party detect removal. Treat C as the target. The claim that a third party can verify evidence depends on it.
- **Authority version (D12).** Use immutable grant identifiers (option B), enforced by a database constraint rather than by convention. A version field only makes sense if the business needs to reason about versions. Reusing an identifier fails silently and is hard to undo, so the constraint matters more than the choice of option.

**Summary:** A for D10 and D11 now, with C as the D11 target. B for D12, enforced at the database level.
