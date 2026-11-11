# 3.33 A Failed Kill Switch Probe Opens a P1 Issue (Scoped, 2026-11-05)

Source: CLAIMS.md (commit d1d63c6), lines 2168-2182.

## Exact claim text

## 3.33 A Failed Kill Switch Probe Opens a P1 Issue (Scoped, 2026-11-05)

**Claim.** When the scheduled kill switch probe fails, the workflow opens one P1 issue that links to the failed run. It does not open another while an open issue with the same title exists.

**Evidence.**

- `.github/workflows/kill-switch-probe.yml`: the final step runs only on failure, searches open issues for the title, and creates the issue with the `P1` label. The workflow has `issues: write`.
- The workflow file parses as YAML. The startup check is covered by six unit tests and the kill switch startup tests (`packages/api/tests/unit/createKillSwitch.test.ts`).

**Limits.**

- The alert has not yet been seen firing on a real failure. It is verified by reading the workflow, not by a failed run.
- The duplicate check is a text search. It can match another open issue with similar words, and then the new failure is not reported.
- The probe key is still not rotated on a schedule (G-145). The server refuses to start with the kill switch on and no `kill-switch-probe` entry holding exactly `kill-switch:probe` (`packages/api/src/bootstrap/assertProbeKeyEntry.ts`). The server cannot read the repository secret, so the probe workflow checks its key with Parmana before each run and reports a rejected key as a key mismatch (PR #450).


## Cited evidence paths

- `.github/workflows/kill-switch-probe.yml`: EXISTS
- `packages/api/src/bootstrap/assertProbeKeyEntry.ts`: EXISTS
- `packages/api/tests/unit/createKillSwitch.test.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/unit/createKillSwitch.test.ts` | passed | 7 | 7 | 0 |
