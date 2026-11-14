# Execution correspondence: design revision

**Status:** Confirmed 14 November 2026 by the owner, with the four decisions in section 6 recorded below. Implementation has started on `claude/lucid-sagan-1gs4xj`.
**Date:** 14 November 2026
**Related:** decision D7 in [ASSURANCE_DECISIONS.md](../ASSURANCE_DECISIONS.md), plan Section 12 in [ASSURANCE_TESTING_PLAN.md](../ASSURANCE_TESTING_PLAN.md), benchmark tests EM-01, EM-02 and EM-04 in [benchmark-spec.md](../../testing/poae/benchmark-spec.md).

## 1. Why this revision

D7 approved "an execution receipt that binds the executed action hash to the authorization". Checking the repository showed that a receipt already exists, so that design would duplicate it. This document replaces the design.

## 2. What the repository already does

Each item was checked in the source.

| Element                                                                                                                | Where                                                                           | Status                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Signed authorization embedded in the trust record                                                                      | `packages/shared/src/domain/execution-trust-record.ts` (`authorization`)        | Present                                                                            |
| Authorization binds the canonical content hash (`businessTransactionHash`)                                             | `packages/shared/src/domain/execution-authorization.ts`                         | Present                                                                            |
| Gateway recomputes the content hash and compares it before dispatch                                                    | `packages/execution-gateway/src/ExecutionGateway.ts` (`verify`)                 | Present                                                                            |
| Authorization binds the policy content hash (`policyContentHash`) and checks it against the live policy before release | `ExecutionGateway.ts`                                                           | Present                                                                            |
| Authorization carries the authority grant identifier (`authorityGrant.grantId`)                                        | `execution-authorization.ts`                                                    | Present. No version field.                                                         |
| Nonce consumed once; outcome recorded by nonce                                                                         | `ExecutionGateway.ts` (`execute`, outcome store)                                | Present                                                                            |
| Signed Receipt over the trust record hash                                                                              | `packages/shared/src/domain/receipt.ts`, `packages/crypto/src/ReceiptCrypto.ts` | Present                                                                            |
| Execution evidence covered by a signed chain hash                                                                      | `packages/shared/src/domain/execution.ts` (`chainHash`, `chainSignature`)       | Present                                                                            |
| Connector evidence hash over the request as sent                                                                       | `packages/execution-gateway/src/connector-execution/ConnectorEvidence.ts`       | **Partly.** Hashes a redacted, sanitized summary. Not the exact canonical content. |
| Comparison of the dispatched content with the authorized content hash                                                  | None found                                                                      | **Missing**                                                                        |

## 3. The gap

The authorized content hash and the dispatched content hash are computed over different forms of the content:

- The authorized hash is the canonical hash of the verified `ExecutableContent`.
- The connector evidence hash is over a summary with sensitive keys redacted and the endpoint sanitized.

Because of the redaction, the two hashes cannot be compared. Nothing in the repository checks that what was sent is what was authorized, after the connector has run. POAE-03 (execution correspondence) is therefore not established by the current design, even though the gateway checks the content before dispatch.

## 4. Proposed design

Extend the existing signed records. Do not add a new receipt type.

1. **Dispatched content hash.** At dispatch, the gateway computes the canonical hash of the exact content passed to the connector, using the same hasher as `businessTransactionHash`. It stores only the hash. Redaction is not applied to the hashed content, so the hash can be compared exactly. The raw values are not stored.
2. **Correspondence fields.** Add to the execution evidence, under a schema version: `authorizedContentHash`, `dispatchedContentHash`, `authorizationNonce`, `policyContentHash` and `authorityGrantId`. These are copied from the authorization and the dispatch.
3. **Verifier check.** An independent check, in `packages/envelope-verifier` or a new verifier function, returns invalid when:
   - `dispatchedContentHash` differs from `authorizedContentHash`;
   - a required field is missing (fail closed);
   - the evidence nonce differs from the authorization nonce;
   - the outcome is unknown, which is never reported as success.
4. **Schema versioning.** Records without the new fields stay valid under the old schema. The verifier reports them as "not checked", not as passed.

## 5. What this design does not do

- It does not prove the event occurred. A matching hash shows that the dispatched content equals the authorized content. It does not show that the connector's action succeeded in the outside system.
- It does not add a vendor confirmation. The existing `vendorConfirmationVerified` flag stays false.
- It does not change the signing keys or the frozen cryptographic core (decision D8).

## 6. Decisions needed before code

1. Confirm the revised design: extend the existing signed records instead of adding a receipt type.
2. Confirm where the new fields live: the execution evidence, or a new field on the execution.
3. Confirm the schema version number for the change.
4. Confirm that records without the new fields are reported as "not checked", not as failed.

Code will not start until these four are confirmed.

## 7. Confirmed decisions (14 November 2026)

1. **Extend the existing signed records.** Confirmed. No new receipt type.
2. **Typed fields on `ExecutionEvidence`, not in `attributes`.** Confirmed.
3. **Schema version: the current trust-record `schemaVersion`, increased by one.** Confirmed. The current value is recorded in the implementation notes.
4. **Records without the new fields are reported as "not checked".** Confirmed. They never count as passing a correspondence check.

### Revision to decision 3 (14 November 2026, during implementation)

The confirmed decision was to increase the trust-record `schemaVersion` by one. Checking the code showed that this is not needed, and that it would have required changes to the crypto canonical view:

- The version 2 signed view (`hybridCanonicalExecutionTrustRecord`) includes the whole `executions` array. The version 3 view signs every top-level field. Either way, a new optional field inside `executions[].evidence` is covered by the existing signatures.
- The supported versions are 2 and 3 (`SUPPORTED_HYBRID_SCHEMA_VERSIONS`). A version 4 would need crypto changes, and that is the code D8 would freeze.

So the schema version is not changed. The new `correspondence` object is optional and versioned inside itself (`schemaVersion: 1`). **This departs from the confirmed decision. The owner should confirm it.**

## 8. Implementation status

Done, on `claude/lucid-sagan-1gs4xj`:

- `ExecutionEvidence.correspondence` (optional) and the `ExecutionCorrespondence` type, in `packages/shared/src/domain/execution-evidence.ts`.
- `checkExecutionCorrespondence`, a pure check that returns passed, failed or not checked. In `packages/shared/src/domain/execution-correspondence.ts`.
- 10 unit tests in `packages/shared/tests/unit/execution-correspondence.test.ts`. All pass on Node 24.22.2.
- Shared and crypto suites: 545 passed, 1 skipped, on Node 24.22.2.

Done since (gateway step):

- `ExecutionResult.correspondence` (optional), copied into the evidence by `ExecutionEvidenceBuilder` in `packages/runtime`.
- `ExecutionGateway.execute()` attaches the record to every released result, before the outcome is stored, so a replay returns the same record. The dispatched hash uses the same `ExecutableContentHasher` as `businessTransactionHash`.
- 3 new gateway tests in `packages/execution-gateway/tests/unit/execution-gateway.test.ts`. All 17 tests in that file pass on Node 24.22.2.

**Limitation, which must be stated in any paper:** the dispatched hash is computed over the verified content object that the gateway hands to the connector. It is not computed over the outbound HTTP payload that a connector builds. A change made inside a connector, after the gateway's hash, would not be detected by this record. Closing that needs a hash in the connector adapter, which is a further step.

Not done, and needed before the benchmark can run EM-01, EM-02 and EM-04:

- No independent verifier calls `checkExecutionCorrespondence` yet. The gateway records the field, and the shared check is tested, but no verifier applies it to stored records.
- A hash at the connector's outbound payload (see limitation above).
- The benchmark tests have not been run.

## 9. Verifier step (14 November 2026)

Done:

- `checkTrustRecordCorrespondenceOffline(trustRecord)` in `packages/crypto/src/ExecutionCorrespondenceOffline.ts`, exported from `@parmana/crypto`. It is stateless and offline, like `verifyExecutionTrustRecordOffline`. It checks every execution against the authorization the record embeds.
- Overall status: `failed` if any execution fails; otherwise `not_checked` if there are no executions or any execution cannot be checked; otherwise `passed`. A single unchecked execution never gives `passed`.
- 8 unit tests in `packages/crypto/tests/unit/execution-correspondence-offline.test.ts`, all passing on Node 24.22.2.
- `verifyExecutionTrustRecordOffline` is unchanged. Its result shape is not altered. The new check is a separate function, so the existing verifier's behaviour and any frozen-core rule (decision D8) are untouched.

Semantics to state in any paper:

- The correspondence result is meaningful only when the record's signatures also verify. A record changed without re-signing fails the signature check first.
- The check compares the hashes the record holds. It does not check that the connector sent that content. Connector-level evidence is still open.

Still open:

1. The connector-level hash, at the outbound payload.
2. CE-04, reconciliation of the ledger against stored evidence.
3. Running the benchmark, and recording the results, including any failures, in the results log.

## 10. Status after the connector and reconciliation steps (14 November 2026)

Done:

- **Connector-level hash for the HTTP connector.** `HttpConnector` hashes the body it sends and returns `wireContentHash`. The gateway uses it as the dispatched hash and records `dispatchedHashSource: "connector-wire"`. Test: `packages/execution-gateway/tests/unit/http-connector-wire-hash.test.ts`.
- **Ledger reconciliation (pure).** `reconcileExecutionEvidence` in `packages/shared/src/domain/execution-reconciliation.ts` fails when a completed execution has no trust record. An empty or in-flight set is not reported as passed.

Still open:

- Vendor adapters (`GatewayHttpAdapter`, `GatewayExternalAdapter`). Their requests are transformed from the content, so they need a mapping specification before a hash over the request can be compared with the authorized content.
- Connecting the reconciliation to the stored ledger (gap G-L).
- Authority version binding (gap G-A).
