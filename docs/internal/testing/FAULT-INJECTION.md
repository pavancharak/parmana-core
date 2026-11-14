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

## Deployment drill

The suite above uses in-memory stores. The deployment drill runs the real server (`packages/api/src/server.ts`) against a real Postgres 16, with the repository's migrations applied, and injects faults into it. It runs in CI as `.github/workflows/outage-drill.yml`, and locally with:

```bash
npm ci && npm run build
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres bash scripts/drills/outage-drill.sh
```

The script (`scripts/drills/outage-drill.sh`) does the following:

1. Applies the migrations and seeds the policies.
2. Starts a TCP proxy (`scripts/drills/tcp-proxy.mjs`) between the API and the database.
3. Checks a baseline: an unapproved transaction is refused with `403 POLICY_DENIED`.
4. **Network cut.** Cuts the proxy. The process must stay up. `/health` must return 200. `/execute` must return a 5xx, not a success or a domain decision. Then it heals the proxy and checks recovery.
5. **Missing signing key.** Moves the `default` key away and starts the server. It must exit with code 1, name the missing key, and not listen on the port.

Scope: refusal and outage paths only. An approved execution needs a trusted approver. Neither the drill nor CI sets one up.

**Drill-only settings.** The server runs with `NODE_ENV=development`, and no policy governance records (`PARMANA_ALLOW_UNGOVERNED_POLICY` was removed in D19, so this drill must now seed real approvals before it runs; not yet done), and the checks `EXECUTION_INTENTS_CHECK` and `SIGNING_READINESS_CHECK` on. **`NODE_ENV=test` forces in-memory storage** (`packages/storage/src/StorageFactory.ts`), so the drill must not use it.

### Results (local run, before and after the fix)

| Fault                                      | Before the fix                                | After the fix                                                                                                             |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Database stopped                           | Process exits.                                | Process stays up. `/health` 200 (after finding 2), `/ready` 503, `/execute` 500 with a generic body. Recovers on restart. |
| Network cut between API and database       | Process exits (the same defect as finding 1). | Process stays up. `/health` 200, `/ready` 503, `/execute` 500. No row written during the cut. Recovers after heal.        |
| Signing key missing at startup             | Refuses to start, exit code 1.                | Same.                                                                                                                     |
| Approved execution through the live server | Works in memory mode only (`NODE_ENV=test`).  | Not changed. Not run against Postgres.                                                                                    |

### Findings

1. **Fixed: a dropped connection killed the process.** `PostgresPoolFactory` created the pool with no `error` listener. When an idle connection dropped, Node treated the pool's `error` event as unhandled and the process exited. The pool now logs `postgres_pool_idle_client_error` (without the connection string). Regression test: `packages/storage/tests/unit/postgres-pool-error.test.ts`. It fails without the listener and passes with it.
2. **Fixed: `/health` depended on the database.** The health and ready limiter was backed by Postgres, so `/health` returned 500 during an outage, and a liveness probe would have restarted a healthy process. The health limiter is now in-process (`packages/api/src/server.ts`). `/health` stays 200 during an outage. `/ready` still returns 503 while the database is unreachable, which is the correct readiness answer.

## Open

- **Approved execution against Postgres.** The server trusts approvers from code, from the `approval_issuers` table (added through two-person maker-checker), or from the local test approver. The local test approver exists only when `NODE_ENV=test`, which forces memory storage. A real maker-checker drill approver needs two people and signed approvals. A row inserted by hand would need a fake governance change record, which would defeat the control the drill tests. **Decision needed from the project owner.**
- **Signing faults while running.** The signing gate sits behind the human-approval check, so it cannot be reached without an approved execution (see above). The readiness route does not probe signing.
- **Real AWS KMS.** Not tested. See the KMS record below.
- **Load under failure.** See the load-testing item in `docs/internal/VERIFICATION-GAPS.md`.

## Status record

This section records what was run, what passed, what failed, and what is still open. Each entry says when it was done and on which commit.

### CI: outage drill (`.github/workflows/outage-drill.yml`)

| Run | Commit    | Result            | Detail                                                                                                                                                         |
| --- | --------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `5d0c30a` | Failed at Fault 1 | `DRILL FAILED: process exited during the cut`. The baseline 403 passed first. The script did not print the server log, so the cause is not known.              |
| 2   | `e06538f` | Passed            | All steps passed: baseline 403, `/health` 200 during the cut, `/execute` 500 during the cut, recovery 403, missing signing key exit 1, unreachable KMS exit 1. |

The two runs used the same drill logic. Run 2 also included the change that prints the last 120 lines of the server log on failure. Run 1 is not explained, so the drill has passed once and failed once. The next step is to watch further runs on the same code. If a failure recurs, its server log will show the cause.

### Local runs

- Drill: passed against Postgres 16 on the final commit, including the KMS startup check. Run with `PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres PGPASSWORD=postgres bash scripts/drills/outage-drill.sh`.
- Suites: `npx vitest run packages/api packages/storage` gave 171 test files, 1,024 tests and 1 expected failure, on the commit before the drill-script change. That change does not touch these suites.
- Not run locally: `npm run typecheck` and the full `npm test`.

### KMS

- **Local emulator.** Moto 5.2.5 (Python, no container) implements KMS but rejects the key spec our signer uses. Its `CreateKey` enum does not include `ECC_NIST_EDWARDS25519`. So an emulator cannot exercise the real signing path. Docker is not available in the sandbox, so LocalStack was not an option.
- **Startup refusal with an unreachable KMS endpoint.** Tested and passing, in the local drill and in CI. This needs no AWS account.
- **Real AWS KMS.** The sandbox has AWS credentials for an IAM user. Read-only access works: the identity check succeeds. The same user is denied `kms:ListAliases`, and the attempt to create a key was denied `kms:TagResource`, so the key was not created. No KMS key or alias was created, changed or deleted. Creating test keys needs an identity granted those actions by the account owner. The owner must also confirm the account is for testing, because it may run production.
- **Not yet checked:** whether `alias/default` already exists in that account. The server looks up that alias, so a test key must not take it over.

### Pull request

- #611 (`claude/kind-wright-kbfgdq` into `main`) carries this work. Its description lists what is not covered.
