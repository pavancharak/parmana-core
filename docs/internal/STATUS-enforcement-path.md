# Status: enforcement path and its follow-up work

This is the full record of the enforcement-path work, updated 2026-11-12. The detailed guide is `docs/guides/enforcement-path.md`. The reconciler design is `docs/internal/designs/OUTCOME-RECONCILER.md`. The read-back decision is `docs/internal/adr/ADR-0022-External-Connector-Read-Back.md`.

## Merged into `main`

- **#583** The enforcement-path guide and its invariant tests. The production gateway passes `verificationOnlyKeys`, scoped to the verifier key (`PARMANA_VERIFIER_KEY_ID`, default `signal-verifier`) and to `hubspot:deal-fetch` (audit G-111).
- **#584** Example approval issuers grant the capabilities they approve (G-50), which fixed 66 failing example scripts. CLI key tests build their paths with `node:path` `join`, which fixed four failures on Windows. The guide's design section was restored.
- **#585** Outcome-record fix. A refusal before dispatch is recorded: if the nonce was not consumed, the in-flight row is deleted so a corrected retry can run; if it was consumed, the row becomes `failed` with the reason, and a retry gets `ReleaseNotDispatchedError` (409). Errors from the connector itself still leave the row `in_flight`. Migration `20261111180000_execution_outcome_failed.sql` admits the new status and adds `failure_reason`.
- **#586** `ExecutionComponent` keeps the original refusal when recording the failed execution also fails. The recording error is logged as `execution_failure_not_recorded`.
- **#587** Design for resolving stuck `in_flight` rows (G-125 Part 3).
- **#588** Regression test that authorization nonces are random version-4 UUIDs and distinct on every signature.
- **#589** Documentation of the generic 500 path in the error handler. Unexpected errors don't leak their details. Gateway verification failures (forged, tampered, expired) are reported as 500, which is wrong for caller errors. The status change is not made.
- **#590** ADR-0022 (external connector read-back), the connector survey, the measured latency of the intent record, and guide section 12.
- **#591** This status record.
- **#592** Reconciler stage 1: the read-only listing `listStuck(now)` in the outcome store, with tests on the in-memory and PostgreSQL stores, and `scripts/report-stuck-outcomes.ts` (run with `npm run report:stuck-outcomes`), which prints stuck rows as a table or with `--json`. It only reads.
- **#593** The first production run of the report, recorded.

## On a branch, not yet a pull request

None.

## Connector read-back

- **Survey.** No connector can read back whether an authorization's effect happened. The connector contract (`packages/execution-control/src/SecureConnector.ts`) has one operation, `execute`. Production capabilities are external endpoints run by their operators (ADR-0013). Built-in connectors were removed (ADR-0018).
- **Measured.** On a local PostgreSQL 16 server (loopback, 2,000 inserts), the intent-record write has a median of 0.53 ms against a 0.09 ms round trip. A distant database would add its round-trip distance per release. Recorded in `docs/internal/designs/OUTCOME-RECONCILER.md`.
- **ADR-0022, accepted with the recommended options.** D1: the signed check answer is mandatory, and an unsigned answer counts as `unknown`. D2: the endpoint must record intent before it acts. It adds an optional, read-only `check` operation to the endpoint contract. Its five-step plan has not started. Step 1, a `supportsCheck` registration flag, needs the owner's go-ahead.
- **Until endpoints implement the check,** every existing `in_flight` row is `unknown`, so a person resolves it.

## Reconciler

- **Stage 1, the report, is built and merged (#592).** It lists stuck rows and changes none.
- **Not yet built:** scheduling the report, and any resolution.
- **Stage 4, the read-backs,** are blocked on ADR-0022 step 1.

## Open items

Items 1 to 3 are decisions for the owner. Item 4 waits on operating data.

1. **Done: release-verifier reordering.** Gateway authentication and the connector lookup now run before the release verifier. An unregistered action no longer spends its authorization. Threat tests (`release-order-threats.test.ts`) pin the properties the reorder must keep. Review: `docs/internal/designs/RELEASE-CHECK-ORDER.md`.
2. **HubSpot helper branch (`fix/hubspot-self-approval`).** The verifier key is active in production, but nothing on `main` signs with it, so the containment is in place without its caller (G-111). Waiting on the owner's decision.
3. **Status code for gateway verification failures.** Forged, tampered and expired authorizations return 500. They should return 403 with the failed check named. Callers that treat 500 as "retry later" would change behaviour. Waiting on the owner's decision.
4. **Reconciler scheduling and resolution,** after the report has run long enough to show how many rows are stuck.

## What has been verified, and what has not

- Verified locally, on Linux with Node 24: the workspace build and typecheck (`tsc -b`), the examples runner, and the unit suites for each changed package. Each fix has a test that fails when the fix is removed.
- The report command was run against a scratch PostgreSQL server with seeded rows. It listed the expired in-flight row and changed none of the rows.
- Not verified locally: the full `npm test` suite, which needs PostgreSQL on port 55432. CI runs it on each pull request.
- The CLI key tests were fixed for Windows by construction, since the test and the command use the same `join`. They were not run on Windows from the sandbox.

## Production run of the stuck-outcome report

- **2026-11-12.** Run by the repository owner from Windows PowerShell, on `main` with #592 merged, against the production database: `npm run report:stuck-outcomes`. Result: no stuck in-flight outcomes. The command only reads, so the run changed nothing.
- This is a single snapshot. The report is not scheduled, so it says nothing about rows that become stuck later.

## Working notes

- Branches for new work are cut from `main`. The old designated branch was rebuilt after each merge, which required force-pushes.
- The stop hook reports unpushed commits because the sandbox's commit hashes differ from the remote's. The remote is the record of truth.
