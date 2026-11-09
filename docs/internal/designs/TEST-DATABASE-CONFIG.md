# Design: test database configuration

Status: **proposed, for decision.** No code is written. This document records the problem, what the code does today,
the proposed fix, the open questions, and the tests required before the fix is merged.

Related: `docs/internal/runbooks/INTEGRATION-TESTS.md`, section 3a; `docs/internal/handovers/G-143-sandbox-2026-11.md`;
PR #526 (sandbox test setup) and PR #529 (handover status).

Project IDs are written as placeholders in this document: `<production project ID>` and `<sandbox project ID>`. The real
values are in the Supabase dashboard, not in the repository.

---

## 1. Problem

Test suites that talk to a real Postgres database read their connection string from configuration files and the shell.
The same file, `.env`, holds the production connection string. Several things can go wrong, and several did:

1. **Production values in a file tests read.** `vitest.setup.ts` loads `.env` (after `.env.test`). A test run that
   reaches a database-gated suite therefore sees the production `DATABASE_URL` whenever `.env.test` does not override it.
2. **Two different variable names for the same thing.** Most suites read `DATABASE_URL`. The consumption suite reads
   `TEST_DATABASE_URL`. A third name, `PARMANA_TEST_DATABASE_URL`, appears in `packages/shared/src/config/Doctor.ts`.
3. **A template that is wrong for a second target.** `.env.test.example` points at a local Docker database. Copying it
   and changing only the URL leaves an uncommented or missing opt-in flag, or a duplicate `DATABASE_URL` line. Dotenv
   uses the first occurrence, so the tests quietly ran against the wrong database, or skipped.
4. **Silent skips.** A suite that is skipped because its opt-in is missing reports success. The developer sees
   "passed" for a run that exercised nothing.
5. **No visible target.** Nothing prints which database a live run will use before it writes to it.
6. **A `TEST_DATABASE_URL` line in `.env`** made a refusal guard fire, because the same value had been copied into the
   wrong file.

Each of these happened during the G-143 sandbox work (PR #526 and the run that followed). None was caused by a code
defect. All came from how configuration was split across files.

## 2. Current state, from the code

Checked on `main` at `ceeaada`:

- `vitest.setup.ts` calls `dotenv.config` for `.env.test` first, then for `.env`, both with `override: false`. A value
  set by the shell or `.env.test` therefore wins over `.env`. The file's comment says tests never read `.env` for
  database values, but the code loads `.env` anyway, so the protection depends on `.env.test` overriding every
  database variable.
- `packages/storage/tests/helpers/database-availability.ts` (`resolveDatabaseGate`) reads `DATABASE_URL` and
  `ALLOW_LIVE_SUPABASE`. It throws if the opt-in is set and `DATABASE_URL` is missing. It skips with a message if the
  URL is set but the opt-in is not.
- `packages/storage/tests/integration/supabase-inbound-check-consumption.integration.test.ts` reads `TEST_DATABASE_URL`.
  Since PR #526 it falls back to `DATABASE_URL` when `ALLOW_LIVE_SUPABASE=1`, and it refuses to run when
  `TEST_DATABASE_URL` equals `DATABASE_URL`.
- `packages/shared/src/config/Doctor.ts` lists `PARMANA_TEST_DATABASE_URL` as a known variable. No suite reads it.
- `.env.test.example` sets `DATABASE_URL` to the local Docker database, sets `ALLOW_LIVE_SUPABASE=1`, and sets
  `PARMANA_DATABASE_CA_FILE` to empty.
- `.gitignore` ignores `.env`, `.env.*` and `.env*`, and allows `.env.example` and `.env.test.example`.
- No code checks which project a `DATABASE_URL` points at. The only protection is the opt-in flag.

## 3. Decisions proposed

| #   | Decision                                                                                                                                                                                                      | Why                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| D1  | **Tests read one variable: `TEST_DATABASE_URL`.** No suite reads `DATABASE_URL` for tests.                                                                                                                    | One name, one meaning. Removes the fallback from PR #526.      |
| D2  | **`.env` never supplies a test database URL.** `vitest.setup.ts` loads `.env.test` only, for test settings. It does not load `.env` at all.                                                                   | Production values cannot reach a test run by file precedence.  |
| D3  | **A project allowlist, not a denylist.** `TEST_DATABASE_URL` must point at a project named in `PARMANA_TEST_PROJECT_REFS` (a comma-separated list of project IDs, in `.env.test`). Otherwise the run refuses. | A denylist misses the next project. An allowlist fails closed. |
| D4  | **Refuse the production project outright**, even if it is on the allowlist, when `PARMANA_PRODUCTION_PROJECT_REFS` contains it. The production ID lives in the developer's environment, not in the repo.      | Defence in depth if an allowlist is edited by mistake.         |
| D5  | **Print the target before any live run.** The setup logs the project ID and the host (no password, no user name) once per run, and `ALLOW_LIVE_SUPABASE=1` must be set for any hosted target.                 | Makes the target visible before anything is written.           |
| D6  | **Local Docker stays the default.** With no `TEST_DATABASE_URL`, database suites skip, with one visible summary line, not silently.                                                                           | Clones work without a database, and skips are visible.         |
| D7  | **Suites that need a database fail when the opt-in is set but the URL is missing.** This is the existing rule in `resolveDatabaseGate`, extended to every database suite.                                     | No "passed" for a suite that did not run.                      |
| D8  | **One template, `.env.test.example`,** with placeholders for `TEST_DATABASE_URL` and `PARMANA_TEST_PROJECT_REFS`, and the local Docker value as a commented alternative.                                      | A single file to copy, and the flag is explicit.               |
| D9  | **Remove `PARMANA_TEST_DATABASE_URL` from `Doctor.ts`** if D1 is accepted, or document it as the same variable.                                                                                               | Two names for one value caused confusion.                      |

## 4. Implementation steps

1. Add a shared helper, `resolveTestDatabase()`, in `packages/shared` or a test-only helper package. It reads
   `TEST_DATABASE_URL`, `PARMANA_TEST_PROJECT_REFS`, `PARMANA_PRODUCTION_PROJECT_REFS` and `ALLOW_LIVE_SUPABASE`, and
   returns one of: `{ kind: "none" }`, `{ kind: "local", url }`, or `{ kind: "hosted", url, projectRef }`. It throws for
   any hosted URL that fails D3 or D4, and for a hosted URL without `ALLOW_LIVE_SUPABASE=1`.
2. Change `vitest.setup.ts`: load `.env.test` only. Remove the `.env` load for test runs. Keep the `.env` load for the
   application's own `Config` path, which does not run under vitest. Log one line with the result of
   `resolveTestDatabase()` (kind and project ID, never the URL with credentials).
3. Change `resolveDatabaseGate` to use `TEST_DATABASE_URL` through the helper.
4. Change the consumption suite to use the helper. Remove the `DATABASE_URL` fallback and the equality check, which are
   no longer needed.
5. Change every other database-gated suite that reads `DATABASE_URL` for tests to read the helper's URL. List them
   first with a search for `DATABASE_URL` under `packages/*/tests`. Do not change production code that reads
   `DATABASE_URL` at runtime.
6. Replace `.env.test.example` with the template in D8. Keep the local Docker instructions in the runbook.
7. Update `docs/internal/runbooks/INTEGRATION-TESTS.md`, section 2 (the gates table) and section 3a.
8. Remove or document `PARMANA_TEST_DATABASE_URL` (D9).
9. Regenerate anything that depends on the changed docs (`llms-full.txt` if the runbook is included, the prettier
   check).

## 5. Tests required before merge

Unit tests for `resolveTestDatabase()`:

1. No `TEST_DATABASE_URL` → `none`.
2. Local URL (`127.0.0.1` or `localhost`) → `local`, no opt-in needed.
3. Hosted URL, project on the allowlist, `ALLOW_LIVE_SUPABASE=1` → `hosted` with that project ID.
4. Hosted URL, project not on the allowlist → throws.
5. Hosted URL, project on the allowlist and in the production list → throws.
6. Hosted URL, no `ALLOW_LIVE_SUPABASE=1` → throws.
7. An empty `PARMANA_TEST_PROJECT_REFS` with a hosted URL → throws (fail closed).
8. Malformed URL → throws, and the message does not contain the password.

Setup and gate tests:

9. A `DATABASE_URL` set only in `.env` does not reach any test (the setup does not load `.env`).
10. `ALLOW_LIVE_SUPABASE=1` with `TEST_DATABASE_URL` missing → the database suite fails, not skips.
11. The run log names the project ID and does not print the password.

End-to-end, once, by hand (documented in the runbook):

12. `.env.test` with the sandbox entry → the consumption suite passes, 4 of 4.
13. `.env.test` with the production project ID in `TEST_DATABASE_URL` → the run refuses before any query.

## 6. Compatibility

- Developers who copied `.env.test.example` before this change must replace their `.env.test`. The runbook gives the
  exact file contents.
- Any CI job that sets `DATABASE_URL` for tests must switch to `TEST_DATABASE_URL`. The CI workflow files should be
  searched for `DATABASE_URL` before merge.
- Production runtime is unchanged. `Config` still reads `DATABASE_URL` for the running application.

## 7. Security notes

- Connection strings never appear in logs, test names, or committed files. The helper logs the project ID only.
- The production project ID is not committed. It is held in the developer's `.env.test` or shell, the same as the
  connection string.
- The allowlist is fail-closed. An empty or missing list refuses hosted targets.
- This design does not replace database permissions. The sandbox database should still use a role that cannot reach
  production data, and that is a separate task.

## 8. Open questions

1. **Should the production project ID be in the repo at all, even as a hash?** Recommended: no. Keep it in the
   developer's environment and in CI secrets.
2. **Should CI run database suites against a database it provisions**, instead of any shared hosted project? Recommended:
   yes, in a later change, with a Docker service.
3. **Who may add a project to `PARMANA_TEST_PROJECT_REFS`?** Recommended: the owner, through a reviewed change to
   the template and the runbook.
4. **Should the Supabase dashboard label on the sandbox's `main` branch be changed?** The label reads PRODUCTION. This
   is a dashboard setting, not a repository change.

## 9. Related item: signed commits

`main` requires signed commits, but every recent merge was unsigned (PRs #526 to #530). This is not a configuration
problem. It needs a branch-protection check, and a decision about whether to rewrite history. It is out of scope here,
and it is recorded in the handover.

## 10. Order of work

1. Owner decisions on section 8.
2. Helper and unit tests (steps 1, tests 1–8).
3. Setup and gate changes (steps 2–4, tests 9–11).
4. Suite migration (step 5).
5. Template and runbook (steps 6–8).
6. End-to-end checks (tests 12–13), recorded in the runbook.

## 11. Done when

- Tests 1 to 13 pass.
- No file read by tests contains a production connection string, checked by search.
- The runbook describes one procedure, and the handover links to it.
- The owner decisions in section 8 are recorded in this document.
