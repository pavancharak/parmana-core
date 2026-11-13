# Fault injection tests (HTTP boundary)

The file `packages/api/tests/integration/fault-injection.integration.test.ts` runs the real
Runtime, with in-memory repositories, and makes one piece of infrastructure fail on purpose. It
then checks what the caller and the connector can observe.

It is not a test of a deployed system. It does not stop a database, a signing service or a network
link in a running environment. Those tests are not written yet (see [Not covered](#not-covered)).

## What is injected

| Fault                                      | How it is injected                                           | Expected behaviour                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Business transaction store fails on create | `SwitchableTransactions.failing = true`                      | Not a success response. Connector not called. No Trust Record. The store's message does not reach the caller. |
| Transaction store recovers                 | Flag cleared, same transaction retried                       | Released exactly once. A further retry does not release it again.                                             |
| Execution intent store fails on create     | `SwitchableIntents.failing = true`                           | `503 EXECUTION_INTENT_UNAVAILABLE`. Connector not called.                                                     |
| Signing readiness probe fails              | `CachedSigningReadiness` with a failing probe and a zero TTL | `503 SIGNING_UNAVAILABLE`. Connector not called.                                                              |
| Signing refused, then retried              | Same transaction id retried after the probe recovers         | `409` (duplicate). Connector still not called. A new id releases once.                                        |

The zero TTL on the readiness probe means every request probes again, so recovery is seen at once.
The production class is used, not a stub.

## Known gap

`SigningUnavailableError` (`packages/runtime/src/errors/SigningUnavailableError.ts`) appends the
cause's message to the response: `... Cause: <message>`. Internal error text therefore reaches the
caller. The test for this is marked `it.fails`, so it passes while the gap exists. When the
response stops carrying the cause, the test fails and `.fails` must be removed.

## Design notes

- **A refused transaction id is recorded.** The business transaction is stored before the signing
  check, so a retry with the same id is a duplicate (`409`). The error message tells the caller to
  use a new id, and the test checks that. Nothing runs twice, but a client must generate a new id
  after any pre-release refusal.
- **The failure is before release.** Each test checks that the connector is never called. Failures
  after release (a Trust Record that cannot be stored, a status update that is lost) are covered
  by `execution-intents.integration.test.ts` and the runtime unit tests.

## Running it

Node 24 is required (the signing setup uses `ml-dsa-65`). Build the workspace packages first, since
the tests import built `dist/` output:

```bash
npm run build
npx vitest run packages/api/tests/integration/fault-injection.integration.test.ts
```

Expected result: 5 passed, 1 expected failure (the known gap above).

## Local deployment drill (database outage)

The suite above uses in-memory stores. A separate drill runs the real server (`packages/api/src/server.ts`) against a local Postgres 16 with the repository's 51 migrations applied, then stops the database while the server is up. It was run once, on the commit that adds the pool listener (see below). It is a manual drill, not a CI test.

Setup used: `PARMANA_STORAGE=postgres`, a local database on port 55432, generated `default` and `gateway` keys, one API key, policies seeded with `docker/local/seed-policies.mjs`. Two drill-only switches were set: `NODE_ENV=development`, `PARMANA_ALLOW_UNGOVERNED_POLICY=true`, and the two checks `EXECUTION_INTENTS_CHECK` and `SIGNING_READINESS_CHECK`. These skip the human-approval signal and the policy governance records, so a fully approved execution was not reached. The drill tests the database path, not the approval path.

| Step                         | Result                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before the outage            | `/health` 200, `/ready` 200                                                                                                                         |
| Database stopped (immediate) | The server process stays up. `/health` returns 500 (see finding 2). `/ready` returns 500. `/execute` returns a generic 500 with no internal detail. |
| Database started again       | `/health` 200 and `/ready` 200 again. `/execute` returns the same policy response as before the outage (403, approval signal missing).              |

Findings:

1. **Fixed: a dropped connection killed the process.** `PostgresPoolFactory` created the pool with no `error` listener. When an idle connection dropped, Node treated the pool's `error` event as unhandled and the process exited. The pool now logs `postgres_pool_idle_client_error` (without the connection string). Regression test: `packages/storage/tests/unit/postgres-pool-error.test.ts`. It fails without the listener and passes with it.
2. **Open: `/health` depends on the database.** The health and ready routes sit behind a rate limiter whose store is Postgres (`PostgresRateLimitStore`). With the database down, that limiter throws, so `/health` returns 500. The README says `/health` only shows that the process is running. A liveness probe on `/health` would therefore mark the process unhealthy during a database outage, and an orchestrator could restart it. Possible fixes are a memory store for the health limiter, or skipping the limiter on `/health`. Either changes a rate-limit decision, so it is not made here.

## Not covered

- Network failure between the API and the database. The drill stopped the database, not the network path.
- Signing-service and key-store (KMS) failures in a deployed instance.
- A full approved execution through the live server. It needs the human-approval signal and the policy governance records set up.
- Load under failure. See the load-testing item in `docs/internal/VERIFICATION-GAPS.md`.
