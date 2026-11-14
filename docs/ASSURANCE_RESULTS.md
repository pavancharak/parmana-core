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
