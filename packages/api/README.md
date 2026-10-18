# @parmana/api

The HTTP surface over the canonical Execution Trust runtime (`@parmana/runtime`):
`POST /execute`, verification, receipts, replay, the transaction and trust record
reads, policy governance (`/policies/.../pending-changes`), public keys and
more. The full, current list is `openapi/openapi.yaml` at the repository root;
routes live in `src/routes/`.

## Running the test suite

Most of this package's tests are hermetic and require no environment setup.

### Supabase-backed integration tests

A subset of integration tests exercise the real Supabase-backed storage
provider (`SupabaseStorageProvider`) against a live Supabase project, rather
than the in-memory provider. These tests cannot run from a bare clone with no
credentials, and are skipped automatically — with a logged reason — when the
required environment variables are absent:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`)

Setting these alone is not enough to run these tests: since the G-3 fix
(docs/VERIFICATION-GAPS.md), a suite that detects `SUPABASE_*` configured
without `ALLOW_LIVE_SUPABASE=1` also set does not run against the live
project — it skips cleanly instead, logging why. (Earlier, this was a hard
failure instead of a skip; G-15 changed that so a default `npm test` on a
machine with live credentials configured — the common daily-development
case — stays green without anyone needing to touch `.env`. Explicitly
requesting a live run with `ALLOW_LIVE_SUPABASE=1` but no visible
credentials is still a hard failure, not a skip — see G-14.) Set both
`SUPABASE_*` and `ALLOW_LIVE_SUPABASE=1` to actually run these tests:

- `tests/unit/transactions-api.test.ts` (persistence cases only — most of
  this file is hermetic)
- `tests/integration/verification-negative.integration.test.ts`
- `tests/integration/trust-record-get.integration.test.ts`
- `tests/integration/trust-record-lifecycle.integration.test.ts`
- `tests/integration/workflow-negative.integration.test.ts`
- `tests/integration/workflow-supabase.integration.test.ts`
- `tests/integration/receipt-negative.integration.test.ts`
- `tests/integration/receipt-signature.integration.test.ts`
- `tests/integration/replay.integration.test.ts`
- `tests/integration/supabase-caller-audit-sink.integration.test.ts` (added
  when the durable `SupabaseCallerAuditSink` closed G-13)

The skip check lives in `tests/helpers/supabase-availability.ts`.

The sibling `@parmana/storage` package has its own Supabase-gated suites,
routed through the same `resolveSupabaseGate` mechanism (its own copy of the
helper, kept independent by design — see that file's comment) and the same
`ALLOW_LIVE_SUPABASE=1` requirement:
`packages/storage/tests/integration/supabase-execution-trust-record-ordering.integration.test.ts`,
`supabase-nonce-store.integration.test.ts` (G-13), and
`supabase-business-transaction-duplicate.integration.test.ts` (G-1).

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
