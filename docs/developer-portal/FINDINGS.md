# Findings: open items after the production-readiness pass

[Portal home](README.md) · [Coverage report](COVERAGE.md) · [Changelog](CHANGELOG.md)

This file lists everything from the review that is **not fixed** in the change set, and why. Each item is either a decision that belongs to the owner, something this environment could not verify, or something I was not sure enough about to change. Nothing here is hidden in the portal: each item is also linked from the coverage report.

Items that **were** fixed, and how each was checked, are in [COVERAGE.md](COVERAGE.md#known-issues-found-during-this-review).

## Decisions for the owner

### F0. Production with memory storage is now refused (a reversal to confirm)

- **Evidence.** Before this pass, `NODE_ENV=production` with memory storage started silently, and the `doctor` reported it as a failure. An existing unit test (`assert-storage-configured.test.ts`) asserted the start-up was a no-op. This pass changes the server to refuse it, and changes that test.
- **Why.** Memory loses every transaction, record and approval on restart. A production process must not run that way by default.
- **Owner to confirm.** That no deployment intentionally runs production mode on memory storage. The sandbox refuses production mode (`createSandboxOptions`), so no sandbox path was found that depends on it.

### F1. Records are signed with schema version 2 by default (signature covers 7 fields)

- **Evidence.** A schema 2 record's `updatedAt` can be changed with `valid: true` (reproduced with `parmana-verify`). Schema 3 detects the same change. The default `HYBRID_SCHEMA_VERSION` is `2`.
- **Why not changed.** Changing the default changes what every new record contains. Verifiers that do not yet accept schema 3 would reject them. That is a rollout decision.
- **Recommendation.** Set the default to schema 3 after confirming every consumer of records accepts it. Until then, tell verifiers to require `coverage: full` for records that matter.

### F2. The SDK offline check reports legacy records as valid

- **Evidence.** `verifyExecutionTrustRecordOffline` (TypeScript) and `verify_execution_trust_record_offline` (Python) return `valid: true` with `coverage: legacy` for a schema 2 record. The standalone verifier refuses the same record by default.
- **Why not changed.** Changing the SDK return value is a public API change. A new option (`requireFullCoverage`, default off) would be backward compatible.
- **Recommendation.** Add the option in a minor release, and document it as the way to fail closed.

### F3. `npm run dev:setup` cannot run the fixture flows

- **Evidence.** It sets `PARMANA_POLICY_DIR=./policies`, which has no `vendor-payment`. Its caller may invoke only `test:fixture-execute`, which has no policy binding.
- **Why not changed.** The fixture capability is unbound on purpose, and the right dev setup is a design choice. The governed quickstart in the portal is the working path.
- **Recommendation.** Point `dev:setup` at `fixtures/policies` and say in its output that an approval is needed first, or drop the command in favour of the quickstart.

### F4. Python `version` is a property; TypeScript `version()` is a method that calls the server

- **Evidence.** The same name returns the SDK's version in Python and the server's version in TypeScript.
- **Why not changed.** Either side would be a breaking change for existing callers.
- **Recommendation.** Keep both. Add `serverVersion()` to Python, and document `version` as the SDK version in both.

### F5. Two packages are on npm at `0.1.0` while the repository is `4.1.1`

- **Evidence.** `@parmana/envelope-verifier` and `@parmana/execution-system` are `0.1.0` on the registry.
- **Why not changed.** Publishing is an owner decision.
- **Recommendation.** Publish both at `4.1.1`, or confirm they are internal and remove the `public` flag from their manifests.

### F6. Policy v2 routes are not in the OpenAPI document

- **Evidence.** The SDK calls `/v2/decisions`, `/v2/reviews/…` and `/v2/evidence/…`. They are mounted only when `PARMANA_POLICY_V2_DECISIONS` and related settings are set.
- **Why not changed.** Adding them to the published contract is a decision about their stability.
- **Recommendation.** Either add them to `openapi/openapi.yaml` marked experimental, or mark the SDK methods experimental in their JSDoc.

### F7. Approvals are not automated for the quickstart

- **Evidence.** A policy version has no approval record until a second caller approves it. The quickstart now says so, and the governed kit demonstrates the flow.
- **Why not changed.** Automatic approval would weaken the control the policy exists to enforce. The correct fix is a documented local approval helper, which needs a design decision on who may run it.

## Items this environment could not verify

### F8. Docker Compose stack, PostgreSQL migrations, and cloud deployment

- **Evidence.** The Docker daemon is not reachable in the sandbox. The compose file validates with `docker compose config`. No database was used, by design.
- **Recommendation.** Run `docker compose up`, `npm run db:migrate` and the readiness check in CI on a host with a daemon, and record the result.

### F9. Latency and throughput

- **Evidence.** None measured. `npm run loadtest` was not run.
- **Recommendation.** Run it on representative hardware before quoting any figure.

### F10. Python verifier test count differs from Node

- **Evidence.** `parmana-verifier` (Python) passes 107 tests. `@parmana/verifier` (Node) passes 108. Verdicts agree on every record tried (v2 legacy, v2 covered-change, v3 full, v3 tampered, hybrid).
- **Per-file counts.** Node: `correspondence` 12, `quickstart` 2, `parmana-core-records` 22, `verify` 21, `whole-record` 17, `trust` 14, `hybrid` 10, `vectors` 5, `timestamp` 3, `agentrust-fixture` 2. Python: `test_correspondence` 12, `test_quickstart` 2, `test_parmana_core_records` 44, `test_verifier` 49. Correspondence and quickstart match exactly. The one-test difference is not in a single file, and I did not map tests by name.
- **Recommendation.** Diff the two test lists by name and add the missing case to the lagging side.

### F11. Schema 3 reading by third-party tools

- **Evidence.** Verified with the TypeScript and Python SDKs and `parmana-verifier` 2.0.3 only.
- **Not known.** Whether tools outside this repository read schema 3.
- **Recommendation.** Ask each consumer before F1 changes the default.

### F14. Verifier Windows commands were not run here

- **Evidence.** The verifier README records a Windows PowerShell run on 2026-10-29. This environment is Linux, so the PowerShell commands were not repeated.
- **Recommendation.** Keep the Windows check in the release process, and record each run with its date.

## Design questions

### F12. A declared transaction cannot take its approval after declaration

- **Evidence.** Verified: a transaction declared without an approval was refused on execution, and the same request declared with the approval was approved. The stored declaration is what executes.
- **Why it may be right.** It stops an approval being attached to a request a human did not see as declared.
- **Question for the owner.** Is this the intended contract? If callers need to amend a declaration, that is a new feature, not a bug.

### F13. Unknown routes without a key answer `401`, not `404`

- **Evidence.** Authentication runs before routing, so an unknown path needs a key to receive the JSON `404`.
- **Why it may be right.** It avoids telling an unauthenticated caller which routes exist.
- **Question for the owner.** Confirm this is intended.

## Notes

- The sandbox in which this work ran had a hosted `DATABASE_URL` in its environment. It was not used, and it is not in the repository. If that value was shared, rotate it.
- The commit made in this session carries an SSH signature from the environment's signing helper. This environment can sign, but cannot verify, so the signature is unverified here.
