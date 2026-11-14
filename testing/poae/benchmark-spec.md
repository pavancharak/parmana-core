# PoAE benchmark specification v0.1

**Status:** Specification only. No test has been run. Every result is "not run" until it is measured.
**Source:** [PoAE formal security specification v0.1](../../docs/ASSURANCE_TESTING_PLAN.md) (plan Section 12). Threats T01 to T10 and properties POAE-01 to POAE-06 are defined there.
**Decisions:** D6 to D8 in [ASSURANCE_DECISIONS.md](../../docs/ASSURANCE_DECISIONS.md) were decided on 14 November 2026 (see D6 to D8). Record-level correspondence (EM-01, EM-02, EM-04) is implemented. The connector-level hash and CE-04 are not.

## Method

For each test:

1. Start from an authorized baseline transaction and capture its evidence.
2. Apply the mutation in the table.
3. Submit the mutated request or record to the system, and to the independent verifier where the test needs it.
4. Record the observed outcome. Expected results are not evidence.
5. Record false rejections and surviving mutations separately.

Status values:

- **Testable now:** the code path exists. The harness is still to be written.
- **Gap:** the test needs a product change that does not exist yet. The gap is named in the table.

## Gaps referenced

| Gap | Missing piece                                                                                                                 | Blocks               |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| G-A | Authority version binding. The grant identifier is present; the version is not.                                               | AM-04                |
| G-P | Closed. `policyContentHash` is bound and checked at execution.                                                                | None                 |
| G-R | Record-level correspondence is implemented (`checkTrustRecordCorrespondenceOffline`). The connector-level hash is still open. | None at record level |
| G-L | Independent reconciliation of the ledger against evidence                                                                     | CE-04                |

## The 20 tests

### Authority manipulation (AM)

| ID    | Threat | Property | Mutation                                        | Expected | Status                                     |
| ----- | ------ | -------- | ----------------------------------------------- | -------- | ------------------------------------------ |
| AM-01 | T09    | POAE-05  | Authority past its expiry used to authorize     | Deny     | Testable now                               |
| AM-02 | T09    | POAE-05  | Authority revoked after issue, used again       | Deny     | Testable now (revocation tests in Phase 2) |
| AM-03 | —      | POAE-01  | Authority record from an unauthenticated source | Deny     | Testable now                               |
| AM-04 | —      | POAE-05  | Superseded authority version used               | Deny     | Gap G-A                                    |

### Authorization manipulation (XM)

| ID    | Threat | Property | Mutation                           | Expected                   | Status                                                |
| ----- | ------ | -------- | ---------------------------------- | -------------------------- | ----------------------------------------------------- |
| XM-01 | T01    | POAE-02  | Amount above the authorized limit  | Deny                       | Testable now                                          |
| XM-02 | —      | POAE-02  | Vendor not in the authorized set   | Deny                       | Testable now                                          |
| XM-03 | T03    | POAE-02  | Policy changed after authorization | Reject stale authorization | Testable now (`policyContentHash` checked at execute) |
| XM-04 | T08    | POAE-02  | Authorization service unavailable  | Fail closed                | Testable now (fault injection, Phase 2)               |

### Execution manipulation (EM)

| ID    | Threat | Property | Mutation                                                     | Expected        | Status                                                 |
| ----- | ------ | -------- | ------------------------------------------------------------ | --------------- | ------------------------------------------------------ |
| EM-01 | T02    | POAE-03  | Vendor changed between approval and execution                | Deny            | Testable at record level. Connector level not covered. |
| EM-02 | T07    | POAE-03  | Amount changed between approval and execution                | Reject mismatch | Testable at record level. Connector level not covered. |
| EM-03 | —      | POAE-03  | Execution called directly, bypassing the gateway (attack 44) | Deny            | Testable now                                           |
| EM-04 | —      | POAE-03  | Record omits or alters the dispatched hash                   | Reject          | Testable at record level                               |

### Cryptographic evidence manipulation (CE)

| ID    | Threat | Property | Mutation                                          | Expected                   | Status                                     |
| ----- | ------ | -------- | ------------------------------------------------- | -------------------------- | ------------------------------------------ |
| CE-01 | T04    | POAE-04  | Evidence record altered after signing             | Verification failure       | Testable now                               |
| CE-02 | T05    | POAE-04  | Signature bytes altered                           | Reject                     | Testable now                               |
| CE-03 | T05    | POAE-01  | Valid signature from a key outside the trust root | Reject                     | Testable now (trust-root check to confirm) |
| CE-04 | T10    | POAE-06  | Evidence removed from the ledger                  | Detected by reconciliation | Gap G-L                                    |

### Replay and temporal attacks (RT)

| ID    | Threat | Property | Mutation                                            | Expected         | Status       |
| ----- | ------ | -------- | --------------------------------------------------- | ---------------- | ------------ |
| RT-01 | T06    | POAE-02  | Approved transaction submitted twice (attack 78)    | Reject duplicate | Testable now |
| RT-02 | —      | POAE-02  | Nonce reused (attack 42)                            | Reject           | Testable now |
| RT-03 | T09    | POAE-05  | Authorization replayed after expiry                 | Deny             | Testable now |
| RT-04 | —      | POAE-01  | Authorization used by a different agent (attack 43) | Deny             | Testable now |

## Count

| Category                            |  Tests | Testable now |   Gap |
| ----------------------------------- | -----: | -----------: | ----: |
| Authority manipulation              |      4 |            3 |     1 |
| Authorization manipulation          |      4 |            4 |     0 |
| Execution manipulation              |      4 |            4 |     0 |
| Cryptographic evidence manipulation |      4 |            3 |     1 |
| Replay and temporal attacks         |      4 |            4 |     0 |
| **Total**                           | **20** |       **18** | **2** |

XM-03 is testable now. The policy-change behaviour still needs the decision in plan Section 9, item 3.

## Success criteria

These are targets, not results. The proposal's criteria are kept as they were:

- 100% rejection of defined unauthorized actions.
- 100% detection of defined evidence-tampering mutations.
- 100% rejection of stale authorization.
- 100% rejection of unauthorized signatures.
- Zero unauthorized executions in the tested scenarios.

Each result must be reported as measured, using `testing/templates/assurance-results-entry.md`. Report false rejections and surviving mutations in the same entry.

## Results

| ID                                           | Result                                                           | Commit                                   | Date       |
| -------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- | ---------- |
| Re-run 14 Nov 2026 after D9 (11 implemented) | 11 passed, 0 failed, 9 not run. Details in ASSURANCE_RESULTS.md. | 035e1697715da917899eaf4cb7112a5fb4393020 | 2026-11-14 |

## Limits of the record-level tests

- EM-01, EM-02 and EM-04 test the correspondence check on a trust record. They show that a record whose dispatched hash differs from the authorized hash is reported as failed. They do not show that the connector sent what the record claims. A connector-level hash is needed for that.
- The offline check is only meaningful together with the record's signature check. A record changed without re-signing is caught by the signature check first.
