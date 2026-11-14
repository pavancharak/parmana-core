# PoAE benchmark specification v0.1

**Status:** Specification only. No test has been run. Every result is "not run" until it is measured.
**Source:** [PoAE formal security specification v0.1](../../docs/ASSURANCE_TESTING_PLAN.md) (plan Section 12). Threats T01 to T10 and properties POAE-01 to POAE-06 are defined there.
**Decisions:** D6 to D8 in [ASSURANCE_DECISIONS.md](../../docs/ASSURANCE_DECISIONS.md) are pending. Gap tests cannot run until the matching product change is decided and built.

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

| Gap | Missing piece                                                 | Blocks              |
| --- | ------------------------------------------------------------- | ------------------- |
| G-A | Authority identifier and version binding in the authorization | AM-04               |
| G-P | Policy-bundle hash bound to the authorization                 | XM-03               |
| G-R | Execution receipt carrying the executed action hash (D7)      | EM-01, EM-02, EM-04 |
| G-L | Independent reconciliation of the ledger against evidence     | CE-04               |

## The 20 tests

### Authority manipulation (AM)

| ID    | Threat | Property | Mutation                                        | Expected | Status                                     |
| ----- | ------ | -------- | ----------------------------------------------- | -------- | ------------------------------------------ |
| AM-01 | T09    | POAE-05  | Authority past its expiry used to authorize     | Deny     | Testable now                               |
| AM-02 | T09    | POAE-05  | Authority revoked after issue, used again       | Deny     | Testable now (revocation tests in Phase 2) |
| AM-03 | —      | POAE-01  | Authority record from an unauthenticated source | Deny     | Testable now                               |
| AM-04 | —      | POAE-05  | Superseded authority version used               | Deny     | Gap G-A                                    |

### Authorization manipulation (XM)

| ID    | Threat | Property | Mutation                           | Expected                   | Status                                  |
| ----- | ------ | -------- | ---------------------------------- | -------------------------- | --------------------------------------- |
| XM-01 | T01    | POAE-02  | Amount above the authorized limit  | Deny                       | Testable now                            |
| XM-02 | —      | POAE-02  | Vendor not in the authorized set   | Deny                       | Testable now                            |
| XM-03 | T03    | POAE-02  | Policy changed after authorization | Reject stale authorization | Gap G-P, and decision 9.3               |
| XM-04 | T08    | POAE-02  | Authorization service unavailable  | Fail closed                | Testable now (fault injection, Phase 2) |

### Execution manipulation (EM)

| ID    | Threat | Property | Mutation                                                     | Expected        | Status       |
| ----- | ------ | -------- | ------------------------------------------------------------ | --------------- | ------------ |
| EM-01 | T02    | POAE-03  | Vendor changed between approval and execution                | Deny            | Gap G-R      |
| EM-02 | T07    | POAE-03  | Amount changed between approval and execution                | Reject mismatch | Gap G-R      |
| EM-03 | —      | POAE-03  | Execution called directly, bypassing the gateway (attack 44) | Deny            | Testable now |
| EM-04 | —      | POAE-03  | Receipt omits or alters the action hash                      | Reject          | Gap G-R      |

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
| Authorization manipulation          |      4 |            3 |     1 |
| Execution manipulation              |      4 |            1 |     3 |
| Cryptographic evidence manipulation |      4 |            3 |     1 |
| Replay and temporal attacks         |      4 |            4 |     0 |
| **Total**                           | **20** |       **14** | **6** |

XM-03 counts as a gap because it needs G-P, and the policy decision is still open.

## Success criteria

These are targets, not results. The proposal's criteria are kept as they were:

- 100% rejection of defined unauthorized actions.
- 100% detection of defined evidence-tampering mutations.
- 100% rejection of stale authorization.
- 100% rejection of unauthorized signatures.
- Zero unauthorized executions in the tested scenarios.

Each result must be reported as measured, using `testing/templates/assurance-results-entry.md`. Report false rejections and surviving mutations in the same entry.

## Results

| ID     | Result  | Commit | Date |
| ------ | ------- | ------ | ---- |
| All 20 | Not run |        |      |
