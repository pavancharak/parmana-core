# Assurance results log

This log records assurance test runs against the plan in
[ASSURANCE_TESTING_PLAN.md](ASSURANCE_TESTING_PLAN.md). Owner: Pavan Charak.

**Rules**

- Append a new entry for each run. Do not rewrite earlier entries. To correct an entry, add a dated note under it.
- Record only outputs that were actually produced. Write "not run" where a check was not run.
- Survivor classifications are recorded separately from the mutation score.

## Phase status

| Phase                      | Status      | Notes                                                                                                                                                         |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Cryptographic assurance | In progress | Mutation re-run 14 Nov: 91.3% on origin/main (114 survived, not yet classified). KMS signer tests added. Chain-head coverage to be confirmed from the report. |
| 2. Authorization assurance | Not started |                                                                                                                                                               |
| 3. Adversarial assurance   | Not started |                                                                                                                                                               |
| 4. Operational assurance   | Not started |                                                                                                                                                               |
| 5. Release assurance       | Not started |                                                                                                                                                               |

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
