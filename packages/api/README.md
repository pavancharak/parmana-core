# @parmana/api

The HTTP surface over the canonical Execution Trust runtime (`@parmana/runtime`):
`POST /execute`, verification, receipts, replay, the transaction and trust record
reads, policy governance (`/policies/.../pending-changes`), public keys and
more. The full, current list is `openapi/openapi.yaml` at the repository root;
routes live in `src/routes/`.

## Running the test suite

Most of this package's tests are hermetic and require no environment setup.

### Database-backed integration tests

Some integration tests run against a live PostgreSQL database, built from `supabase/migrations/`,
rather than the in-memory provider. They cannot run from a bare clone, and they are skipped
automatically, with a logged reason, when the database is not configured.

To run them, set both of these:

- `TEST_DATABASE_URL`, a PostgreSQL connection string for a **test** database
- `ALLOW_LIVE_SUPABASE=1`, the explicit opt-in for writes to a live database

A local PostgreSQL 16 database works. Apply the migrations first, for example with
`npm run db:migrate -- apply` with `DATABASE_URL` pointing at it. Setting `TEST_DATABASE_URL`
without `ALLOW_LIVE_SUPABASE=1` skips these suites with a logged reason. Setting
`ALLOW_LIVE_SUPABASE=1` without a visible `TEST_DATABASE_URL` is a hard failure, not a skip.

The shared gate is `tests/helpers/database-availability.ts` (`resolveDatabaseGate`). It is used by
these suites, among others:

- `tests/integration/evidence-append-only.integration.test.ts` (the database rejects updates, deletes and truncates on evidence tables)
- `tests/integration/postgres-caller-audit-sink.integration.test.ts`
- `tests/integration/postgres-execution-audit-sink.integration.test.ts`
- `tests/integration/replay.integration.test.ts`

The older `SUPABASE_*` gate in `tests/helpers/supabase-availability.ts` is no longer used by any suite.
It is kept only with its own unit test, and can be removed.

The sibling `@parmana/storage` package uses the same database gate for its live suites, under
`packages/storage/tests/integration/`.

### HubSpot live integration test

`tests/integration/hubspot-live.integration.test.ts` drives the HubSpot
connector through a real `POST /execute` against HubSpot's real API — it
cannot run from a bare clone with no credentials, and is skipped
automatically — with a logged reason — when the required environment
variables are absent. See that file and `tests/helpers/hubspot-live-availability.ts`
for the exact gates (`ALLOW_LIVE_HUBSPOT`, `TEST_HUBSPOT_PRIVATE_APP_TOKEN`,
`TEST_HUBSPOT_DEAL_ID`).

### GitHub live integration test

`tests/integration/github-pr-merge-live.integration.test.ts` merges a real pull
request through `POST /execute`. It is skipped unless `ALLOW_LIVE_GITHUB=1` and
`TEST_GITHUB_APP_ID`, `TEST_GITHUB_INSTALLATION_ID` and
`TEST_GITHUB_APP_PRIVATE_KEY` are all set; see
`tests/helpers/github-live-availability.ts`.

### Policy directory

Any test that drives a real execution through this package's `application`
singleton (`src/application.ts`) needs `PARMANA_POLICY_DIR` pointing at a
directory of policies (for example `./policies`). Without it the configuration
refuses to load with "PARMANA_POLICY_DIR is not set" (see
`packages/shared/src/config/Config.ts`), rather than failing later inside
`FilePolicyRepository.load()`.
