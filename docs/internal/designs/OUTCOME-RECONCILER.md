# Outcome reconciler for `in_flight` executions (G-125 Part 3)

Status: design, not implemented. Proposed for review before any code is written.

Related: `docs/guides/enforcement-path.md` (section 4, section 11, section 10 item 1), `packages/shared/src/domain/execution-outcome-store.ts`, `packages/execution-gateway/src/ExecutionGateway.ts`, and `supabase/migrations/20261027120000_add_execution_outcomes.sql` with `20261111180000_execution_outcome_failed.sql`.

## Problem

An execution outcome row is written as `in_flight` before the connector is called (`ExecutionGateway.execute`, the `begin` call). The row is changed to `completed` or `failed` only when the outcome is known. A row can stay `in_flight` in two ways:

1. The connector call returned an error after the connector may have acted. The gateway records nothing further, by design (section 4 of the guide).
2. The process crashed, or the connection dropped, between `begin` and `complete` or `fail`.

For either case, the store says "the effect may or may not have happened". A retry is answered `OutcomeUnknownError`, which tells the caller not to retry and to check the external system. Nothing in Parmana can settle the row. A person has to look.

That is safe, but it doesn't scale. Each stuck row blocks its authorization until someone reconciles it by hand, and there is no record of how that was resolved.

## What a reconciler may do

A reconciler resolves an `in_flight` row to one of three outcomes, and it may only write one of them after checking the external system:

| Finding                                                                        | Action on the row                                                    | Effect on the authorization                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The external system shows the effect happened                                  | Record `completed` with the result the connector would have returned | Retries return that result. Nothing runs again.                               |
| The external system shows no effect, and the connector confirms it did not act | Record `failed` with the reason, or delete the row                   | The authorization is spent (`failed`), or it can be released again (deleted). |
| The external system cannot say                                                 | Leave the row `in_flight` and raise it for a person                  | Unchanged.                                                                    |

The reconciler must never re-execute the connector to find out what happened. A second call is the duplicate effect the outcome record exists to prevent.

The third row matters most. Most stuck rows will end there until each connector has a reliable read-back.

## Per-connector check

Each connector that can leave a row `in_flight` needs a read-back: a way to ask the external system whether the effect of a given authorization exists. The shape is:

```ts
interface ConnectorReconciliation {
  // Returns the state of the effect for this authorization, without changing anything.
  check(
    record: InFlightRecord,
  ): Promise<
    | { state: "applied"; result: ExecutionResult }
    | { state: "not_applied" }
    | { state: "unknown"; reason: string }
  >;
}
```

- `applied` is only returned when the external system confirms the effect with the same authorization or business transaction ID, not just a similar one.
- `not_applied` is only returned when the external system can prove the effect is absent. "Not found" from a search that may lag is not proof.
- `unknown` is the default. Any error from the check is `unknown`.

Connectors that cannot provide a read-back return `unknown` for every row. Their rows are reconciled by a person only.

## Where the reconciler runs

- A scheduled job inside the API process, or a separate worker. It takes rows older than a threshold (for example, longer than the authorization TTL, so the authorization is expired and cannot be retried) and checks them one at a time.
- A manual trigger for an operator, scoped to one authorization ID.

Rows are only reconciled after their authorization has expired (`expires_at` in the table). Until then, a retry could still arrive, and the answer must stay `OutcomeUnknownError`. This keeps the reconciler from racing an in-flight retry.

## Data and audit

- The reconciler writes through the same store interface. It needs one new method, `reconcile(nonce, resolution)`, which only updates a row that is still `in_flight` and whose authorization has expired.
- Each resolution is appended to an audit record: the nonce, the check result, the operator or job that made the decision, and the time. It is not written into `result` or `failure_reason`, because those hold connector data and refusal reasons.
- A resolution by a person needs a second person, or an explicit recorded reason. This follows the approval rules the repository already uses for policy changes.

## Failure modes

- **Reconciler crashes mid-check.** Nothing is written until a check gives a definite answer, so the row stays `in_flight`. The next run starts again.
- **Two reconcilers run together.** The update is guarded by `status = 'in_flight'`, so only one resolution wins.
- **Connector read-back is wrong.** This is the real risk. A false `not_applied` would allow a duplicate effect after the row is deleted. For that reason, `not_applied` should first set the row to `failed`, not delete it, until a person confirms the deletion.
- **Authorization expired but the row is `completed` or `failed`.** Nothing to do. The reconciler only touches `in_flight` rows.

## Plan

1. Agree this design. Open questions below need answers first.
2. Add the store method and the audit table, with migration and PGlite tests. No connector changes.
3. Implement the reconciler loop with every connector returning `unknown`. This makes the job safe to run before any read-back exists. It only reports rows that are old and still `in_flight`.
4. Add read-backs one connector at a time, starting with the connector that has the most in-flight traffic. Each read-back needs its own tests against a fake external system.
5. Add an operator command to resolve a row after a person has checked the external system.

## Open questions

1. **Answered (survey on this branch).** No connector can read back the effect of an authorization today.
   - The connector contract in `packages/execution-control/src/SecureConnector.ts` has one method, `execute`. Nothing else is required of a connector, and nothing in `packages/connector-sdk` or the runtime provides a read.
   - Production capabilities are external endpoints registered through the connector repository (ADR-0013), and each endpoint is run by its operator. Parmana has no read path into them.
   - Under this design every existing connector therefore answers `unknown`, so every `in_flight` row is a person's to resolve.
   - A reconciler can still ship (plan step 3), because it reports rows and changes none. Read-backs need a contract change first: an optional `checkEffect(authorizationId)` on the external endpoint contract, specified and implemented by each endpoint's operator. That is a decision for the repository owner, and it should be made before plan step 4.
2. Should `not_applied` delete the row or only mark it `failed`? The design says `failed`, which keeps the nonce spent. Is that acceptable for every case?
3. Who may resolve a row by hand? One operator, or two?
4. What is the reconciler's threshold? The authorization's `expiresAt` is the natural choice, but it may be too late for a connector with a slow read-back.
5. Does this need its own RFC? It changes what the audit trail records for a refused or stuck execution.

## Measured cost of an intent record

The read-back design needs endpoints to record intent before they act. This section measures the cost of that write, using the existing outcome-store insert as the closest equivalent.

**Method.** A local PostgreSQL 16.15 server (loopback, 127.0.0.1, single client, `max: 1` connection pool) with the two outcome migrations applied (`20261027120000_add_execution_outcomes.sql` and `20261111180000_execution_outcome_failed.sql`). Each run did 100 warm-up operations, then 2,000 timed operations, each awaited before the next. The write is the one `PostgresExecutionOutcomeStore.begin` performs: an insert of an `in_flight` row with `ON CONFLICT (nonce) DO NOTHING`. Latency is wall-clock time measured in Node 24 with `process.hrtime`.

| Operation                       | n     | p50      | p95      | p99      | mean     |
| ------------------------------- | ----- | -------- | -------- | -------- | -------- |
| Round trip (`SELECT 1`)         | 2,000 | 0.088 ms | 0.323 ms | 0.572 ms | 0.128 ms |
| `begin`: insert `in_flight` row | 2,000 | 0.526 ms | 0.960 ms | 1.372 ms | 0.564 ms |

At the median the insert costs about 0.44 ms more than a bare round trip.

**What this does not show.** The database was on the same host, with no network between the application and the database, no replica, and a small table. It is a floor, not a forecast. An intent record adds one database commit round trip to every release, so the real cost is that database's distance from the endpoint, plus any synchronous replication. A database 50 ms away adds roughly 50 ms per release. The figure above applies only where the endpoint's database is on the same host or in the same network.

**To repeat.** Start a PostgreSQL 16 server on port 55432, create database `parmana`, apply the two migrations with `psql`, and run a small Node script that times 2,000 inserts of the form above with `pg`. Re-run with the database placed at the distance the workload will actually have, and record the numbers in this section.

## Implementation status

- **Stage 1, complete and merged to `main` as #592.** `ExecutionOutcomeStore.listStuck(now)` returns rows that are still `in_flight` and whose authorization expired at or before `now`. It is read-only, and the in-memory and PostgreSQL stores are both tested, including a check that the listed rows are unchanged afterwards. `scripts/report-stuck-outcomes.ts` (run with `npm run report:stuck-outcomes`) prints the stuck rows as a table or with `--json`. It only reads. It was run against seeded rows: it listed the one expired in-flight row and changed none of the three.
- **Not yet built:** scheduling the report, and any resolution. Stage 1 is the report only; a person resolves each row.
- **Read-backs (stage 4)** stay blocked on ADR-0022 step 1.
