# 2.58 An Operator Can Stop All Execution, and the Stop Survives Restarts

Source: CLAIMS.md (commit d1d63c6), lines 839-872.

## Exact claim text

## 2.58 An Operator Can Stop All Execution, and the Stop Survives Restarts

**Claim.** An operator can trip a kill switch that refuses new execution, new transactions, policy-change approvals and sandbox approvals, before any of them run. The stop is stored in Postgres, so a restart does not clear it. A stored state that cannot be read counts as tripped. When `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR=true`, a reset needs a second, different operator.

**Verified by tests.**

- A trip refuses `/execute` with `503 KILL_SWITCH_ACTIVE`, and a reset lets the next request through (`packages/api/tests/integration/kill-switch.integration.test.ts`).
- The trip, status and probe routes stay reachable while the switch is tripped. A key without the trip, reset or probe capability is refused with `403`.
- A reset by one operator is held as pending (`202`). A second, different operator completes it (`200`). The same operator is refused (`409`).
- A failure to read the state reports the switch as tripped (`packages/api/tests/unit/KillSwitchService.test.ts`).
- Against a real PostgreSQL 16 server, the stop survives a new connection pool, and two concurrent trips end at the same version (`packages/api/tests/integration/postgres-kill-switch.integration.test.ts`).

**Production.** On 2026-10-20, with the switch enabled and not tripped, the status endpoint reported it as inactive and echoed the request nonce. The switch has not been tripped in production. An external probe is scheduled to run every 15 minutes. Its runs are recorded in `kill_switch_probe`; this claim does not assert the outcome of each run.

**Limits.**

1. A stop does not recall an action already released. Calls admitted before the trip can still complete.
2. A tool an agent reaches directly, bypassing Parmana, is not stopped.
3. The status response and the audit events are not signed (G-118). A status response shows the switch's state, not a signed proof of it.
4. The external probe's results are recorded in `kill_switch_probe`, but they are not signed.
5. Two-person reset has not been exercised in production with two real operator keys.
6. The switch stops every caller at once. It cannot halt one agent.
7. A third-party check on a non-production deployment has not been done.

**Evidence.**

- `packages/api/tests/integration/kill-switch.integration.test.ts`
- `packages/api/tests/unit/KillSwitchService.test.ts`
- `packages/api/tests/integration/postgres-kill-switch.integration.test.ts`
- `packages/api/src/bootstrap/createKillSwitch.ts`
- `docs/internal/runbooks/KILL-SWITCH-OPERATIONS.md` (operations)

The gap record is G-122 in `docs/internal/VERIFICATION-GAPS.md`.


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `docs/internal/runbooks/KILL-SWITCH-OPERATIONS.md`: EXISTS
- `packages/api/src/bootstrap/createKillSwitch.ts`: EXISTS
- `packages/api/tests/integration/kill-switch.integration.test.ts`: EXISTS
- `packages/api/tests/integration/postgres-kill-switch.integration.test.ts`: EXISTS
- `packages/api/tests/unit/KillSwitchService.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/kill-switch.integration.test.ts` | passed | 9 | 9 | 0 |
| `packages/api/tests/integration/postgres-kill-switch.integration.test.ts` | passed | 6 | 0 | 6 |
| `packages/api/tests/unit/KillSwitchService.test.ts` | passed | 10 | 10 | 0 |
