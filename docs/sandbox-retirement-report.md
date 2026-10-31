# Parmana sandbox retirement: what we did, why, and how to troubleshoot it

Date range: 2026-10-23 to 2026-10-31. Repos: `parmana-core`, `parmana-connect`, `parmana-connectors`.

## 1. Why this work started

- The public sandbox at `parmana-sandbox.vercel.app` depended on a demo key published in the docs. A key shared publicly, on a host that also looked like production, was a risk.
- The docs described `parmana-api-real` as the sandbox, but that host is the Vercel production deployment of `main`.
- Parmana needed a safe place for visitors to try requests, and the connector needed a verified path to its own database.

## 2. What we did, in order

### parmana-connect

1. Added an HTTP transport to the MCP server (`npm run mcp:http`), so a remote agent such as a Managed Agents session could reach it.
2. Bearer-token auth, compared in constant time, with a 32-character minimum.
3. Pushed to `claude/wonderful-keller-hvmnz8` in parmana-connect.

### parmana-core

4. Retired the sandbox. Deleted `deploy/sandbox`, `examples/sandbox-playground`, the playground docs page, and four architecture tests that read the deleted folders.
5. Removed the published demo key from the OpenAPI spec, the gitleaks allowlist, and the docs.
6. Kept history records unchanged on purpose: `docs/CLAIMS.md`, `docs/VERIFICATION-GAPS.md`, the changelog, ADRs, `DECISIONS.md`, and old migrations. Rewriting them would have made past records false.
7. Merged as PR #248 (`28a5a9b`).
8. A follow-up PR #249 (`8709381`) corrected the docs: `parmana-api-real` is production, not a sandbox, and no public sandbox exists yet.
9. Added `PARMANA_DB_SCHEMA` (PR #250, `af79167`). When set, the database pool sets `search_path` to that schema. Unset keeps the default. All database access goes through one pool, so this covers every table.
10. Fixed a readiness bug (commit `19a9541`, branch `fix/ready-probe-schema`, PR opened, not yet merged at the time of writing). The readiness check hard-coded `public.execution_intents`, so it ignored `PARMANA_DB_SCHEMA`.

### parmana-connectors

11. Checked the references. The `parmana-sandbox` name in `SETUP.md` and `RUNBOOK.md` was a Supabase project, which turned out to be production's database. The warnings stayed.
12. Open: `RUNBOOK.md` Step 4 fetches the verification key from `parmana-api-real`. This needs production's URL before it changes.

### Supabase (shared database)

13. Decided to share the connectors' Supabase project with the sandbox, using a separate schema, `parmana_sandbox`, instead of paying for a second project. The free plan allows two active projects.
14. Created the schema with `CREATE SCHEMA IF NOT EXISTS parmana_sandbox;`, then ran the migration bundle with `SET search_path TO parmana_sandbox;` at the top. Verified three tables in the schema, and none in `public`.
15. Renamed the projects: the production database is now `parmana-production-db`, and the connectors project is `parmana-connectors and s…`.

### Vercel

16. The `parmana-sandbox` Vercel project already existed, with sandbox settings and keys. We reused it rather than creating a new project.
17. Set `PARMANA_DB_SCHEMA=parmana_sandbox` on it. Set `DATABASE_URL` for its production environment.
18. Deployed a fresh build of `main` with the Vercel CLI (`vercel link`, then `vercel deploy --prod`). Deleted the `.env.local` file that linking creates, since it holds secrets.

## 3. What went wrong, and why

### Incident A: production went down (about 17:40 on 31 Oct, IST)

- **What happened:** the Supabase database password was reset on `parmana-sandbox`. That project is production's database, not the sandbox. Production's `DATABASE_URL` in `parmana-api-real` then failed with `password authentication failed for user "postgres"`.
- **Why:** the project name suggested a sandbox, but it was production's database. A password reset there breaks production immediately.
- **Fix:** put the new password into production's `DATABASE_URL` in `parmana-api-real`, with the Transaction pooler string (port 6543), then redeployed. Production returned to 200.
- **Lesson:** never reset a password on a project without first listing every place that uses it.

### Incident B: the sandbox would not start

Four separate causes, each hidden behind the same `500 FUNCTION_INVOCATION_FAILED`:

1. **Deleted database.** `DATABASE_URL` pointed at a Supabase project removed on 23 October (`tenant/user postgres.bemukyaqfszmkoztugtv not found`).
2. **Wrong host.** The value resolved to host `base` (`getaddrinfo ENOTFOUND base`). The pasted value was malformed.
3. **Production's database.** The value pointed at `ltjadvsjlpcygborxzet`, which is production's project, and it began with the literal text `DATABASE_URL=`.
4. **Wrong password** for the connectors project (`password authentication failed for user "postgres"`).
5. **Readiness hard-coded the schema.** `/ready` asked for `public.execution_intents`, so it reported the table missing even though it existed in `parmana_sandbox`.

### Incident C: a stale deployment

- The "Redeploy" button rebuilds an old deployment's code. Vercel's list showed "Redeploy of 44oYJi6NF", which predated the schema setting. Only a fresh deploy from `main` picked up the new code.

### Incident D: commit and push problems

- **Preflight failures:** the pre-commit check runs the full test suite against the database named in the local `.env`. Two things failed: a test that didn't clear `PARMANA_DB_SCHEMA` from the environment, and integration tests against a database without the core tables. The second needs the `.env` host checked, because those tests write and delete rows.
- **Placeholder paths:** commands with `<download path>` or `C:\path\to\` were run literally. Always replace placeholders with the real path.
- **Typo in branch name:** `…hvmnz8m` and `…settingclear` were typed, so the push failed. Check the branch name with `git branch --show-current` before pushing.
- **Unintended push:** a `git push` ran after a blocked commit and pushed `main`'s commit to a new branch. It caused no damage, but it was unintended.

### Incident E: local repo mistakes (ours)

- `git checkout origin/main -- .` would have overwritten the working tree. It was denied by the safety check, and it should never have been proposed.
- `git reset --mixed` and `git stash` were used on the container copy. They were safe because the content was on the remote first, but check that before you use them.

## 4. What we learned

1. **Names lie.** A Supabase project called `parmana-sandbox` was production. Check the project ID (`ltjadvsjlpcygborxzet` here), not the name.
2. **Environment changes need a new deploy.** Vercel applies changed variables on the next deployment, and "Redeploy" reuses old code.
3. **Read the cause line, not the summary.** The top line of every error here said "could not run". The `[cause]` line held the real problem: `ENOTFOUND base`, `password authentication failed`, `relation does not exist`.
4. **Shape of a connection string matters.** The part after `@` is the host. `DATABASE_URL=` is the variable name, not part of the value. Pooler type matters too: transaction (6543) for serverless production, session (5432) when `search_path` is needed.
5. **Hard-coded schema names defeat schema isolation.** One readiness query did this. Search the code for `public.` before claiming a schema setting covers everything.
6. **Shared databases need explicit boundaries.** A separate schema is a reasonable boundary, but verify that every migration, probe and cleanup job uses it.
7. **Don't reset shared credentials.** A reset affects every system that uses the password.
8. **Check before you run.** Confirm the file, branch, path and target database before each step. Most of the friction here came from placeholders, mistyped names and wrong targets.

## 5. Troubleshooting guide

| Symptom                                              | Likely cause                                          | How to check                                                     | Fix                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/ready` `500 FUNCTION_INVOCATION_FAILED`            | The app crashed during startup                        | Vercel Runtime Logs, filter Error, read the first `[cause]` line | Use the cause line to pick a row below                                                |
| `tenant/user postgres.<ref> not found`               | `DATABASE_URL` points at a deleted Supabase project   | Read the project ID in the string                                | Replace with the current project's Session pooler string                              |
| `getaddrinfo ENOTFOUND <word>`                       | The host in `DATABASE_URL` is malformed               | Read the part after `@`                                          | Re-copy the string from Supabase Connect                                              |
| `password authentication failed for user "postgres"` | Password doesn't match that project                   | Compare with the project's password                              | Use the correct project's password. Don't reset it unless every user of it is updated |
| `relation "x" does not exist`                        | Tables are missing, or the wrong schema is being read | Query `information_schema.tables` for the schema                 | Re-run the migrations into the schema, or fix the code's schema reference             |
| `execution_intents table does not exist` on `/ready` | Readiness hard-codes `public.`                        | `git grep "public\."` in `packages/*/src`                        | Use unqualified names (fixed in `19a9541`)                                            |
| Production `/ready` `500` after a password change    | Production's `DATABASE_URL` has the old password      | Check `parmana-api-real` environment variables                   | Update `DATABASE_URL` for Production, then redeploy                                   |
| Changed variable has no effect                       | No new deployment after the change                    | Deployments tab, check the newest deployment date                | Deploy fresh from `main`, not Redeploy                                                |
| Pre-commit `gitleaks` missing                        | Not installed on this machine                         | `gitleaks version`                                               | Install it. Don't use `--no-verify`                                                   |
| Pre-commit tests fail on `relation does not exist`   | Local `.env` points at a database without core tables | Check the host in `.env`                                         | Point local tests at a safe database                                                  |
| `ruff` E501 line too long                            | A line over 88 characters                             | `ruff check <file>`                                              | Split the line                                                                        |
| `src refspec … does not match`                       | Typo in the branch name                               | `git branch --show-current`                                      | Retype the exact name                                                                 |
| `can't open patch`                                   | Placeholder path left in the command                  | Find the file with `Get-ChildItem`                               | Use the full path                                                                     |

## 6. Open items

1. **Production URL.** Needed before `parmana-connectors/RUNBOOK.md` Step 4 can change.
2. **Sandbox deploy.** Merge the readiness fix (`fix/ready-probe-schema`), then deploy `main` fresh to `parmana-sandbox`, and check `/ready`, `/health` and `/keys/default`.
3. **Sandbox setup docs.** The docs still say a public sandbox exists in several places. The sample transaction notes and sandbox-mode error messages describe code behaviour and were left as they are.
4. **Integration tests.** Confirm which database the local `.env` uses before running them, and point them at a safe database.
5. **Supabase renames.** Check every stored connection string still points at the right project after the renames.
