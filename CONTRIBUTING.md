# Contributing to Parmana

Thank you for helping. Parmana decides whether an automated action may run, and records the evidence for that decision. Correctness, determinism and verifiable evidence come before convenience, so every change is reviewed carefully. This guide takes you from a fresh clone to an accepted pull request.

## Before you start

- For anything larger than a small fix, open an issue or a discussion first, so the design is agreed before the code is written. Questions and feedback belong in [GitHub Discussions](https://github.com/pavancharak/parmana-core/discussions) or in an issue. For a private question about the project, write to developer@parmanasystems.com.
- Report security issues privately, as described in [SECURITY.md](SECURITY.md). Do not open a public issue for them.
- Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- The project is licensed under the Apache License 2.0 ([LICENSE](LICENSE)).

## Set up

1. Install **Node.js 24**. On Node 22 the build passes but tests fail: the `distrustCompromisedRoots` tests expect Node's bundled root certificates, and the `re2` native module built for Node 22 does not load under Node 24. If you switch Node versions after `npm ci`, run `npm rebuild re2`.
2. Run `npm ci`. Its `prepare` step points Git at the hooks in `scripts/git-hooks`.
   `npm test` and `npm run mutation` rebuild the workspace packages first with
   `npm run build:packages` (TypeScript project references, so packages build in dependency
   order). Tests import packages through `dist/`, so run `npm run build:packages` by hand after
   changing a package's source and before running a script that imports it directly.
3. Install [gitleaks](https://github.com/gitleaks/gitleaks#installing) or Docker. The pre-commit hook scans staged files for secrets with one of them, and refuses the commit if neither is available. Do not skip it with `--no-verify` unless you have reviewed the staged files yourself.
4. For the database tests, start the local Postgres service and apply the migrations:

   ```bash
   docker compose up -d postgres
   docker compose run --rm migrate
   ```

   [docs/internal/runbooks/LOCAL-DEVELOPMENT.md](docs/internal/runbooks/LOCAL-DEVELOPMENT.md) describes the environment in full. The database-backed suites skip unless `TEST_DATABASE_URL` and `ALLOW_LIVE_SUPABASE=1` are set.

   **Without Docker.** Use a local PostgreSQL 16 server on port 55432, the port in `.env.test.example`:

   ```bash
   # 1. Create a role and database (any superuser):
   psql -p 55432 -U postgres -c "CREATE ROLE parmana LOGIN SUPERUSER PASSWORD 'parmana-local';"
   psql -p 55432 -U postgres -c "CREATE DATABASE parmana OWNER parmana;"

   # 2. Create the Supabase roles, then apply each migration once, in filename order.
   #    This mirrors docker/local/migrate.sh, which records each file in parmana_schema_migrations.
   export PGHOST=127.0.0.1 PGPORT=55432 PGUSER=parmana PGDATABASE=parmana PGPASSWORD=parmana-local
   psql --set=ON_ERROR_STOP=1 --quiet --file=docker/local/postgres-roles.sql
   psql --set=ON_ERROR_STOP=1 --quiet --command="CREATE TABLE IF NOT EXISTS parmana_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
   for f in supabase/migrations/*.sql; do
     n=$(basename "$f")
     [ "$(printf "SELECT 1 FROM parmana_schema_migrations WHERE name = :'name';" | psql --tuples-only --no-align --set=ON_ERROR_STOP=1 --set=name="$n")" = "1" ] && continue
     printf "INSERT INTO parmana_schema_migrations (name) VALUES (:'name');" | psql --set=ON_ERROR_STOP=1 --single-transaction --quiet --set=name="$n" --file="$f" --file=-
   done

   # 3. Point the test settings at it. .env.test is gitignored.
   cp .env.test.example .env.test
   # then set DATABASE_URL=postgresql://parmana:parmana-local@127.0.0.1:55432/parmana

   # 4. Confirm the database is ready:
   node scripts/db-check.mjs
   ```

   **The test suites reset this database.** The full test run drops and recreates the schema, so the migrations table disappears. Re-run step 2 before you run `npm test` again or push. Do not point `DATABASE_URL` at a database you care about.

   **Pre-push runs the full preflight.** `git push` runs `scripts/db-check.mjs` and then `npm run preflight`, which covers typecheck, lint, format, every test file and the examples. It takes a few minutes. It can fail on the database if the schema was reset since the last run, so re-apply the migrations and push again.

5. Check the set-up with `npm run build` and `npm test`. The full suite takes several minutes.

## Finding work

- Issues labelled `good first issue` are the best place to start.
- Open work by area is listed in [docs/internal/REMAINING-WORK.md](docs/internal/REMAINING-WORK.md).
- Comment on the issue to say you are taking it, so two people do not work on the same change.

## Making a change

1. **Branch from an up-to-date `main`.** Name the branch for its purpose, for example `fix/policy-refusal-message`. Nothing is pushed to `main` directly.
2. **Add tests with the change.** A bug fix adds a test that fails without the fix. New behaviour gets tests, including the refusal paths.
3. **Run the full check.** The pre-commit hook runs gitleaks, typecheck, lint, format, every test, the build and the runnable examples. CI runs the same. If the hook reports stale build output, run `npm run build` and commit again.
4. **Commit with a sign-off and a GPG signature.** See [Commit requirements](#commit-requirements).
5. **Open a pull request** and fill in the template, which asks what changed and why.
6. **Review.** A second reviewer approves the pull request. Security-critical code gets an in-depth review; [docs/internal/contributing/REVIEWING.md](docs/internal/contributing/REVIEWING.md) is the reviewer's brief.

## Commit requirements

There are two separate requirements. Both are needed.

- **Sign-off (DCO).** Every commit carries a `Signed-off-by` line, certifying the [Developer Certificate of Origin](https://developercertificate.org). Add it with `git commit -s`.
- **GPG signature.** `main` accepts only signed commits. [docs/internal/runbooks/SIGNING-COMMITS.md](docs/internal/runbooks/SIGNING-COMMITS.md) explains how to set up a signing key.

A pull request whose commits lack either requirement is not merged until they are fixed.

## Records to update in the same pull request

- [docs/internal/CLAIMS.md](docs/internal/CLAIMS.md) when what Parmana can claim changes. A claim is written in the present tense only when code and tests back it.
- [docs/internal/VERIFICATION-GAPS.md](docs/internal/VERIFICATION-GAPS.md) when a gap is found or closed.
- [docs/internal/REMAINING-WORK.md](docs/internal/REMAINING-WORK.md) when open work changes.
- An ADR in [docs/internal/adr/](docs/internal/adr) when an architectural decision is made or reversed.
- The published docs in [docs/site/](docs/site) when behaviour a reader relies on changes, and the changelog ([docs/site/changelog.mdx](docs/site/changelog.mdx)).

## Principles a change must keep

- The policy decides. Nothing executes without an approved decision.
- Fail closed. Missing configuration, a failed check or an unavailable dependency refuses. It never degrades silently.
- Evidence is signed and append-only, and can be verified without trusting Parmana.
- Policy evaluation is deterministic.
- Text from requests, records, policies or connectors is shown as text. Do not assign it with `innerHTML`, `dangerouslySetInnerHTML`, `insertAdjacentHTML` or `document.write`. Use `textContent` or the framework's text binding. A test that renders a value containing markup should show it as literal text.

## Connectors

Read [docs/internal/architecture/CONNECTOR_ISOLATION.md](docs/internal/architecture/CONNECTOR_ISOLATION.md) and [docs/internal/connectors/BUILDING_A_CONNECTOR.md](docs/internal/connectors/BUILDING_A_CONNECTOR.md) before adding one. Every connector is registered through the standard path, so it gets credential isolation. A `legacyInsecure: true` registration outside a test is not acceptable.

## Maintainer guides

These cover work that most contributors will not need:

- [Python reference docs](docs/internal/contributing/python-reference-docs.md)
- [Dependency updates](docs/internal/contributing/dependency-updates.md)
- [TypeScript versions](docs/internal/contributing/typescript-versions.md)
- [Fuzz and mutation testing](docs/internal/contributing/fuzz-and-mutation-testing.md)
