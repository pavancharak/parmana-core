# Assurance results log

This log records assurance test runs against the plan in
[ASSURANCE_TESTING_PLAN.md](ASSURANCE_TESTING_PLAN.md). Owner: Pavan Charak.

**Rules**

- Append a new entry for each run. Do not rewrite earlier entries. To correct an entry, add a dated note under it.
- Record only outputs that were actually produced. Write "not run" where a check was not run.
- Survivor classifications are recorded separately from the mutation score.

## Phase status

| Phase                      | Status      | Notes                                                                                                                                                                                                                                     |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Cryptographic assurance | In progress | Crypto re-run 14 Nov: 91.3% on origin/main (114 survived, not yet classified). KMS signer tests merged (PR #630). KmsSigner-only run leaves 4 survivors. Full-suite re-run and chain-head check still to confirm. Stamp-fix PR #631 open. |
| 2. Authorization assurance | Not started |                                                                                                                                                                                                                                           |
| 3. Adversarial assurance   | Not started |                                                                                                                                                                                                                                           |
| 4. Operational assurance   | Not started |                                                                                                                                                                                                                                           |
| 5. Release assurance       | Not started |                                                                                                                                                                                                                                           |

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

### 2026-11-14: crypto mutation re-run on main, with KMS signer tests

- **Command:** `npm run mutation -- crypto`
- **Runtime:** Windows PowerShell 5.1 on the owner's machine. Node version not recorded for this run. The run's own progress estimate put elapsed plus remaining time at about 3 hours 12 minutes.
- **Commit tested:** `4a298547` (origin/main, including PR #622). Detached HEAD.
- **Branch:** none (detached). Uncommitted local changes on the machine: the content-based dist-stamp fix from `content-stamp-fix.patch`, and a revised `scripts/check-dist-fresh.ts` that skips inside Stryker's sandbox. The stamp fix is not on main, so `npm run mutation` fails its freshness check on main without it. The crypto package source is identical between `72de667` and `4a298547`.

Results:

| Measurement                        | Value |
| ---------------------------------- | ----: |
| Mutants generated                  | 1,316 |
| Caught (killed plus timed out)     | 1,202 |
| Survived                           |   114 |
| Stryker score (caught / generated) | 91.3% |

Survivors by file, the 12 files with the most survivors (from `reports/mutation/crypto.json`):

| File                                                 | Survived |
| ---------------------------------------------------- | -------: |
| `providers/signer/KmsSigner.ts`                      |       19 |
| `OfflineVerifier.ts`                                 |       12 |
| `support/MlDsaSupport.ts`                            |       11 |
| `PolicyChangeStepUpAuthorizationCrypto.ts`           |       10 |
| `VerificationCrypto.ts`                              |        9 |
| `KeyGeneration.ts`                                   |        6 |
| `providers/key/FileKeyProvider.ts`                   |        6 |
| `SignerBootstrap.ts`                                 |        5 |
| `KeyBootstrap.ts`                                    |        4 |
| `providers/signature/Dilithium3SignatureProvider.ts` |        4 |
| `providers/signature/Ed25519SignatureProvider.ts`    |        4 |
| `providers/SignerKeyProviderAdapter.ts`              |        3 |

`CallerAuditChainVerifier.ts` is not in the top 12. Its survivor count was not recorded for this run.

**Comparison with earlier runs (not reconciled):**

- 14 Nov, earlier run (recorded in `MUTATION-TESTING.md`): 92.3%, 1,215 caught, 101 survived. Not reproduced.
- Same code on Linux (sandbox, Node 24.22.1, `72de667`): 91.3%, 1,201 caught, 115 survived. Within one mutant of this run.

The difference from the earlier 92.3% has not been explained.

**Follow-up measured after the run (not part of this run's score):** Stryker on `KmsSigner.ts` alone, with only the KMS test files as the test command: 97.0%, 128 caught, 4 survived. The full crypto suite has not been re-run since those tests were added, so the 19 survivors in the full run are not yet re-measured.

**Survivor classification:** 0 of 114 classified in this entry. Two survivors on line 89 of `KmsSigner.ts` are candidate equivalent mutants (the key-id pattern rejects an empty name either way). They are not final until reviewed.

**Open items**

1. Confirm the survivor count for `CallerAuditChainVerifier.ts` from `reports/mutation/crypto.json`. Phase 1 item 2 requires the chain-head check to be covered.
2. Commit the stamp fix on its own branch, so the crypto run works on main without local changes. Then re-run crypto on main from a clean checkout.
3. Explain the gap between the earlier 92.3% and this run's 91.3%.
4. Classify all 114 survivors (Phase 1 item 1).
5. Re-run the full crypto suite with the KMS tests included, and re-measure `KmsSigner.ts`.
6. Two survivors on line 318 of `KmsSigner.ts` (cache cleanup on a failed load) are not yet covered. They need a test that replaces the cache entry before the old load fails.

### 2026-11-14: envelope-verifier mutation re-run, with key-validity tests

- **Command:** `npm run mutation -- envelope-verifier`
- **Runtime:** Node 24.22.1 (Linux sandbox)
- **Commit tested:** `72de667` (origin/main at that time), with two uncommitted changes: the content-based dist-stamp fix (not on main at that point), and a new test file `key-validity-reporting.test.ts`. The test file is on branch `envelope-tests` in the sandbox and is not committed. Exit code 0.
- **Branch:** none (sandbox working copy).

Results:

| Measurement                        | Value |
| ---------------------------------- | ----: |
| Mutants generated                  |   130 |
| Caught                             |   119 |
| Survived                           |    11 |
| Stryker score (caught / generated) | 91.5% |

The first run on the same base, before the new test file, scored 90.8% (118 caught, 12 survived). The new file killed one survivor, the spread on line 250 of `EnvelopeVerifier.ts`.

Survivors (all in `EnvelopeVerifier.ts`): line 175 (BlockStatement), lines 214 and 216 (BooleanLiteral), line 233 (EqualityOperator), line 236 (ConditionalExpression, two mutants), line 237 (ConditionalExpression and EqualityOperator), line 243 (ConditionalExpression and LogicalOperator, three mutants).

Survivor classification: 0 of 11 classified. Lines 236 to 243 are suspected equivalent, since a false `keyValid` implies a false `signatureVerified`. Not verified.

**Open items**

1. Explain why the line 233 equality mutant survives the key-validity tests.
2. Check the suspected equivalent mutants on lines 236 to 243 before writing tests for them.
3. Classify the remaining survivors on lines 175, 214 and 216.
4. Commit the key-validity test file on its own branch, after the stamp fix is on main.

---

### 2026-11-14: KmsSigner.ts mutation run, KMS tests only

- **Command:** `npx stryker run` on `packages/crypto/src/providers/signer/KmsSigner.ts`, with a temporary config whose test command runs only `packages/crypto/tests/unit/kms-signer`. The temporary config was not committed.
- **Runtime:** Node 24.22.1 (Linux sandbox)
- **Commit tested:** `72de667`, with the stamp fix applied locally and the KMS test files from the working copy (`kms-signer.test.ts` from main, and `kms-signer.survivors.test.ts`, not on main).
- **Branch:** none (sandbox working copy).

Results:

| Measurement                        | Before the slash-alias test | After the slash-alias test |
| ---------------------------------- | --------------------------: | -------------------------: |
| Mutants generated                  |                         132 |                        132 |
| Caught                             |                         127 |                        128 |
| Survived                           |                           5 |                          4 |
| Stryker score (caught / generated) |                       96.2% |                      97.0% |

The 97.0% figure covers this file, with only the KMS tests as the test command. It is not comparable with the full crypto run, where `KmsSigner.ts` had 19 survivors and 132 mutants. The full crypto suite has not been re-run with these tests.

Survivors after the slash-alias test: line 89 (ConditionalExpression), line 89 (StringLiteral), line 318 (ConditionalExpression), line 318 (OptionalChaining).

Survivor classification: 0 of 4 classified. The two line-89 mutants are suspected equivalent: the key-id pattern rejects an empty name either way. Not verified.

**Open items**

1. Re-run the full crypto suite with `kms-signer.survivors.test.ts` in place, and re-measure `KmsSigner.ts` in the full run.
2. Write a test for the line-318 cache cleanup. It needs a cache entry that is replaced before an older load fails, which requires fake timers to pass the cache TTL.
3. Confirm the two line-89 mutants are equivalent before recording them as such.

**Dated note, 14 November 2026:** the test file from this run is merged as PR #630 (`claude/kms-signer-tests`, merged 12:24 UTC into `main`, merge commit `6df7bd19` is the base it was tested against). The open items above are unchanged; item 1 now needs only the full-suite run on `main`. The stamp fix needed for that run is in PR #631, which is not yet merged.

**Dated correction, 14 November 2026:** the note above says merge commit `6df7bd19` is the base the KMS run was tested against. That is wrong. The run was tested on `72de667` (see the KmsSigner entry). `6df7bd19` is the `main` commit that PR #630 was opened against.

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

### 2026-11-14: PoAE benchmark re-run after decision D9

- **Command:** `npm run build:packages`, then `node_modules/vitest/vitest.mjs run tests/assurance/poae`, then the full suite `node_modules/vitest/vitest.mjs run`. Both under Node 24.22.2.
- **Runtime:** Node 24.22.2, vitest 5.1.0, Linux container. Full suite 102.70 s as reported by vitest.
- **Commit tested:** `035e1697715da917899eaf4cb7112a5fb4393020`
- **Branch:** `claude/lucid-sagan-1gs4xj`
- **Run by:** session (Claude Code), at the owner's direction

**Results**

| Measurement                                 |                                                      Value |
| ------------------------------------------- | ---------------------------------------------------------: |
| PoAE benchmark tests implemented            |                                                         11 |
| PoAE benchmark: passed                      |                                                         11 |
| PoAE benchmark: failed                      |                                                          0 |
| Not run (no change from the previous entry) |                                                          9 |
| Full suite: test files passed               |                                           401 (29 skipped) |
| Full suite: tests passed                    | 3951 (106 skipped, 1 expected fail, from an existing test) |
| Full suite: failed                          |                                                          0 |

CE-02 now passes. The fix rejects non-canonical base64 signature encodings. The previous entry (commit `d7b4e48d`) recorded the failure and is unchanged.

**Limits:** unchanged from the previous entry. XM-01 and XM-02 test the content hash. EM tests are record-level. The legacy policy path is used. One run only.

**Survivor classification:** not applicable. No mutation run.

**Open items**

1. Implement the seven testable benchmark tests not yet in the runner: AM-02, AM-03, XM-03, XM-04, EM-03, CE-01, RT-04.
2. XM-03 must run with the policy binding enabled.
3. The connector-level hash, so the EM results cover the outbound request.
4. Ledger reconciliation for CE-04 (gap G-L).

**Phase status change:** none.

---

### 2026-11-14: PoAE benchmark, all implementable tests, and connector-level hash

- **Command:** `npm run build:packages`, then `node_modules/vitest/vitest.mjs run tests/assurance/poae`, then the full suite `node_modules/vitest/vitest.mjs run`. Both under Node 24.22.2.
- **Runtime:** Node 24.22.2, vitest 5.1.0, Linux container. Benchmark file 1.29 s.
- **Commit tested:** `bbe92321e32c9aed8dbc452dbb14f440fa66c43c`
- **Branch:** `claude/lucid-sagan-1gs4xj`
- **Run by:** session (Claude Code), at the owner's direction

**Results**

| Measurement                                                                   | Value |
| ----------------------------------------------------------------------------- | ----: |
| Benchmark tests in the specification                                          |    20 |
| Implemented in the runner and passed                                          |    18 |
| Failed                                                                        |     0 |
| Covered by an existing test, not run here (EM-03, architecture boundary test) |     1 |
| Gap, not implemented (AM-04, authority version binding absent)                |     1 |

The 18 passing tests: AM-01, AM-02, AM-03, XM-01, XM-02, XM-03, XM-04, RT-01, RT-02, RT-03, RT-04, CE-01, CE-02, CE-03, CE-04, EM-01 (record level), EM-02 (record level), EM-04 (record level). Each deny case has a paired allow case, so a system that always denies cannot pass.

Full suite on the same commit: a first run had one failure, an existing exact assertion on the HTTP connector's return value, which now expects the new `wireContentHash` field. That file passes after the fix in this commit. The first run's tallies were 3965 passed, 1 expected fail (existing), 106 skipped.

**Limits:**

- XM-01 and XM-02 test the content hash. They do not test a policy limit or an approved vendor list.
- EM-01, EM-02 and EM-04 test the record-level check. The HTTP connector now hashes the body it sends, so the dispatched hash for the generic connector reflects the outbound request. The vendor adapters are not covered.
- CE-04 tests the pure reconciliation function. The connection to the stored ledger is not implemented.
- One run, not repeated.

**Survivor classification:** not applicable. No mutation run.

**Open items**

1. Vendor adapters (`GatewayHttpAdapter`, `GatewayExternalAdapter`): their outbound requests are transformed from the content, so a hash over the request needs a mapping specification.
2. Connect the reconciliation to the stored ledger (gap G-L).
3. AM-04: authority version binding (gap G-A).
4. EM-03 is covered by the architecture boundary test. Run it as part of the benchmark report, not as a separate test.

**Phase status change:** none.

---

### 2026-11-14: frozen-core enforcement test and probe

- **Command:** `ASSURANCE_WRITE_FROZEN_MANIFEST=1 node_modules/vitest/vitest.mjs run tests/assurance/frozen-core.test.ts` (manifest written once), then `node_modules/vitest/vitest.mjs run tests/assurance/frozen-core.test.ts`, then a probe: append a comment to `packages/crypto/src/ArtifactSigner.ts`, run `npm run build:packages`, run the test, restore the file with `git checkout`, rebuild, run the test. All under Node 24.22.2.
- **Runtime:** Node 24.22.2, vitest 5.1.0, Linux container.
- **Commit tested:** `5b7d2c3c6fe3f8622b9256c2289974540427376f`
- **Branch:** `claude/lucid-sagan-1gs4xj`
- **Run by:** session (Claude Code), at the owner's direction

**Results**

| Measurement                                         |                                                          Value |
| --------------------------------------------------- | -------------------------------------------------------------: |
| Frozen-core test, clean tree                        |                                             4 passed, 0 failed |
| Probe: test on a changed frozen file                | 1 failed, naming `every frozen file matches its recorded hash` |
| Probe: test after the file was restored and rebuilt |                                             4 passed, 0 failed |

**Not shown by the probe, recorded for accuracy:** the first probe attempt, without a rebuild, was stopped by the repository's dist-freshness guard in the global setup, before the test ran. The test did not produce that result. The probe was repeated after a rebuild, and the table reflects the repeated run.

**Limits:** the test checks that files have not changed, not that they are correct. Branch protection must require the owner's review for CODEOWNERS paths to be enforced.

**Survivor classification:** not applicable. No mutation run.

**Open items**

1. Confirm that branch protection on `main` requires the code-owner review for the frozen paths.
2. Frozen files not yet covered by vectors beyond the existing tests (see the coverage register).

**Phase status change:** none.

---

### 2026-11-14: dated note on paths in earlier entries

Earlier entries in this log refer to `testing/poae/` and to `docs/assurance/EXECUTION_RECEIPT_DESIGN.md`. Those research files moved to the `parmana-poae-benchmark` repository (`claude/poae-migration`, commit `1ae9801`, README in commit `2f2a30d`) and were removed from this repository in commit `5c7e8c4b`. The earlier entries are not rewritten. The runner, `tests/assurance/poae/poae-benchmark.test.ts`, is unchanged in location and still runs in CI.

---

### 2026-11-14: dated note on PoAE benchmark entries

The PoAE benchmark runner (`tests/assurance/poae/poae-benchmark.test.ts`) and its research material were removed from this repository on 14 November 2026. The entries above that refer to the runner, to `testing/poae/`, or to the 18-test result describe runs of that removed code. They are kept unchanged, as the rules require. The results are no longer reproducible from this repository's current tree, and they are not evidence for any claim in it.

---

### 2026-11-14: full test suite on the PR #634 head

- **Command:** `npm run build:packages`, then `node_modules/vitest/vitest.mjs run` (the full suite), under Node 24.22.2.
- **Runtime:** Node 24.22.2, vitest 5.1.0, Linux container. Suite duration 102.98 s.
- **Commit tested:** `70aac76c800adcf0b4b0179ac794902aaac984c7`
- **Branch:** `claude/lucid-sagan-1gs4xj`
- **Run by:** session (Claude Code), at the owner's direction

**Results**

| Measurement       |                                                      Value |
| ----------------- | ---------------------------------------------------------: |
| Test files passed |                                           403 (29 skipped) |
| Tests passed      | 3952 (106 skipped, 1 expected fail, from an existing test) |
| Failed            |                                                          0 |

**Limits:** one run. The PoAE benchmark is no longer in this repository, so these tests do not include it.

**Survivor classification:** not applicable. No mutation run.

**Open items:** none added by this run.

**Phase status change:** none.

---

### 2026-11-14: razorpay:refund policy binding (capability-registry)

- Command: `npm run typecheck`; `node_modules/vitest/vitest.mjs run packages/capability-registry` (Node 24.22.2), after `npm run build:packages`
- Runtime: not measured
- Commit tested: `6b573f63` on branch `claude/bind-razorpay-refund` (signed off, not signed; see POLICY_BINDING_RAZORPAY.md section 8).
- Branch: `claude/bind-razorpay-refund`

Results: typecheck exit 0. capability-registry: 3 files, 32 tests, all passed. Before the fix, one existing test (which asserted an empty canonical table) failed; it was updated to assert the single new entry.

Survivor classification: not applicable. No mutation run.

Open items: P-5, confirmation of the policy version (`docs/assurance/POLICY_BINDING_RAZORPAY.md`). Full suite, frozen-core test and Razorpay live test not run.

Phase status change: none.

---

### 2026-11-14: revert of the razorpay:refund binding (decision D15)

- Command: `npm run typecheck`; `node_modules/vitest/vitest.mjs run packages/capability-registry packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts` (Node 24.22.2), after `npm run build:packages`
- Runtime: not measured
- Commit tested: the revert commit on branch `claude/bind-razorpay-refund` (the SHA is recorded in the pull request, not here, because the commit is not signed)
- Branch: `claude/bind-razorpay-refund`

Results: typecheck exit 0. Tests: 3 files, 29 tests, all passed.

Earlier full-suite run (before the revert, Node 24.22.2): 403 of 433 files passed, 29 skipped; 3,956 tests passed, 1 failed. The failure was the G-77 classification assertion, caused by the razorpay:refund binding. Owner decision D15: keep the assertion, drop the binding.

Not run after the revert: the full suite.

Survivor classification: not applicable. No mutation run.

Open items: the razorpay:refund policy binding remains open (OPEN_ITEMS.md, Razorpay bind). Commit signing: not signed (no key in this session).

Phase status change: none.

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
