# Production Readiness Gate

The Production Readiness Gate (PRG) decides whether a commit can be released.
It is strict and fails closed: a check that cannot run, times out, errors, or
has no evidence is a FAIL. A gate passes only when every check in it passes.
The release passes only when all eight gates pass.

A passing CI run does not establish production readiness. CI proves the code
behaves as tested. G8 also requires owner-signed evidence about deployment,
backups and infrastructure, which no automated check can supply.

## What is checked

| Gate             | Checks                                                                          | Source of the result                                |
| ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| G1 Code quality  | lint, typecheck, format, generated Python models                                | the gate runs the commands                          |
| G2 Testing       | full test suite against PostgreSQL, migrations applied                          | the gate runs the commands                          |
| G3 Security      | CodeQL, dependency review, Scorecard, secret-scan rules present                 | existing workflows, read for this commit            |
| G4 Dependencies  | lockfile in sync, no critical production CVEs, licences                         | the gate runs npm and reads the lockfile            |
| G5 Configuration | required variables documented, no real `.env` files tracked                     | the gate reads the repository                       |
| G6 Reliability   | readiness route present, rate-limit and sandbox tests                           | the gate runs the tests                             |
| G7 Governance    | approval, authority, kill-switch, audit and replay tests, bypass probe, CI jobs | the gate runs tests and reads CI                    |
| G8 Release       | changelog entry, DCO and signatures, owner records (3)                          | the gate reads the repository, CI and owner records |

The policy is `production-readiness/policies/readiness-policy.json`. It is
data, not code, so changes to a check are visible in review.

## How it is enforced

1. **Rules are pinned to a reviewed commit.** The workflow runs the engine and
   policy from the commit in `ENGINE_SHA`, not from the change under review and
   not from whatever is on `main`. Changing the pin is a reviewed change, and
   records a decision under `production-readiness/decisions/`. A pull request
   cannot weaken its own gate.
2. **Owner records come from the base branch.** A record counts only after it
   is merged and reviewed. A pull request cannot approve itself.
3. **No bypass.** The engine has no override or skip flag for a release. A
   partial run (`--gates`) and a run without commands (`--skip-commands`) can
   never produce an overall PASS.
4. **Evidence is kept.** Each run uploads `report.json` and `report.md`,
   named by commit SHA, with 400-day retention. Failing checks include the
   command, exit code and output tail, or the reason the check failed.
5. **Unexpected errors fail.** An exception inside a check becomes a FAIL for
   that check.

## Bootstrap

The engine is introduced by pull request #768. On that pull request the base
branch does not have the engine, so the check fails with a message naming the
pinned commit. The one-time trust decision is recorded in
[PRG-D1](../production-readiness/decisions/PRG-D1-bootstrap.md). After #768 is
merged, the pin and the rules are on `main`.

## Owner actions (cannot be set from code)

These are repository settings. Until they are in place, the gate is advisory.

1. Make the `production-readiness` check required on `main` with a branch
   ruleset. Require pull request reviews, and require CODEOWNERS review.
2. Keep the existing required checks on `main`, including CodeQL, DCO and
   verified-commits.
3. Supply commit signing. The commit signing key file
   (`/home/claude/.ssh/commit_signing_key.pub` in this environment) is empty, so
   signed commits cannot be verified from this environment yet.
4. Provide the three G8 owner records (see below) for each release.

## Owner records (G8)

Three records are required per release, in
`production-readiness/evidence/manual/`:

- `deployment-verification.json`
- `backup-recovery-drill.json`
- `runtime-infrastructure-review.json`

Each has an approver, approval and expiry dates, the release version, a summary
and an evidence link. The format is described in
`production-readiness/evidence/manual/README.md`. A record for another version
or an expired record fails G8.

## Running it locally

Run the non-command checks quickly:

```bash
python3 -I production-readiness/scripts/evaluate-gates.py \
  --policy production-readiness/policies/readiness-policy.json \
  --repo-root . --out /tmp/readiness --skip-commands
```

This is not a release verdict. The full run needs PostgreSQL and the environment
from CI. It is the same command the workflow runs, and it is the only source of
a release verdict.

Run the engine's own tests:

```bash
python3 -I -m unittest discover -s production-readiness/tests -t production-readiness/tests
```

## Known limits

- The gate does not replace the existing CI jobs. G1 and G2 repeat them, so a
  pull request costs more CI time. This is deliberate: the gate evaluates
  commands itself rather than trusting another workflow's result.
- G3 and G7 read check runs for the same commit. If a workflow is still
  running when the gate reads it, the check is not successful and the gate
  fails. Re-run the gate after the others finish.
- The secret-scan check verifies that `.gitleaks.toml` exists. It does not run
  gitleaks. Add a scan step before relying on that gate for secrets.
- Runtime health in production, infrastructure state, backups and recovery are
  covered only by the owner records in G8. They are not measured by the gate.
- Adding a second reviewer on security-sensitive paths is recorded in CODEOWNERS
  as a follow-up.
