# Threat model and 30 scenarios

**Status:** Phase 1 draft. Defines the 30 scenarios that Phase 2 documents and Phase 3 implements. Each scenario states its status in the repository on 14 November 2026.

## Adversary

The adversary may:

- hold a valid agent credential, and use it outside its authority;
- alter records, signatures or evidence after they are written;
- replay previously authorized requests;
- substitute a policy, key or trust root;
- delete or truncate the ledger;
- compromise an infrastructure component (service, store, or key), and must be detected or refused, not trusted.

The adversary may not break the assumptions in [security-properties.md](security-properties.md) (A1 to A6).

## Scenarios

Status key: **Implemented** = a runner test in `tests/assurance/poae/poae-benchmark.test.ts` passes. **Elsewhere** = covered by an existing test, named. **Gap** = the repository lacks the mechanism. **Not implemented** = no test yet.

### Authority attacks (T01 to T04)

| ID  | Scenario                                                                    | Expected | Property | Status                    |
| --- | --------------------------------------------------------------------------- | -------- | -------- | ------------------------- |
| T01 | Authority record from an unauthenticated source                             | Deny     | P1       | Implemented (AM-03)       |
| T02 | Expired authority used to authorize                                         | Deny     | P1, P3   | Implemented (AM-01)       |
| T03 | Revoked grant used, including from a cached copy                            | Deny     | P6       | Implemented (AM-02)       |
| T04 | Authority re-issued under the same identifier, or a superseded version used | Deny     | P3       | Gap (AM-04, decision D12) |

### Authorization and execution attacks (T05 to T10, T18)

| ID  | Scenario                                         | Expected                   | Property | Status                                                                 |
| --- | ------------------------------------------------ | -------------------------- | -------- | ---------------------------------------------------------------------- |
| T05 | Amount above the authorized limit                | Deny                       | P1       | Implemented (XM-01). Tests the content hash, not a limit (see limits). |
| T06 | Unauthorized vendor or target                    | Deny                       | P1       | Implemented (XM-02). Tests the content hash, not an allowlist.         |
| T07 | Policy changed after authorization               | Reject stale authorization | P1, P3   | Implemented (XM-03)                                                    |
| T08 | Authorization service unavailable                | Fail closed                | P1       | Implemented (XM-04)                                                    |
| T09 | Execution called directly, bypassing the gateway | Deny                       | P1       | Elsewhere (architecture boundary test)                                 |
| T10 | Agent changes its own authority                  | Deny                       | P1, P3   | Not implemented                                                        |
| T18 | Grant reused by another agent                    | Deny                       | P1, P6   | Implemented (RT-04)                                                    |

### Cryptographic attacks (T11 to T15)

| ID  | Scenario                                          | Expected           | Property | Status                                   |
| --- | ------------------------------------------------- | ------------------ | -------- | ---------------------------------------- |
| T11 | Evidence record altered after signing             | Verification fails | P5       | Implemented (CE-01)                      |
| T12 | Signature bytes altered                           | Reject             | P5       | Implemented (CE-02)                      |
| T13 | Valid signature from a key outside the trust root | Reject             | P5, A2   | Implemented (CE-03)                      |
| T14 | Non-canonical encoding of a valid signature       | Reject             | P5       | Elsewhere (canonical-signature test, D9) |
| T15 | Broken hash chain, or altered previous hash       | Verification fails | P5       | Not implemented                          |

### Replay and availability (T16, T17, T19)

| ID  | Scenario                             | Expected      | Property | Status              |
| --- | ------------------------------------ | ------------- | -------- | ------------------- |
| T16 | Approved transaction submitted twice | Released once | P4       | Implemented (RT-01) |
| T17 | Nonce reused with different content  | Deny          | P4       | Implemented (RT-02) |
| T19 | Authorization replayed after expiry  | Deny          | P4, P1   | Implemented (RT-03) |

### Execution correspondence (T20, T21, T28)

| ID  | Scenario                                             | Expected              | Property | Status                              |
| --- | ---------------------------------------------------- | --------------------- | -------- | ----------------------------------- |
| T20 | Dispatched amount differs from the authorized amount | Failed correspondence | P2       | Implemented at record level (EM-02) |
| T21 | Dispatched vendor or target differs                  | Failed correspondence | P2       | Implemented at record level (EM-01) |
| T28 | Dispatch hash omitted or altered in the record       | Not passed            | P2       | Implemented at record level (EM-04) |

### Infrastructure compromise and recovery (T22 to T27, T29, T30)

| ID  | Scenario                                                   | Expected                                         | Property | Status                                                 |
| --- | ---------------------------------------------------------- | ------------------------------------------------ | -------- | ------------------------------------------------------ |
| T22 | Completed execution's evidence removed from the ledger     | Detected by reconciliation                       | P7       | Implemented, pure (CE-04). Ledger not connected (D11). |
| T23 | Ledger truncated                                           | Detected against an independent checkpoint       | P7       | Not implemented (needs D11)                            |
| T24 | Signing key compromised, then rotated                      | Old key refused after revocation                 | P6, A1   | Not implemented                                        |
| T25 | Trust root substituted                                     | Verification fails against the published root    | A2, P5   | Not implemented                                        |
| T26 | Policy store returns a substituted policy                  | Deny                                             | P3, A4   | Not implemented. XM-04 covers unavailability only.     |
| T27 | Audit or evidence store write fails                        | No execution proceeds without a recorded refusal | P1       | Not implemented                                        |
| T29 | Connector reports success, but the request it sent differs | Detected                                         | P2, A6   | Partly: HTTP connector only (D10)                      |
| T30 | Revocation propagates late                                 | Denied after the defined window                  | P6       | Not implemented                                        |

## Counts

| Status             |  Count | Scenarios                                                                                |
| ------------------ | -----: | ---------------------------------------------------------------------------------------- |
| Implemented        |     18 | T01, T02, T03, T05, T06, T07, T08, T11, T12, T13, T16, T17, T18, T19, T20, T21, T22, T28 |
| Elsewhere          |      2 | T09, T14                                                                                 |
| Gap                |      1 | T04                                                                                      |
| Partly implemented |      1 | T29                                                                                      |
| Not implemented    |      8 | T10, T15, T23, T24, T25, T26, T27, T30                                                   |
| **Total**          | **30** |                                                                                          |

T20, T21 and T28 are implemented at record level only. The 20-test specification in `testing/poae/benchmark-spec.md` is a subset of these 30 scenarios. The runner's 18 passing tests are the Implemented rows above, and the results log records the run.

## Limits of the threat model

- The model covers the scenarios listed. It does not claim that no other attack exists.
- The scenarios describe what the verifier should detect. They do not describe the adversary's full capability.
- The threat model assumes the signing and trust-root assumptions (A1, A2). An attacker who holds the signing key is out of scope except for T24.

## Frozen core and the threat model

The frozen cryptographic core (decision D8, `docs/assurance/FROZEN_CORE.md`) is the signing, hashing and verification code. The signature providers were changed under D9 before the freeze list was written, so the frozen manifest records the changed version. The freeze starts from that state. Any further change to the core needs owner review.
