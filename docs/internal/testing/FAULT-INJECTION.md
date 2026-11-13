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

## Not covered

- Database, signing-service and network failures in a deployed instance.
- The Postgres repositories. They are exercised only when `PARMANA_TEST_DATABASE_URL` is set, and
  these tests do not use them.
- Load under failure. See the load-testing item in `docs/internal/VERIFICATION-GAPS.md`.
