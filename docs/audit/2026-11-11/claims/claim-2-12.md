# 2.12 Fail-Closed Authorization on Rejection

Source: CLAIMS.md (commit d1d63c6), lines 281-292.

## Exact claim text

## 2.12 Fail-Closed Authorization on Rejection

A rejected Decision never produces a Signed Execution Authorization.

Evidence

- RuntimeEngine (authorization signing occurs only after executionGate.enforce() approves the Decision)

- packages/runtime/tests/unit/execution-authorization-wiring.test.ts: "rejected transaction produces no authorization"

---

## Cited evidence paths

No backticked repo path in this claim.

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
