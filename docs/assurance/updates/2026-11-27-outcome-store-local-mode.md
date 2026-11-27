# Documentation update: outcome-store local-mode rule and gateway wiring tests

- **Date:** 2026-11-27
- **Trigger:** "document it", following the work recorded as the 2026-11-27 entry in `ASSURANCE_RESULTS.md`
- **Commit:** `799fcab` (fix and tests), with `a197a1b` (prettier-only formatting)
- **Branch:** `claude/trusting-goodall-djgzgs`

## Documents checked

| Document                              | Changed | Reason                                                                                            |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `docs/ASSURANCE_TESTING_PLAN.md`      | no      | Phase status and exit criteria unchanged. Phase 2 stays "Not started".                            |
| `docs/ASSURANCE_TESTING_STANDARD.md`  | no      | No standard requirement or mapping changed.                                                       |
| `docs/ASSURANCE_RESULTS.md`           | yes     | New dated entry appended. No earlier entry changed (diff shows additions only).                   |
| `docs/ASSURANCE_DECISIONS.md`         | no      | No owner decision made. The fix applies an existing rule (the nonce store's) to one more factory. |
| `docs/ASSURANCE_TESTING_OVERVIEW.md`  | no      | Phases and rules unchanged.                                                                       |
| `CLAUDE.md`                           | no      | Rules unchanged.                                                                                  |
| `docs/assurance/OPEN_ITEMS.md`        | yes     | Gaps GW-1 to GW-3, outcome-store durability, commit signing and gateway review added.             |
| `docs/assurance/COVERAGE_REGISTER.md` | yes     | Row for "only the gateway can execute" qualified; row for outcome-store durability added.         |

## Checks

- [x] Each factual claim was checked against the repository. `packages/api/src/bootstrap/createExecutionOutcomeStore.ts` now uses `localModeEnabled()`, as `createNonceStore.ts` does. `packages/execution-gateway/src/ExecutionGateway.ts` constructor refuses neither-or-both of `connector` and `executionControl`.
- [x] Package names match `packages/*/package.json`. The test run resolved `@parmana/execution-gateway`, `@parmana/storage` and `@parmana/envelope-verifier`.
- [x] Commands match `package.json` scripts: `build:packages`, `build --workspace=typescript`, and `vitest run`, as used in the results entry.
- [x] Workflow names match `.github/workflows/`. The CI test job sets `NODE_ENV: test` and `PARMANA_LOCAL_MODE: "true"` (`ci.yml`), which matches the new rule.
- [x] No policy, exit criterion or acceptance principle changed, so no owner decision is needed.
- [x] Earlier results entries were not rewritten. The results-log diff contains no deleted lines.
- [x] `npx prettier --check` passes on the changed code files. The edited markdown files were formatted with `prettier --write`.

## Not verified

- Integration tests against PostgreSQL: CI runs them. Not run in this session.
- Commit signature: SSH-signed, but this environment has no public key or allowed-signers file to verify it. GitHub's verified status was not read.
- Whether `parmana-connectors` can be called without the gateway (GW-2): not checked.
- Whether a failure of the audit record after a successful connector call leaves the outcome correctly recorded (GW-3): not checked.

## Open items

1. GW-1: production wiring does not pass the gateway's `connector` option, but no test asserts it. A wiring test on `createExecutionGateway` would close this.
2. GW-2: confirm the connector boundary with the owner's answer about `parmana-connectors/api`.
3. GW-3: add a fault-injection test for audit failure after a connector call.
4. Owner review of `packages/execution-gateway/` changes, per CODEOWNERS.
5. Verify the commit signature on GitHub.
