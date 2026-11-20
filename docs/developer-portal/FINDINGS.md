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

**Owner answer (2026-11-20): both packages are meant to be public.** Checked: both manifests are at `4.1.1` and not private; both pack cleanly (`npm pack --dry-run` lists only their built `dist` files). The registry has `0.1.0` and `0.0.0-stage`. **Decision (2026-11-20): public, in two steps. Envelope verifier first, after its API page; execution system held.** The manifest, workflow and runbook changes for the envelope verifier are on the branch and pass the release test. Not published.

**Earlier decision text.** The permanent answer follows the owner's stated intent. The release change (manifest, runbook, tests) is set out in [the publishing page](packages/publishing-envelope-verifier-and-execution-system.md) and is not applied yet, because it changes the next release. **Still not published.**

**Earlier state (2026-11-20).** Two blockers. (1) This environment has no npm credentials (`npm whoami`: ENEEDAUTH), and the release runbook requires publishing from the owner account. (2) `docs/internal/runbooks/RELEASE-ALL-PACKAGES.md` lists nine packages, and neither of these two is among them. Publishing them by hand would skip the runbook's controls: the version-bump PR, the release manifest, SLSA provenance and the registry checks. Next step for the owner: either add both packages to the release manifest and the runbook, then release them through the process, or mark both private if they are internal.

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

### F21. An approved version that is not live was refused as "no approved policy" (fixed)

- **Evidence.** During the live run, a decision for an action whose go-live gate had not passed was refused with `NO_APPROVED_POLICY` ("No approved policy is in force"), although a version was approved. The message sent the caller to approve a policy, which had already been done.
- **Fix.** A new refusal code, `ACTION_NOT_LIVE`, with a detail that names the go-live gate. The register reports whether a version is approved and its action is not live; the decision service uses that only to choose the refusal, and never to allow a decision. `NO_APPROVED_POLICY` is unchanged when nothing is approved. The code is added to the OpenAPI enum, the TypeScript type, the Python docstring, and the error-code index. The unit test for the new refusal passes; the Policy v2 API and integration tests (137) pass against local PostgreSQL; the Python suite (212) passes. The live server was not re-run after this change.

### F17. Policy v2 run live, from setup to a finished review (fixed: the run is recorded)

- **Evidence.** A fresh local database (PostgreSQL 16, migrated), a server with `PARMANA_POLICY_V2_DECISIONS=true` and the owner set by `PARMANA_POLICY_V2_BOOTSTRAP_OWNER`, and 39 requests in order. The steps and their results:
  1. Roles: the checker is `reviewer` and `second-approver`; the reviewer-2 caller is `reviewer`; the maker is `action-owner`, `operator` and `gate-owner` (an operator must exist before `gate-owner`, and the server refused the grant in the wrong order); two gate owners are `operator` then `gate-owner`.
  2. Action `erp:pay-invoice`, owner `maker`, successor `successor-1`, reviewers `checker` and `reviewer-2`. A reviewer cannot be added later unless it was named at registration, and the successor cannot review. The approval validity is at most 60 minutes.
  3. Thresholds `maxAmount` (1000 USD) and `reviewRiskScoreAbove` (50): proposed by the maker and approved by the checker. The policy must declare each threshold, or it is refused.
  4. Policy `2.0.0` proposed by the maker and approved by the checker.
  5. Tier tests for `refuse`, `review` and `reject`, run by a gate owner. The go-live check then lists nothing missing.
  6. Go-live by both gate owners. The action is live. Until it is, the decision path reports `NO_APPROVED_POLICY`, even with an approved policy.
  7. Decisions: a high-risk request is `REVIEW` with review `review-1`; an over-limit request is `REJECT` at the `refuse` tier; a low-risk request is `REJECT` at the `reject` tier. None is released.
  8. Review: the requester is refused (`The requester cannot review their own request`). The checker's decision is recorded as `assigned`, and the second reviewer's makes it final: `APPROVED`, two decisions. A second decision by the same reviewer is refused.
  9. Evidence replay of `ev-1` reproduces the decision with no differences.
- **Defect found and fixed in this run.** Before the fix, a partial stored review state made every decision answer 500 (F20).
- **Not exercised.** The alerts board, the sweeps (timed review reminders and expiry), the notifications and webhooks, and the console screens. The `release` of an approved review: after the review is approved, the record `ev-1` still says `REVIEW` and `released: false`. Whether an approved review should release the action is not answered by this run, and the owner should decide it before promotion.
- **Recommendation.** Decide whether an approved review releases the action, and record a run of the alerts and sweeps before the owner promotes the contract.
- **Resolved in F22.** The review outcome is now a separate, hash-bound record that refers to the decision. The release question is decided in F22: an approved review releases nothing.

### F22. A reviewed decision left no outcome record that refers to the decision (fixed)

- **Evidence.** The design (`docs/internal/design/POLICY-V2-SPEC.md`, the review outcome) says the final approval or refusal is a further separate record that refers back to the decision. The review item referred only to the decision's policy hash and rule, not to its evidence record, and the outcome had no hash that covered the decision. An approved review left nothing in the log that tied the outcome to the decision it finished.
- **Fix.** The review item now stores the decision's evidence record id and its hash, and the decision route supplies them. The outcome carries that reference and its own SHA-256 over its canonical form, so changing the decision it refers to breaks the hash. `verifyReviewResult` checks it. Outcomes are persisted with the review state. The evidence chain is unchanged, so existing records and the replay path are unaffected.
- **Decision: an approved review releases nothing.** The design already says a decision releases nothing, and an approval is a record, not an instruction to pay. Releasing an action from an approved review would move money on a record that a person approved for a different purpose; the release path belongs to the existing gated execution, which a later change can design and the owner can approve. This decision can be overruled by the owner, and if it is, the release rule needs its own design.
- **Verified.** The policy unit tests (768, including two new ones: the outcome refers to its decision and verifies; a changed reference fails). The Policy v2 integration and API tests (137) pass against local PostgreSQL, and the shared test database was cleaned afterward.

### F20. A partial review state crashed the decision route, and a test left one behind (fixed)

- **Evidence.** The integration test `packages/policy/tests/integration/policy-v2-commit.integration.test.ts` saved `{ items: [] }` as the review state. It truncated the tables before each test but not after the last one, so the row stayed in the shared database. The next server start that read it failed: `ReviewQueue.load` read `snapshot.results` of an undefined value, and each decision answered `500`.
- **Fix.** `ReviewQueue.load` now checks every part of a stored snapshot, and fails with the part named (`'results' must be a list`). The integration test truncates the Policy v2 tables in `afterAll`. Two unit tests cover the partial snapshot and a complete round trip. The Policy v2 test files (15 files, 130 tests) pass against the local PostgreSQL.

### F18. The Python SDK could not propose an approver key that the server accepts (fixed)

- **Evidence.** Before the fix, against a live local server, `ApproverApi.propose_add` sent `approverId`, `keyId`, `publicKeyPem` and `reason`, and the server answered HTTP 400: `capabilities is required for add: a list of 1 to 50 capability names`. The method had no `capabilities` argument. The `parmana-ops approver propose-add` command already takes `--capabilities`.
- **Fix.** `propose_add` takes `capabilities: list[str]` (keyword-only, 1 to 50 names, checked before the call), and sends it. The approver API tests and the docs code samples now include it. The Python test suite passes (212 tests). `governance_changes.py` was run against a fresh live server: the maker's own approval is refused, the checker approves the key.
- **Still open.** The method has been published since 1.4.0 without the argument, so it never worked against a server. The fix needs a release, and a note in the Python changelog that `capabilities` is now required. That release is for the owner to make.

### F19. The published request schema omits `capabilities`, which the server requires (fixed)

- **Evidence.** `schemas/requests/propose-approval-issuer-change-request.schema.json` had no `capabilities` property, and the server requires it for an `add` change. The shared change schema, `schemas/common/approval-issuer-change.schema.json`, has `additionalProperties: false` and no `capabilities` either, so a response that includes it would fail that schema.
- **Fix.** The request schema now has `capabilities` (1 to 50 names, each matching the server's pattern), required with `publicKeyPem` for `add` and not allowed for `revoke`. The shared change schema has `capabilities`. The OpenAPI add example shows it. The bundle and the code samples were regenerated with `npm run openapi`. The 26 test files that cover the schemas, the OpenAPI document and the approver routes pass (170 tests), run against a local PostgreSQL.

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
