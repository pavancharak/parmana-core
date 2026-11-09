# Design: test database configuration

Status: **implemented** in PR #532 (steps 1 and 2) and PR #533 (steps 5 to 8). Four tests from section 5 are not yet
run or automated (9, 10, 11 for the log line, and 13). Two owner questions remain open (section 8). This document records
the problem, the state before the change, the decisions and what was built, the tests and what they show, and what is
still open.

Related: `docs/internal/runbooks/INTEGRATION-TESTS.md`, sections 2 and 3a; `docs/internal/handovers/G-143-sandbox-2026-11.md`;
PR #526 (sandbox test setup), PR #531 (this design), PR #532 and PR #533 (implementation).

Project IDs are written as placeholders in this document: `<production project ID>` and `<sandbox project ID>`. The real
values are in the Supabase dashboard, not in the repository.

---

## 1. Problem

Test suites that talk to a real Postgres database read their connection string from configuration files and the shell.
The same file, `.env`, holds the production connection string. Several things went wrong during the G-143 sandbox work:

1. **Production values in a file tests read.** `vitest.setup.ts` loaded `.env` after `.env.test`, so a run that reached a
   database-gated suite could see the production `DATABASE_URL` whenever `.env.test` did not override it.
2. **Two different variable names for the same thing.** Most suites read `DATABASE_URL`. The consumption suite read
   `TEST_DATABASE_URL`. A third name, `PARMANA_TEST_DATABASE_URL`, appeared in `packages/shared/src/config/Doctor.ts`.
3. **A template that is wrong for a second target.** `.env.test.example` pointed at a local Docker database. Copying it
   and changing only the URL left an uncommented or missing opt-in flag, or a duplicate `DATABASE_URL` line. Dotenv uses
   the first occurrence, so tests ran against the wrong database, or skipped.
4. **Silent skips.** A suite skipped because its opt-in was missing reported success.
5. **No visible target.** Nothing printed which database a live run would use before it wrote to it.
6. **A `TEST_DATABASE_URL` line in `.env`** made a refusal guard fire, because the same value had been copied into the
   wrong file.

None of these was caused by a code defect. All came from how configuration was split across files.

## 2. State before the change

Checked on `main` at `ceeaada`, before PR #532:

- `vitest.setup.ts` loaded `.env.test`, then `.env`, both with `override: false`. Protection depended on `.env.test`
  overriding every database variable.
- `resolveDatabaseGate` read `DATABASE_URL` and `ALLOW_LIVE_SUPABASE`.
- The consumption suite read `TEST_DATABASE_URL`, fell back to `DATABASE_URL` with the opt-in, and refused to run when the
  two were equal.
- `Doctor.ts` listed `PARMANA_TEST_DATABASE_URL`. No suite read it.
- `.env.test.example` pointed at the local Docker database.
- No code checked which project a database URL pointed at. The only protection was the opt-in flag.

## 3. Decisions and status

| #   | Decision                                                                                                            | Status                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| D1  | Tests read one variable: `TEST_DATABASE_URL`.                                                                       | Done (PR #533). `DATABASE_URL` is also set to the same validated value for `PostgresPoolFactory`. |
| D2  | `.env` never supplies a test database URL. Setup loads `.env.test` only.                                            | Done (PR #532).                                                                                   |
| D3  | A project allowlist (`PARMANA_TEST_PROJECT_REFS`). An empty list refuses every hosted target.                       | Done (PR #532).                                                                                   |
| D4  | A project on `PARMANA_PRODUCTION_PROJECT_REFS` is refused even if it is also allowed.                               | Done (PR #532).                                                                                   |
| D5  | The setup logs the target's project ID, never the connection string. A hosted target needs `ALLOW_LIVE_SUPABASE=1`. | Done (PR #532).                                                                                   |
| D6  | With no `TEST_DATABASE_URL`, database suites skip, with one visible summary line.                                   | Done (PR #532).                                                                                   |
| D7  | A suite that needs a database fails when the opt-in is set but the URL is missing.                                  | Existing behaviour of `resolveDatabaseGate`. Not re-tested.                                       |
| D8  | One template, `.env.test.example`, with a local option (default) and a hosted option.                               | Done (PR #533).                                                                                   |
| D9  | `PARMANA_TEST_DATABASE_URL` removed from `Doctor.ts`.                                                               | Done (PR #533).                                                                                   |

## 4. Implementation

| Step | What                                                                                                                                               | Where                                                        | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| 1    | Target helper: `resolveDatabaseTarget`, `resolveDatabaseUrlTarget`, `projectRefOf`                                                                 | PR #532                                                      | Done   |
| 2    | `vitest.setup.ts` loads `.env.test` only, validates every database variable, logs the target                                                       | PR #532                                                      | Done   |
| 3    | Gate helpers read `TEST_DATABASE_URL`                                                                                                              | PR #533                                                      | Done   |
| 4    | Consumption suite reads `TEST_DATABASE_URL`; equality guard removed                                                                                | PR #533                                                      | Done   |
| 5    | Other database suites read `TEST_DATABASE_URL`: outcome repository, nonce cleanup, inbound decision repository, kill switch, caller key revocation | PR #533                                                      | Done   |
| 6    | `.env.test.example` replaced                                                                                                                       | PR #533                                                      | Done   |
| 7    | Runbook sections 2 and 3a, developer guide                                                                                                         | PR #533                                                      | Done   |
| 8    | `PARMANA_TEST_DATABASE_URL` removed from `Doctor.ts`; the migrations test uses the target and runs only locally                                    | PR #533                                                      | Done   |
| 9    | Regenerate generated documents                                                                                                                     | Not needed: no generated document includes the changed files | Done   |

Unchanged on purpose: unit tests that set `DATABASE_URL` to exercise bootstrap code (for example `create-nonce-store`),
and production code that reads `DATABASE_URL` at runtime (`Config`, the application's bootstrap).

## 5. Tests

Unit tests for the target rules (PR #532, `tests/unit/database-target.test.ts`, 14 cases, all passing):

1. No `TEST_DATABASE_URL` → `none`. **Done.**
2. Loopback host → `local`, no opt-in needed. **Done.**
3. Hosted URL, project on the allowlist, `ALLOW_LIVE_SUPABASE=1` → `hosted` with that project ID. **Done.**
4. Hosted URL, project not on the allowlist → throws. **Done.**
5. Hosted URL, project on both lists → throws. **Done.**
6. Hosted URL, no `ALLOW_LIVE_SUPABASE=1` → throws. **Done.**
7. Empty `PARMANA_TEST_PROJECT_REFS` with a hosted URL → throws. **Done.**
8. Malformed URL, or a hosted URL naming no project → throws, and the message does not contain the password. **Done.**

Setup and gate tests:

9. A `DATABASE_URL` set only in `.env` does not reach any test. **Not automated.** Checked by reading the setup file: it no
   longer loads `.env`. An automated check would need a child process that runs setup with a sentinel value in `.env`.
10. `ALLOW_LIVE_SUPABASE=1` with `TEST_DATABASE_URL` missing → the suite fails, not skips. **Existing behaviour, not
    re-tested.**
11. The run log names the project ID and does not print the password. **Partly.** Error messages are tested (test 8).
    The success log line is not tested.

End-to-end, by hand (runbook section 3a):

12. `.env.test` with the sandbox entry → the consumption suite passes, 4 of 4. **Done** on Windows, after PR #532 merged. The
    log showed `[test-database] hosted project <sandbox project ID>`.
13. `.env.test` with the production project ID in `TEST_DATABASE_URL` → the run refuses before any query. **Not run.**
    Test 5 covers the same rule in unit tests.

Full suite under Node 24 after PR #533: 364 files passed, 23 skipped; 3672 tests passed, 87 skipped.

## 6. Compatibility

- Developers who copied `.env.test.example` before PR #533 must replace their `.env.test`. The runbook gives the exact file
  contents.
- A hosted run needs `PARMANA_TEST_PROJECT_REFS` in `.env.test`. Without it, the run refuses.
- `PARMANA_TEST_DATABASE_URL` no longer works. Rename it to `TEST_DATABASE_URL`.
- Any CI job that sets `DATABASE_URL` for tests should set `TEST_DATABASE_URL` instead. **Not checked:** the CI workflow
  files have not been searched for this.
- Production runtime is unchanged. `Config` still reads `DATABASE_URL` for the running application.

## 7. Security notes

- Connection strings do not appear in logs, test names, or committed files. The helper's errors and log line show the
  project ID only.
- The production project ID is not committed. It is held in the developer's `.env.test` or shell.
- The allowlist is fail-closed. An empty or missing list refuses hosted targets.
- Hosted runs cannot drop tables: the migrations test runs only against a local target.
- This design does not replace database permissions. The sandbox should still use a role that cannot reach production data.
  That is a separate task, and it is not done.
- A hosted test run writes to the sandbox. Suites that write rows clean up after themselves, but this was not checked for
  every suite. The G-143 sandbox check found one test-mode decision left behind. Its source was not confirmed.

## 8. Open questions

1. **Should the production project ID appear in the repo, even as a hash?** Decided: no. It stays in the developer's
   environment and in CI secrets. Nothing in the repository contains it.
2. **Should CI run database suites against a database it provisions?** Open. Recommended for a later change, with a
   Docker service.
3. **Who may add a project to `PARMANA_TEST_PROJECT_REFS`?** Decided in principle: the owner, through a reviewed change to
   the template and the runbook. The rule is a process rule. The code does not enforce it.
4. **Should the Supabase dashboard label on the sandbox's `main` branch be changed?** Open. The label reads PRODUCTION. This
   is a dashboard setting, not a repository change.

## 9. Related item: signed commits

`main` requires signed commits, but every recent merge was unsigned (PRs #526 to #533). This is not a configuration
problem. It needs a branch-protection check, and a decision about whether to rewrite history. It is out of scope here, and
it is recorded in the handover.

## 10. Done when

- Tests 1 to 8 pass. **Yes.**
- Tests 9 to 11 pass, and test 13 has been run. **No.** Tests 9, 10 and 13 are open. Test 11 is partly done.
- No file read by tests contains a production connection string. **Not verified by search.**
- The runbook describes one procedure, and the handover links to it. **Yes.** The handover still lists the verifier and
  production items; see the handover for their state.
- The owner decisions in section 8 are recorded in this document. **Partly.** Items 1 and 3 are recorded. Items 2 and 4 are
  open.
