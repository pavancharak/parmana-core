# 3.29 Kill Switch, Approval Binding and Audit Tamper Checked Against the Source (Scoped, 2026-10-26)

Source: CLAIMS.md (commit d1d63c6), lines 2101-2118.

## Exact claim text

## 3.29 Kill Switch, Approval Binding and Audit Tamper Checked Against the Source (Scoped, 2026-10-26)

**Claim.** An active kill switch refuses execution with `KILL_SWITCH_ACTIVE`, and the connector is not called when the switch trips between the HTTP guard and release. An approval for one action does not authorize another. A tampered audit event or execution intent is reported invalid.

**Evidence.**

- Kill switch refusal: `packages/api/tests/integration/kill-switch.integration.test.ts` and `kill-switch-release-window.integration.test.ts`. The refusal is a 503 with `KILL_SWITCH_ACTIVE`. On branch `test/kill-switch-no-connector` (commit `8a857f2`, not yet merged), the release-window test also asserts that the executor is never called on refusal, and is called once in the control case. That assertion is not yet on `main`.
- Approval binding: `approval-issuers-governance.integration.test.ts`, `business-signal-sources-governance.integration.test.ts` and `external-connectors-governance.integration.test.ts` refuse an approval with no step-up, or a step-up for the other action.
- Audit tamper: `audit-verify.integration.test.ts` reports a tampered event as invalid. `execution-intents.integration.test.ts` returns `{ valid: false }` for a tampered intent.

Run on 2026-10-26, Node 22.22.0: the eight files above pass, 88 of 88.

**Limits.**

- The kill-switch no-connector assertion is on a branch and is not part of `main` until that branch merges.
- The approval tests cover the governance-approval flows. They do not show the same binding for every connector.
- The audit-tamper tests cover the caller audit event and the execution intent. They do not cover every record the system writes.


## Cited evidence paths

- `packages/api/tests/integration/kill-switch.integration.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/kill-switch.integration.test.ts` | passed | 9 | 9 | 0 |
