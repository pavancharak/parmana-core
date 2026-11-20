# Findings: open items after the production-readiness pass

[Portal home](README.md) · [Coverage report](COVERAGE.md) · [Changelog](CHANGELOG.md)

This file lists everything from the review that is **not fixed** in the change set, and why. Each item is either a decision that belongs to the owner, something this environment could not verify, or something I was not sure enough about to change. Nothing here is hidden in the portal: each item is also linked from the coverage report.

Items that **were** fixed, and how each was checked, are in [COVERAGE.md](COVERAGE.md#known-issues-found-during-this-review).

## Decisions for the owner

### F0. Production with memory storage is now refused (a reversal to confirm)

**Confirmed by the owner (2026-11-20): no deployment intentionally runs production on memory storage.** The start-up refusal stays in place and is covered by tests.

- **Evidence.** Before this pass, `NODE_ENV=production` with memory storage started silently, and the `doctor` reported it as a failure. An existing unit test (`assert-storage-configured.test.ts`) asserted the start-up was a no-op. This pass changes the server to refuse it, and changes that test.
- **Why.** Memory loses every transaction, record and approval on restart. A production process must not run that way by default.
- **Owner to confirm.** That no deployment intentionally runs production mode on memory storage. The sandbox refuses production mode (`createSandboxOptions`), so no sandbox path was found that depends on it.

### F1. Default record schema: version 3 since 2026-11-20 (was version 2, signing 7 fields)

**Resolved (2026-11-20).** Full reference: [Schema version 3](security/schema-v3.md). The owner chose the verifier-pinned cutover (ADR-0016, option 2), and made schema 3 the default: an unset `HYBRID_SCHEMA_VERSION` now means 3, and the acknowledgement gate is removed. No active consumer and no single-mode record exist, per the owner. The cutover instant is `2026-11-20T13:01:38Z` (set by the owner on 2026-11-20). It holds only if every issuing server runs `CRYPTO_MODE=hybrid` with a secondary provider. The owner confirmed on 2026-11-20 that no record was issued in `single` mode, so no record predates the cutover and the pre-cutover limit does not apply.

- **Evidence.** A schema 2 record's `updatedAt` can be changed with `valid: true` (reproduced with `parmana-verify`). Schema 3 detects the same change. The `HYBRID_SCHEMA_VERSION` default was `2` when this was found.
- **Why not changed.** Changing the default changes what every new record contains. Verifiers that do not yet accept schema 3 would reject them. That is a rollout decision.
- **Recommendation.** Set the default to schema 3 after confirming every consumer of records accepts it. Until then, tell verifiers to require `coverage: full` for records that matter.

### F2. The SDK offline check reports legacy records as valid

**Resolved.** Both SDKs take an opt-in option, default off: `requireFullCoverage` (TypeScript, third argument) and `require_full_coverage=True` (Python, keyword). With it, a legacy record is `valid: false` with an error that names the option. The default result is unchanged, so no caller breaks. Tests: `typescript/test/whole-record-v3-offline.test.ts` and `python/tests/test_whole_record_v3_offline.py`.

- **Evidence.** `verifyExecutionTrustRecordOffline` (TypeScript) and `verify_execution_trust_record_offline` (Python) return `valid: true` with `coverage: legacy` for a schema 2 record. The standalone verifier refuses the same record by default.
- **Why not changed.** Changing the SDK return value is a public API change. A new option (`requireFullCoverage`, default off) would be backward compatible.
- **Recommendation.** Add the option in a minor release, and document it as the way to fail closed.

### F3. `npm run dev:setup` cannot run the fixture flows

- **Evidence.** It sets `PARMANA_POLICY_DIR=./policies`, which has no `vendor-payment`. Its caller may invoke only `test:fixture-execute`, which has no policy binding.
- **Why not changed.** The fixture capability is unbound on purpose, and the right dev setup is a design choice. The governed quickstart in the portal is the working path.
- **Recommendation.** Point `dev:setup` at `fixtures/policies` and say in its output that an approval is needed first, or drop the command in favour of the quickstart.

### F4. Python `version` is a property; TypeScript `version()` is a method that calls the server

**Resolved (both kept).** Python `client.version` stays the SDK's version, a property, as it was. The new `client.server_version()` asks the server, as TypeScript `version()` does. Test: `python/tests/test_client.py`.

- **Evidence.** The same name returns the SDK's version in Python and the server's version in TypeScript.
- **Why not changed.** Either side would be a breaking change for existing callers.
- **Recommendation.** Keep both. Add `serverVersion()` to Python, and document `version` as the SDK version in both.

### F5. Two packages are on npm at `0.1.0` while the repository is `4.1.1`

- **Evidence.** `@parmana/envelope-verifier` and `@parmana/execution-system` are `0.1.0` on the registry.
- **Why not changed.** Publishing is an owner decision.
- **Recommendation.** Publish both at `4.1.1`, or confirm they are internal and remove the `public` flag from their manifests.

### F6. Policy v2 routes are not in the OpenAPI document

**Resolved in this pass.** The 28 Policy v2 operations are in `openapi/openapi.yaml`, tagged _Policy v2 (experimental)_ and marked `x-stability: experimental`. Their samples are generated by `scripts/openapi/generate-policy-v2-samples.ts`, which `npm run openapi` runs. The route-parity test now mounts these routes, so a change to either side fails the build. Whether the contract is promoted out of experimental is still the owner's decision. The text below is the record of the question.

- **Evidence.** The SDK calls `/v2/decisions`, `/v2/reviews/…` and `/v2/evidence/…`. They are mounted only when `PARMANA_POLICY_V2_DECISIONS` and related settings are set.
- **Why not changed.** Adding them to the published contract is a decision about their stability.
- **Recommendation.** Either add them to `openapi/openapi.yaml` marked experimental, or mark the SDK methods experimental in their JSDoc.

### F7. Approvals are not automated for the quickstart

- **Evidence.** A policy version has no approval record until a second caller approves it. The quickstart now says so, and the governed kit demonstrates the flow.
- **Why not changed.** Automatic approval would weaken the control the policy exists to enforce. The correct fix is a documented local approval helper, which needs a design decision on who may run it.

## Items this environment could not verify

### F8. Docker Compose stack, PostgreSQL migrations, and cloud deployment

**Update in this pass.** PostgreSQL migrations were run, against a throwaway PostgreSQL 16.15 cluster on `localhost` (not the hosted database). All 57 tracked migrations applied, and the database-gated suites ran against it: the full repository suite passed with the database set. The Docker Compose stack, the container image and the cloud deployment were **not** run, because the Docker daemon is not reachable in this environment. The rest of this entry still stands for those.

- **Evidence.** The Docker daemon is not reachable in the sandbox. The compose file validates with `docker compose config`. No database was used, by design.
- **Recommendation.** Run `docker compose up`, `npm run db:migrate` and the readiness check in CI on a host with a daemon, and record the result.

### F9. Latency and throughput

- **Evidence.** None measured. `npm run loadtest` was not run.
- **Recommendation.** Run it on representative hardware before quoting any figure.

**Update (2026-11-20).** `npm run loadtest` ran locally (20 connections, 15 s). The `/health` and `/ready` figures are valid: about 18,700 and 17,500 requests per second, p50 0 to 1 ms, p99 3 ms, no errors. The `POST /execute` figures are **not** a throughput result: all 60,025 requests were refused (non-2xx). The script signs a human approval for each request but does not create the policy's approval record, which governance requires, so each execution is refused. The refusal reason was not captured, so the cause is inferred from the code. Until the script seeds governance, do not quote an execute figure.

### F10. Python verifier test count differs from Node

**Checked (2026-11-20), still open.** The two suites name their tests in different styles (Node uses descriptive sentences, Python uses snake_case functions), so the names cannot be diffed by script. Closing this needs each test mapped by hand. Not done.

- **Evidence.** `parmana-verifier` (Python) passes 107 tests. `@parmana/verifier` (Node) passes 108. Verdicts agree on every record tried (v2 legacy, v2 covered-change, v3 full, v3 tampered, hybrid).
- **Per-file counts.** Node: `correspondence` 12, `quickstart` 2, `parmana-core-records` 22, `verify` 21, `whole-record` 17, `trust` 14, `hybrid` 10, `vectors` 5, `timestamp` 3, `agentrust-fixture` 2. Python: `test_correspondence` 12, `test_quickstart` 2, `test_parmana_core_records` 44, `test_verifier` 49. Correspondence and quickstart match exactly. The one-test difference is not in a single file, and I did not map tests by name.
- **Recommendation.** Diff the two test lists by name and add the missing case to the lagging side.

### F11. Schema 3 reading by third-party tools

**Answered by the owner (2026-11-20): no third-party consumer is active.** Verified readers are still only the TypeScript and Python SDKs and `parmana-verifier` 2.0.3. Any consumer added later must read schema 3 before it receives records. Re-check this before each new consumer.

- **Evidence.** Verified with the TypeScript and Python SDKs and `parmana-verifier` 2.0.3 only.
- **Not known.** Whether tools outside this repository read schema 3.
- **Recommendation.** Ask each consumer before F1 changes the default.

### F15. The Policy v2 policy document has an open schema in the OpenAPI document

- **Evidence.** `POST /v2/register/policies` takes the policy document as its body. The OpenAPI schema for that body is `type: object` with `additionalProperties: true`, and the sample sends `{}` with a comment to replace it. The validator that defines the format lives in `packages/policy`, and the portal does not document the format.
- **Why not changed.** Writing the format into the contract means choosing its stability, which is the owner's decision (see F6).
- **Recommendation.** Document the policy version 2 document format, with a worked example that the validator accepts, and make the schema match it.

### F16. Policy v2 register responses are open objects

- **Evidence.** The register's change responses (sources, thresholds, actions, approver keys, policy versions, role grants) are documented as `type: object` with `additionalProperties: true`. The record types are defined in `packages/policy/src/v2/register.ts`, and the sample responses are illustrative, not captured.
- **Recommendation.** Give each record its own schema, and capture a real response from a deployment with policy version 2 enabled to replace the illustrative example.

### F17. Policy v2 is not exercised against a live server

- **Evidence.** The Policy v2 routes are checked by the route-parity, sample and schema tests, and the server's policy v2 unit tests. No deployment with `PARMANA_POLICY_V2_DECISIONS` set was started in this pass, so no live request was made.
- **Recommendation.** Start a server with the policy v2 settings and record a decision, a review and an evidence replay, before the owner promotes the contract.

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
