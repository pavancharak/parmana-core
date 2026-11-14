# Assurance results log

This log records assurance test runs against the plan in
[ASSURANCE_TESTING_PLAN.md](ASSURANCE_TESTING_PLAN.md). Owner: Pavan Charak.

**Rules**

- Append a new entry for each run. Do not rewrite earlier entries. To correct an entry, add a dated note under it.
- Record only outputs that were actually produced. Write "not run" where a check was not run.
- Survivor classifications are recorded separately from the mutation score.

## Phase status

| Phase                      | Status      | Notes                                                                                   |
| -------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| 1. Cryptographic assurance | In progress | Mutation campaign complete. Survivors not yet classified. Chain-head check not covered. |
| 2. Authorization assurance | Not started |                                                                                         |
| 3. Adversarial assurance   | Not started |                                                                                         |
| 4. Operational assurance   | Not started |                                                                                         |
| 5. Release assurance       | Not started |                                                                                         |

## Entries

### 2026-11-14: crypto mutation campaign

- **Command:** `npm run mutation -- crypto`
- **Runtime:** Node 24.18
- **Commit tested:** not recorded. The campaign ran after PR #613 (signing-key configuration) and a build fix. Record the SHA for the next run.
- **Source:** [docs/internal/testing/MUTATION-TESTING.md](internal/testing/MUTATION-TESTING.md)

| Measurement                        |      Value |
| ---------------------------------- | ---------: |
| Mutants generated                  |      1,316 |
| Killed by tests                    |      1,185 |
| Timed out (counted as caught)      |         30 |
| Survived                           |        101 |
| Stryker score (caught / generated) |      92.3% |
| Duration                           | 92 minutes |

**Survivor classification:** 0 of 101 classified.

**Open items**

1. Chain-head check in `CallerAuditChainVerifier.ts` is not covered. Tests first, then re-run that file's mutants.
2. Per-file table covers 84 of 101 survivors. The remaining 17 are not itemised.
3. Equivalent mutants not separated. The Section 10.1 MS value cannot be computed until they are.
4. The Stryker score is not the MS value in the research draft. Report both where relevant.

---

### 2026-11-14: PoAE benchmark runner (implemented tests)

- **Command:** `npm run build:packages`, then `node_modules/vitest/vitest.mjs run tests/assurance/poae` under Node 24.22.2 (`npx -y node@24.22.2`)
- **Runtime:** Node 24.22.2, vitest 5.1.0, Linux container. Test duration 1.13 s.
- **Commit tested:** `d7b4e48dd739e5868db738b6255494218a64bc34`
- **Branch:** `claude/lucid-sagan-1gs4xj`
- **Run by:** session (Claude Code), at the owner's direction

**Results**

| Measurement                                        |     Value |
| -------------------------------------------------- | --------: |
| Benchmark tests in the specification               |        20 |
| Tests that can run now (the specification's count) |        18 |
| Tests implemented in this runner                   |        11 |
| Passed                                             |        10 |
| Failed                                             | 1 (CE-02) |
| Not run                                            |         9 |

Passed: AM-01, XM-01, XM-02, RT-01, RT-02, RT-03, CE-03, EM-01 (record level), EM-02 (record level), EM-04 (record level).

**Failed: CE-02.** Altered signature bytes were expected to be rejected. Changing the final base64 character of an Ed25519 signature gave a different string that still verified. The signature bytes are the same, so this is not a forgery. The verifier nevertheless accepts more than one encoding of one signature. The test is kept failing and is not skipped.

**Checks not run (9):**

- AM-02: revocation registry not exercised by this runner.
- AM-03: unauthenticated authority source not modelled in the fixtures.
- AM-04: authority version binding absent (gap G-A).
- XM-03: policy change after authorization needs the policy binding path, which the legacy fixture bypasses.
- XM-04: fault injection for the authorization service not implemented.
- EM-03: direct execution bypassing the gateway not implemented.
- RT-04: agent identity binding not modelled in the fixtures.
- CE-01: signed trust-record tampering not implemented.
- CE-04: ledger reconciliation absent (gap G-L).

**Limits of these results:**

- XM-01 and XM-02 test the content-hash check. They do not test a policy limit or an approved vendor list.
- EM-01, EM-02 and EM-04 test the record-level correspondence check. They do not test the connector's outbound request.
- The fixtures use the legacy `allowUnverifiedPolicy` path.
- One run only. Results have not been repeated.

**Survivor classification:** not applicable. This entry records no mutation run.

**Open items**

1. CE-02 failure: decide whether signature verification must reject non-canonical base64. This changes the verifier, so it needs an owner decision, and it may fall under the frozen-core rule (D8, not yet defined).
2. Implement the seven testable tests not yet in the runner: AM-02, AM-03, XM-03, XM-04, EM-03, CE-01, RT-04.
3. XM-03 must run with the policy binding enabled, not on the legacy path.
4. The connector-level hash, which the record-level results do not cover.
5. CE-04 needs ledger reconciliation (gap G-L).

**Phase status change:** none. The benchmark is a research track (decision D6), not a plan phase.

---

### Entry template

Copy this for each new run.

```
### YYYY-MM-DD: <name of run>

- Command:
- Runtime:
- Commit tested:
- Branch:

Results:

Survivor classification: N of M classified.

Open items:
1.
```
