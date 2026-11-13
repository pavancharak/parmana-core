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

## Local deployment drill

The suite above uses in-memory stores. A separate drill runs the real server (`packages/api/src/server.ts`) against a local Postgres 16 with the repository's 51 migrations applied, and injects faults into the running process. It was run by hand, not in CI.

Setup used: `PARMANA_STORAGE=postgres`, `NODE_ENV=development`, a local database on port 55432, generated `default` and `gateway` keys, one API key, policies seeded with `docker/local/seed-policies.mjs`, and a TCP proxy on port 55433 between the API and the database so the network can be cut without stopping the database. Two drill-only switches were set: `PARMANA_ALLOW_UNGOVERNED_POLICY=true` (no policy governance records) and the checks `EXECUTION_INTENTS_CHECK` and `SIGNING_READINESS_CHECK`.

**Important: `NODE_ENV=test` forces in-memory storage** (`packages/storage/src/StorageFactory.ts`). A run with `NODE_ENV=test` does not test Postgres at all. The first network-cut attempt was run that way and was discarded for that reason.

### Results

| Fault                                      | Injected by                           | Observed                                                                                                                                                                                                                      | Result                                                                   |
| ------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Database stopped                           | `pg_ctl -m immediate stop`            | Process stays up. `/health` 500, `/ready` 500, `/execute` 500 with a generic body. Recovers when the database returns: `/health` and `/ready` 200, `/execute` returns its normal domain response.                             | Process fix works (finding 1). Health finding open (finding 2).          |
| Network cut between API and database       | Proxy refuses and drops connections   | Same as above: process up, `/health` and `/ready` 500, `/execute` generic 500. No row written during the cut. After the cut is healed, all endpoints recover, and the next request is written (row count went from 30 to 31). | Same as above. No success response during the cut.                       |
| Signing key file missing at startup        | Key file moved away before start      | The server refuses to start, names the missing key, and exits with code 1. Nothing listens on the port.                                                                                                                       | Fails closed.                                                            |
| Approved execution through the live server | Local test approver (`NODE_ENV=test`) | HTTP 200 with a signed trust record. Run in memory mode only, because `NODE_ENV=test` is required for the local approver.                                                                                                     | Approval path works end to end in memory mode. Not run against Postgres. |

Findings:

1. **Fixed: a dropped connection killed the process.** `PostgresPoolFactory` created the pool with no `error` listener. When an idle connection dropped, Node treated the pool's `error` event as unhandled and the process exited. The pool now logs `postgres_pool_idle_client_error` (without the connection string). Regression test: `packages/storage/tests/unit/postgres-pool-error.test.ts`. It fails without the listener and passes with it.
2. **Open: `/health` and `/ready` depend on the database.** Both sit behind a rate limiter whose store is Postgres (`PostgresRateLimitStore`). With the database down or unreachable, they return 500. The README says `/health` only shows that the process is running. A liveness probe on `/health` would mark the process unhealthy during an outage, and an orchestrator could restart it. Possible fixes are a memory store for the health limiter, or skipping the limiter on `/health`. Either changes a rate-limit decision, so it is not made here.
3. **Open: an approved execution cannot reach the Postgres path in the drill.** The server trusts approvers from code, from the `approval_issuers` table (added through two-person maker-checker), or from the local test approver, which exists only when `NODE_ENV=test` and that mode forces memory storage. A trusted approver for a Postgres drill needs a decision by the project owner. A row inserted by hand would need a fake governance change record, and that would defeat the control this drill is meant to exercise.

## Not covered

- Signing and key-store failures while the server is running. The signing gate sits behind the human-approval check, which needs finding 3 to be resolved. The readiness route does not probe signing.
- KMS or other remote key-store outages. No AWS account is available to the drill.
- Approved execution against Postgres (finding 3).
- CI. The drill is manual. Running it in CI would need a Postgres service, the proxy, and an approver key that is not a production key.
- Load under failure. See the load-testing item in `docs/internal/VERIFICATION-GAPS.md`.
