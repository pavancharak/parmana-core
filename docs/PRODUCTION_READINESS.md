# Production Readiness Gate

The Production Readiness Gate (PRG) decides whether a commit can be released. It is a
strict, fail-closed gate: a check that cannot run, times out, errors, or has no evidence
is a failure. A gate passes only when every check that applies to the event passes. A
release passes only when all eight gates pass.

A passing CI run does not establish production readiness. CI shows the code behaves as
tested. The release gate (G8) also requires owner-signed evidence about deployment,
backups and infrastructure, which no automated check can produce.

This document describes the gate as it is defined in this repository: its trust model,
each gate and check, how the gate runs in CI, how it is changed, how owners supply
evidence, and what it does not yet cover.

## Contents

1. Purpose and principles
2. Trust model and the pinned engine
3. Components
4. The eight gates and every check
5. How the gate runs in CI, step by step
6. Results: pass, fail, not applicable, skipped
7. Owner records (G8)
8. Changing the gate: versions, tags and decisions
9. Running the gate locally
10. Current status and known gaps
11. Owner actions that cannot be set from code
12. Troubleshooting

## 1. Purpose and principles

- **No code reaches production unless it passes measurable checks.** Each check
  produces a PASS or FAIL with evidence, not an opinion.
- **Fail closed.** A check that cannot run, times out, errors, or has no evidence is a
  FAIL. Nothing passes by default.
- **No bypass.** The engine has no override or skip flag for a release. A partial run
  (`--gates`) and a run without commands (`--skip-commands`) can never produce an
  overall PASS.
- **Rules are reviewed and versioned.** The gate's engine and policy are a named,
  tagged version. Changing them is a reviewed decision, not a side effect of a merge.
- **Reuse existing evidence.** The gate reads results that CI already produces for the
  same commit (CodeQL, dependency review, DCO, and the CI jobs), and runs the rest itself.

## 2. Trust model and the pinned engine

The gate must not be able to approve itself. Three rules make that hold:

1. **The engine and policy come from a pinned version, not from the change under review.**
   The workflow checks out a fixed commit, named in the workflow as `ENGINE_SHA`. It is
   currently `d93f4d1` (PRG-D2). The owner plans to name it with the tag `prg-v1.0.0` and
   pin to the tag (PRG-D2). A pull request that edits `production-readiness/` is judged by
   the pinned version, not by its own edit.
2. **Owner records come from the base branch.** The workflow checks out the pull
   request's base commit and reads `production-readiness/evidence/manual/` from there.
   An owner record counts only after it is merged into the base branch, so a pull request
   cannot approve itself.
3. **The pin only moves through a decision.** Changing the tag in the workflow is a
   reviewed change, recorded as a decision in `production-readiness/decisions/`, and
   owned by CODEOWNERS.

Consequence: a fix to the gate's code does not take effect in CI until the pin moves to a
tag that contains that fix. The gate shows its own version in the report (`version` and
`policy_version`, and the `sha` it evaluated).

Bootstrap: the first introduction of the engine (commit `1173d06`, decision PRG-D1) had
no engine on `main` to read from. The bootstrap is recorded in
`production-readiness/decisions/PRG-D1-bootstrap.md`.

## 3. Components

| Path                                                  | Purpose                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `production-readiness/policies/readiness-policy.json` | The gates, checks, timeouts, events and the licence policy. Data, reviewed as data. |
| `production-readiness/scripts/evaluate-gates.py`      | The engine. Standard library only. Evaluates the policy and writes evidence.        |
| `production-readiness/tests/test_evaluate_gates.py`   | Unit tests for the engine: every check type and every fail-closed path.             |
| `production-readiness/evidence/manual/`               | Owner records for G8, with `README.md` and `template.json`.                         |
| `production-readiness/decisions/`                     | Decision records (PRG-D1 bootstrap, PRG-D2 tag pinning).                            |
| `.github/workflows/production-readiness.yml`          | The CI job that runs the gate.                                                      |
| `docs/PRODUCTION_READINESS.md`                        | This document.                                                                      |

## 4. The eight gates and every check

Each check below lists its ID, what it proves, how it is run, and what a failure means.
Commands run from the repository root with no shell. Timeouts are in the policy.

### G1 Code quality

| Check              | Proves                                      | How                           | Failure means                                               |
| ------------------ | ------------------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `G1.lint`          | The source passes ESLint.                   | `npm run lint`                | A lint rule is violated. Run `npm run lint` locally.        |
| `G1.typecheck`     | The workspaces type-check.                  | `npm run typecheck`           | A type error. Packages must be built first (see section 9). |
| `G1.format`        | Files match Prettier.                       | `npm run format:check`        | A file is not formatted. Run `npx prettier --write <file>`. |
| `G1.python-models` | Generated Python models match their source. | `npm run check:python-models` | Models are stale. Regenerate them.                          |

### G2 Testing

| Check                     | Proves                                                                 | How                                             | Failure means                                                   |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `G2.unit-and-integration` | The full suite passes, including integration tests against PostgreSQL. | `npm test` (builds packages, then `vitest run`) | A test fails, or the database is not reachable. Timeout 3600 s. |
| `G2.migrations-applied`   | Every migration is applied to the test database.                       | `npm run db:migrate -- status`                  | Pending migrations. The workflow applies them first.            |

### G3 Security

| Check                   | Proves                                                           | How                                                    | Failure means                                                                                    |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `G3.codeql`             | CodeQL analysis of JavaScript/TypeScript passed for this commit. | Reads the check run `Analyze (javascript-typescript)`. | CodeQL found issues, or the run did not finish successfully.                                     |
| `G3.dependency-review`  | The pull request adds no vulnerable or denied dependency.        | Reads the check run `dependency-review`.               | Dependency review failed.                                                                        |
| `G3.scorecard`          | OpenSSF Scorecard passed. **Runs on `push` only.**               | Reads the check run `Scorecard analysis`.              | Scorecard reported a finding. On pull requests the check is not applicable (see section 6).      |
| `G3.secret-scan-config` | A secret-scanning rules file exists.                             | `.gitleaks.toml` exists.                               | The file is missing. **Note:** this does not run gitleaks. It only checks the rules file exists. |

### G4 Dependencies

| Check                 | Proves                                                    | How                                                                                                                                                                                                                    | Failure means                                                                                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G4.lockfile-in-sync` | `package-lock.json` matches `package.json`.               | `npm ci --ignore-scripts --dry-run`                                                                                                                                                                                    | The lockfile is out of date. Run `npm install` and commit the lockfile.                                                                                                                                                                                   |
| `G4.critical-cves`    | No critical vulnerability in production dependencies.     | `npm audit --omit=dev --audit-level=critical`                                                                                                                                                                          | A critical advisory exists, or the audit could not be read. Timeout 300 s.                                                                                                                                                                                |
| `G4.licences`         | No production package npm installed has a denied licence. | Reads `node_modules/.package-lock.json` (the installed tree) and each installed package's `package.json`. Lockfile entries that npm did not install are out of scope. Denied: AGPL-3.0 variants, SSPL-1.0, UNLICENSED. | A denied licence, or a production package is not installed so its licence cannot be read. Platform-excluded optional packages (for example esbuild binaries for other operating systems) are excluded because npm does not install them on this platform. |

### G5 Configuration

| Check                        | Proves                                                                                                | How                                                                                                                            | Failure means                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `G5.required-env-documented` | Every required variable (`DATABASE_URL`, `PARMANA_DATABASE_CA_FILE`) is documented in `.env.example`. | Reads `.env.example`.                                                                                                          | A required variable is not documented.                                                 |
| `G5.no-committed-env-files`  | No real environment file is tracked by git.                                                           | `git ls-files`; forbidden: `.env`, `.env.local`, `.env.production`, `.env.test`. Allowed: `.env.example`, `.env.test.example`. | A real `.env` file is committed. Remove it from the index and rotate any secret in it. |

### G6 Reliability

| Check                       | Proves                                         | How                                                 | Failure means                      |
| --------------------------- | ---------------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| `G6.readiness-route`        | The readiness route exists.                    | `packages/api/src/routes/ready.ts` exists.          | The route is missing.              |
| `G6.sandbox-and-rate-limit` | Rate-limit and sandbox integration tests pass. | `npx vitest run` on the two integration test files. | A test fails. Requires PostgreSQL. |

### G7 Governance

| Check                         | Proves                                                                                                                                                                                           | How                                                    | Failure means                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `G7.authorization-boundaries` | Human-approval, authority-grant and kill-switch behaviour holds.                                                                                                                                 | `npx vitest run` on four integration test files.       | A boundary test fails.                                                   |
| `G7.audit-evidence`           | Audit verification and replay behave correctly.                                                                                                                                                  | `npx vitest run` on `audit-verify` and `replay` tests. | Audit or replay evidence fails verification.                             |
| `G7.bypass-probe`             | Execution cannot be reached without the governed path.                                                                                                                                           | `npx tsx scripts/run-bypass-probe.ts`                  | The probe found a bypass.                                                |
| `G7.ci-required-jobs`         | `build-and-test`, `verify-policy-approvals` and `python-reference-drift` passed for this commit. **Waits** up to 1500 s, polling every 30 s, for runs that are still pending or not yet created. | Reads the check runs for the commit.                   | A run failed, or it was still unfinished or missing when the wait ended. |

### G8 Release

| Check                        | Proves                                                                               | How                                                                              | Runs on        | Failure means                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `G8.changelog-entry`         | `CHANGELOG.md` has a heading for the package version.                                | Reads `CHANGELOG.md` for the version in `package.json`.                          | `release` only | No entry for this version.                                                          |
| `G8.dco-and-signatures`      | DCO and commit-signature checks passed for this commit.                              | Reads the check runs `DCO` and `verified-commits`.                               | every event    | A sign-off or a signature check failed.                                             |
| `G8.deployment-verification` | An owner-signed, unexpired deployment verification record exists in the base branch. | Reads `evidence/manual/deployment-verification.json` from the base branch.       | `release` only | No record, or the record is invalid, expired, for another version, or not approved. |
| `G8.backup-and-recovery`     | An owner-signed, unexpired backup and recovery drill record exists.                  | Reads `evidence/manual/backup-recovery-drill.json` from the base branch.         | `release` only | As above.                                                                           |
| `G8.runtime-infrastructure`  | An owner-signed, unexpired runtime and infrastructure review record exists.          | Reads `evidence/manual/runtime-infrastructure-review.json` from the base branch. | `release` only | As above.                                                                           |

Owner record rules are in section 7.

## 5. How the gate runs in CI, step by step

The workflow is `.github/workflows/production-readiness.yml`. It runs on pull requests,
pushes to `main`, and manual dispatch. Each step, in order:

1. **Check out the change under review** into `change/`. This is the code being judged.
2. **Check out the pinned engine** into `trusted/`, at the commit in `ENGINE_SHA`. This is
   the rule set. It is not the change under review.
3. **Check out the base branch** into `base/`. For a pull request this is the base commit;
   otherwise the commit being pushed. This is where owner records are read from.
4. **Confirm the pinned engine exists.** If `evaluate-gates.py` or the policy is missing
   from the pin, the job fails at once with a message naming the pin. This is the step that
   reports a bootstrap error.
5. **Set up Node** using the version in `change/.nvmrc` (24.x), with the npm cache.
6. **Install and build**: `npm ci` then `npm run build` in `change/`.
7. **Apply migrations** to the test database: `npx tsx scripts/migrate-database.ts apply`.
8. **Evaluate the gate**: runs `evaluate-gates.py` from `trusted/` against the code in
   `change/`, with owner records from `base/`, and the commit as `--sha`. Its exit code is
   the job result. The command is:

   ```bash
   python3 -I ../trusted/production-readiness/scripts/evaluate-gates.py \
     --policy ../trusted/production-readiness/policies/readiness-policy.json \
     --manual-root ../base \
     --repo-root . \
     --out "$RUNNER_TEMP/readiness" \
     --sha "$GITHUB_SHA"
   ```

9. **Upload evidence** (`report.json` and `report.md`) as the artifact
   `readiness-evidence-<sha>`, always, even when the gate fails.

Each command check runs in `change/`, sequentially, with its own timeout. The engine does
not run checks in parallel, so results are deterministic.

The workflow passes `--event "$GITHUB_EVENT_NAME"`, so event-scoped checks (section 6)
are evaluated for the event that triggered the run.

## 6. Results: pass, fail, not applicable, skipped

Every check ends in exactly one status:

| Status           | Meaning                                                                  | Counts toward a gate                          |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| `PASS`           | The evidence positively shows the check passed.                          | Yes                                           |
| `FAIL`           | The check failed, could not run, timed out, errored, or had no evidence. | Gate fails                                    |
| `NOT_APPLICABLE` | The policy declares `run_on` and the event is not in it.                 | Excluded. Declared in the policy, not a skip. |
| `SKIPPED`        | The check was not run (only with `--skip-commands`, a local run).        | Gate fails                                    |

Gate rules:

- A gate **fails** if any applicable check fails, or is skipped.
- A gate **passes** if every check is PASS or NOT_APPLICABLE, and at least one is PASS.
- A gate with **nothing applicable** fails, so a gate cannot pass by having all its checks
  excluded.

Overall rules:

- The release **passes** only when all eight gates pass.
- A partial run (`--gates`) can never pass overall.
- The process exits 0 only on an overall PASS.

Events: `pull_request` runs the gate on each pull request. `push` runs it on pushes to
`main`, where Scorecard runs. `release` runs the release checks (G8, except DCO and
signatures). `local` is used for manual runs and is not a release verdict.

## 7. Owner records (G8)

Three records are required for each release, in `production-readiness/evidence/manual/`:

- `deployment-verification.json`
- `backup-recovery-drill.json`
- `runtime-infrastructure-review.json`

Each record has these fields:

| Field             | Rule                                                           |
| ----------------- | -------------------------------------------------------------- |
| `record`          | Must equal the file name without `.json`.                      |
| `approver`        | A named owner. Must not be empty.                              |
| `approved_on`     | `YYYY-MM-DD`. Must not be in the future.                       |
| `expires_on`      | `YYYY-MM-DD`. The gate fails after this date.                  |
| `release_version` | Must equal the version in `package.json`.                      |
| `summary`         | What was checked, and the result.                              |
| `evidence_url`    | A link to the drill log, the runbook run, or the review notes. |

Records are read from the **base branch**, so a record counts only after it is merged and
reviewed under CODEOWNERS. A record for another version, an expired record, or a record
with no approver fails G8. Use `production-readiness/evidence/manual/template.json` as the
starting point.

## 8. Changing the gate: versions, tags and decisions

Every change to the engine, the policy, or the workflow's pin is a release of the gate.

1. **Make the change in a pull request.** Add or change checks in the policy, change the
   engine, and add unit tests in `production-readiness/tests/`.
2. **Run the unit tests and the format check.** See section 9.
3. **Record a decision** in `production-readiness/decisions/` using
   `testing/templates/decision-record.md`. Name the change, the reason, the options
   considered, and the owner's decision.
4. **Tag the reviewed commit** with an annotated tag, `prg-vX.Y.Z`. Protect tags so only the
   owner can create or move them (owner action, section 11).
5. **Move the pin.** Change `ENGINE_SHA` in the workflow to the new commit, or to the tag once
   the owner creates it, in the same pull
   request, and link the decision.
6. **Get owner approval.** CODEOWNERS requires review for `production-readiness/` and the
   workflow file.

Current decisions:

- **PRG-D1 (bootstrap):** the engine was first introduced at commit `1173d06`, pinned by
  SHA. Approved by Pavan Charak on 2026-11-22.
- **PRG-D2 (pin and event scope):** the pin moves to commit `d93f4d1`, which adds
  event-scoped checks and the G7 wait. Approved by Pavan Charak on 2026-11-22. The tag
  `prg-v1.0.0` is to be created by the owner and used as the pin, with a follow-up decision.

## 9. Running the gate locally

Set up once:

```bash
npm ci
npm run build
```

Run the unit tests of the engine (no network, no database):

```bash
cd production-readiness/tests
python3 -I test_evaluate_gates.py
```

Run the non-command checks quickly. This is not a release verdict:

```bash
python3 -I production-readiness/scripts/evaluate-gates.py \
  --policy production-readiness/policies/readiness-policy.json \
  --repo-root . --out /tmp/readiness --skip-commands
```

Run the full gate, with every command check. This needs PostgreSQL and the environment from
`.env.test` (see `.env.test.example`). Without a GitHub token, the check-run checks (G3, G7,
G8 DCO) fail, as they do outside CI:

```bash
set -a; . ./.env.test; set +a
python3 -I production-readiness/scripts/evaluate-gates.py \
  --policy production-readiness/policies/readiness-policy.json \
  --repo-root . --out /tmp/readiness --sha "$(git rev-parse HEAD)"
```

Run a subset of gates (never a release verdict):

```bash
python3 -I production-readiness/scripts/evaluate-gates.py \
  --policy production-readiness/policies/readiness-policy.json \
  --repo-root . --out /tmp/readiness --gates G1,G4
```

Use Node 24 (`.nvmrc`). The pre-commit and pre-push hooks require it.

## 10. Current status and known gaps

Status as of commit `ef7c741` on `claude/wonderful-wozniak-exparw` (pull request #768). The
pin is `d93f4d1` (PRG-D2). This commit has not yet been run in CI, so the table reports two
things: what the pinned engine is designed to do, and the last CI result observed.

| Item                     | Status                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engine unit tests        | 41 pass locally                                                                                                                                                                            |
| Pin                      | `d93f4d1`, with `--event` and the `release` trigger (PRG-D2). The tag `prg-v1.0.0` is pending owner creation (GitHub refused the tag push from the build environment).                     |
| G1 code quality          | Passed in the last CI run observed (on `0d1f6a0`)                                                                                                                                          |
| G2 testing               | Passed in the last CI run observed (the full suite runs inside the gate)                                                                                                                   |
| G3 security              | Scorecard is `push`-only from `d93f4d1`. Expected to pass on pull requests now, to be confirmed by CI.                                                                                     |
| G4 dependencies          | Failed in CI, passes locally on the same lockfile. The CI detail could not be read from the build environment (the evidence file is on a storage host it cannot reach). Not yet diagnosed. |
| G5 configuration         | Passed in the last CI run observed                                                                                                                                                         |
| G6 reliability           | Passed in the last CI run observed                                                                                                                                                         |
| G7 governance            | Wait for pending runs is in `d93f4d1`. Local commands pass. Expected to pass in CI now, to be confirmed.                                                                                   |
| G8 release               | Runs on `release` only, except DCO and signatures. Fails on release until owner records exist. Not applicable on pull requests.                                                            |
| Required check on `main` | Not yet set (owner action).                                                                                                                                                                |
| Commit signing           | Not available: the signing key file in this environment is empty.                                                                                                                          |

Known gaps, by design or in the implementation:

- **G4 is unresolved.** It fails in CI and passes locally on the same lockfile. Read the
  evidence artifact of a CI run to find the cause before relying on G4.
- **Secret scanning is not run.** G3.secret-scan-config checks the rules file exists. Add a
  gitleaks step before relying on this for secrets.
- **Runtime health, infrastructure state, backups and recovery** are covered only by the
  owner records in G8. They are not measured by the gate.
- **The gate depends on GitHub check-run names.** If a workflow job is renamed, the check
  fails with `missing`. Keep the names in the policy in step with the workflows.
- **The check-run wait is bounded.** G7 waits up to 1500 s. A run that takes longer fails
  the gate. Re-run the gate after the run finishes.
- **The gate does not replace CI.** G1 and G2 repeat CI commands, so a pull request costs
  more CI time. This is deliberate: the gate runs its own commands rather than trusting
  another workflow's result.
- **Release signing and provenance** are not part of this gate. The release workflow
  (`release.yml`) covers artifacts and SLSA provenance separately.

## 11. Owner actions that cannot be set from code

1. **Required check on `main`.** Add the `production-readiness` check to a branch ruleset,
   with pull request reviews and CODEOWNERS review.
2. **Tag protection.** Restrict creating and moving `prg-v*` tags to the owner.
3. **Approval of pin moves.** Approve each pin change and its decision record.
4. **G8 records.** Provide the three owner records for each release, merged to `main`.
5. **Commit signing.** Provide a signing key so signed commits can be verified.
6. **Existing required checks.** Keep CodeQL, DCO, verified-commits and the CI jobs
   required on `main`.

## 12. Troubleshooting

| Symptom                                                                     | Cause                                                | Fix                                                                                  |
| --------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pinned engine (...) does not contain ...`                                  | The pinned commit or tag has no engine or policy.    | Check `ENGINE_SHA` in the workflow. See PRG-D1.                                      |
| G7 `still waiting after 1500s`                                              | A CI run did not finish within the wait.             | Find the slow run. Re-run the gate after it finishes.                                |
| G4 `not installed, licence cannot be verified`                              | A production package is missing from `node_modules`. | Run `npm ci`, not a partial install.                                                 |
| G8 `no owner record`                                                        | The record is not merged to `main`.                  | Merge the record through a reviewed pull request.                                    |
| G8 `record covers ...`                                                      | The record is for another version.                   | Write a record for the current `package.json` version.                               |
| G8 `record expired`                                                         | `expires_on` is in the past.                         | Renew the record with a new review.                                                  |
| `check raised ...`                                                          | The engine hit an unexpected error.                  | Fails closed by design. Read the engine traceback in the job log and fix the engine. |
| `command not found`                                                         | A required tool is not on the PATH.                  | Install it, or check the Node 24 setup.                                              |
| Format check fails on `production-readiness/policies/readiness-policy.json` | The JSON is not in Prettier's layout.                | Run `npx prettier --write production-readiness/policies/readiness-policy.json`.      |
