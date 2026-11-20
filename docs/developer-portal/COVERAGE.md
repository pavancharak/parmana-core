# Documentation coverage and verification report

[Portal home](README.md) · [Changelog](CHANGELOG.md) · [Known issues](#known-issues-found-during-this-review)

This report says what was documented, what was checked, what was run, what failed, and what remains. It was produced on **2026-11-20** from the parmana-core checkout on branch `ccr-ead4b602-t6o6n7`. The checkout's HEAD commit before this work was `1845194`. Every result below was observed in that run. Nothing is reported as passing that was not run.

## Summary

| Measure                                     | Result                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Portal files                                | 37 Markdown files (33 narrative, 4 generated), plus 9 example files and 2 tools                                                                                                            |
| TypeScript SDK methods documented           | **58 of 58** named in narrative pages, with signature and HTTP request for each in the generated index                                                                                     |
| Python SDK methods documented               | **50 of 50** named in narrative pages, with HTTP request for each in the generated index                                                                                                   |
| OpenAPI operations documented               | **66 of 66** named in narrative pages; **52** have a TypeScript SDK method that sends the same request, the other 14 are called over HTTP                                                  |
| Error codes indexed from source             | **105**, each with the file that raises it; **8** observed in a response or runner output                                                                                                  |
| Environment variables documented            | **All 65** names the code reads are in the [reference](reference/environment-variables.md): 54 in the server, SDK and CLI tables, and 11 script, test and tooling names in their own table |
| Links                                       | **462 checked, all resolve** (the final check run is in the [verification log](#verification-log))                                                                                         |
| Examples run                                | **All 9** governed-quickstart files ran and passed in their stated configuration; the repository's own examples ran through `npm run examples` (116 examples, exit 0)                      |
| REST requests checked against a live server | **27 of 27** (`rest-smoke.sh`)                                                                                                                                                             |
| Repository tests run                        | Python `pytest`: **208 of 208**. Verifier `npm test`: **108 of 108**. TypeScript SDK examples integration test: **3 of 3**. The TypeScript workspace `npm test`: **failed** (see issues).  |

## What was documented, by section

| Section                      | Files                                                                                                                                                                                                         | Status                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Overview and getting started | [README](README.md), [overview](overview.md), [getting started](getting-started.md), [FAQ](faq.md), [glossary](glossary.md)                                                                                   | Complete. Every command in getting-started was run.                                                                                      |
| Architecture                 | [architecture](architecture.md)                                                                                                                                                                               | Complete: five diagrams, synchronous and asynchronous operations, data flows, trust boundaries. Diagrams are Mermaid, not rendered here. |
| SDKs                         | [index](sdk/README.md), [TypeScript](sdk/typescript.md), [Python](sdk/python.md), [verifier](sdk/verifier.md), [CLI](sdk/cli.md), [connector SDK](sdk/connector-sdk.md), and the two generated method indexes | Complete for the listed packages. The connector SDK page documents the contract and its import surface, not a release path.              |
| REST API                     | [overview](api/README.md), [core endpoints](api/endpoints.md), [endpoint index](api/endpoint-index.md) (generated)                                                                                            | Core endpoints and all 66 operations. Experimental routes labelled.                                                                      |
| Tutorials                    | [index](tutorials/README.md) and eight pages                                                                                                                                                                  | Complete. Each tutorial names what was run and what was not.                                                                             |
| Policy management            | [policies](policies/README.md)                                                                                                                                                                                | Complete for the fields, versions, approval flow and the version-in-effect rule.                                                         |
| Deployment and operations    | [deployment](deployment/README.md)                                                                                                                                                                            | Implemented options are labelled; Docker, PostgreSQL and cloud were **not run** here.                                                    |
| Security and evidence        | [security](security/README.md), [evidence verification](security/evidence-verification.md)                                                                                                                    | Complete. Schema coverage, the uncovered-field limit and the tamper results were reproduced.                                             |
| Troubleshooting              | [troubleshooting](troubleshooting/README.md)                                                                                                                                                                  | Complete for the observed messages.                                                                                                      |
| Reference                    | [reference](reference/README.md), [error codes](reference/error-codes.md), [error index](reference/error-code-index.md), [environment variables](reference/environment-variables.md)                          | Complete for what was checked.                                                                                                           |

## Verification log

Each row is a command that was run, its observed result, and the time it took where the run recorded one.

### Repository tests

| Command                                                                                                  | Result                                                                                                                                                                                                                             | Time                            |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `npm ci --ignore-scripts`, then `npm rebuild re2 esbuild`                                                | Installed 752 packages. `re2` needed a rebuild for the server to start.                                                                                                                                                            | not recorded                    |
| `npm run build`                                                                                          | Exit 0                                                                                                                                                                                                                             | not recorded                    |
| `npm test` in `/home/user/parmana-verifier` (verifier)                                                   | **108 passed, 0 failed**                                                                                                                                                                                                           | 1.2 s (verifier's own duration) |
| `npx vitest run typescript/test/integration/examples.integration.test.ts`, with database variables unset | **3 passed** (the two SDK examples, and the refusal without approval)                                                                                                                                                              | 4.07 s                          |
| `npm run test --workspace=typescript`                                                                    | **Failed**: 8 of 28 files failed (6 zero-byte test files; 2 integration suites needing environment). 229 tests passed, 3 skipped.                                                                                                  | not recorded                    |
| `pytest -q` in `python/` (after `pip install "./python[verify,dev]"`)                                    | **208 passed**                                                                                                                                                                                                                     | 17.3 s                          |
| `npm run examples` (repository runner, with database variables unset)                                    | Exit 0. 116 examples ran. The runner's own summary is in its output.                                                                                                                                                               | not timed                       |
| Tutorial 103 (maker-checker, hermetic), with `PARMANA_POLICY_DIR` and `PARMANA_KEY_DIR`                  | Exit 0. Propose 201; service caller 403 `NON_HUMAN_CALLER_DENIED`; self-approval 403 `SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`; no envelope 403 `STEP_UP_AUTHORIZATION_INVALID`; checker with envelope approved, policy file written. | not timed                       |

### Governed quickstart (against a local server, memory storage, test configuration)

| Command                                                                                                                           | Result                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node docs/developer-portal/examples/governed-quickstart/setup.mjs`                                                               | Wrote keys, policies, caller keys and `start-server.sh` to `~/.parmana/governed-quickstart`.                                                                               |
| `bash ~/.parmana/governed-quickstart/start-server.sh`                                                                             | `API running on http://0.0.0.0:3000`; `GET /health` returned `UP`.                                                                                                         |
| `npx tsx …/typescript/governed-flow.ts`                                                                                           | Exit 0. Maker proposal; self-approval refused (403); checker approved; execution APPROVED; server VERIFIED; offline valid; repeat refused (409). Run twice, both passed.   |
| `python3 …/python/governed_flow.py`                                                                                               | Exit 0. The same six steps, with the Python SDK. Passed.                                                                                                                   |
| CLI maker-checker, `packages/cli/dist/index.js` (`policy propose`, `approval sign`, `approval submit`) for `vendor-payment@2.1.1` | Exit 0. Maker's submission refused 403 `SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`; checker's submission accepted; policy file written. Run twice (before and after a restart). |
| `npx tsx …/typescript/declare-then-execute.ts` with `GOVERNED_POLICY_VERSION=2.1.1`                                               | Exit 0. RECEIVED, then APPROVED, then VERIFIED.                                                                                                                            |
| `npx tsx …/typescript/approval-cases.ts` with `2.1.1`                                                                             | Exit 0. A, B, C, D refused (403); E approved.                                                                                                                              |
| `npx tsx …/typescript/limits.ts` with `2.1.1`                                                                                     | Exit 0. Three refusals (403).                                                                                                                                              |
| `bash …/rest-smoke.sh` with `GOVERNED_POLICY_VERSION=2.1.1`                                                                       | Exit 0. **27 passed, 0 failed.**                                                                                                                                           |
| `bash …/verify-standalone.sh`                                                                                                     | Exit 0. Valid record, `coverage: legacy`, exit 0. Changed copy: `valid: false`, exit 1. The script used the published `@parmana/verifier@2.0.3` from npm.                  |

### Evidence checks (offline, with pinned keys)

| Check                                                                                       | Result                                                                                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Schema 2 record, legacy trust settings, as written                                          | `valid: true`, `coverage: legacy`.                                                                                  |
| Schema 2 record, a covered field changed (`executions[0].decision.outcome`)                 | `valid: false`, `trustRecordHash mismatch`.                                                                         |
| Schema 2 record, an **uncovered** field changed (`updatedAt`)                               | **`valid: true`**. Not detected. Reproduced.                                                                        |
| Schema 3 hybrid record (ed25519 + dilithium3), default trust rules                          | `valid: true`, `coverage: full`, `hybridSignatures: true`.                                                          |
| Schema 3 record, uncovered field changed (`updatedAt`)                                      | `valid: false`, both signatures fail.                                                                               |
| The same schema 3 record through the TypeScript SDK offline function                        | `valid: true`, `coverage: full`. Tampered: `valid: false`.                                                          |
| The same schema 3 record through the Python SDK offline function                            | `valid: true`, `coverage: full`. Tampered: `valid: false`.                                                          |
| Schema 2 record through the TypeScript and Python SDK offline functions, no legacy settings | `valid: true`, `coverage: legacy`. The SDK functions do not apply the standalone verifier's refuse-by-default rule. |
| Fingerprint of the server's published key versus the signing key                            | Identical (`sha256:72b5…`), checked in the first run.                                                               |

### Installs and registry checks

| Check                                                                    | Result                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install @parmana/sdk@4.1.1` in a fresh directory, import, `VERSION` | `4.1.1`; `ParmanaClient`, `createBusinessTransaction`, `signApproval`, `signPolicyChangeStepUp`, `verifyExecutionTrustRecordOffline`, `ExecutionRejectedError`, `ParmanaError`, `HttpTransport` exported. |
| `pip install "parmana==4.1.1"` in a fresh venv                           | `4.1.1`; `ParmanaClient` imports. `parmana.crypto` exports checked from the `[verify]` install.                                                                                                           |
| `npm install @parmana/verifier@2.0.3` in a fresh directory               | `parmana-verify` binary present, prints usage (exit 2).                                                                                                                                                   |
| `pip install "parmana-verifier==2.0.3"`                                  | Installed, version 2.0.3.                                                                                                                                                                                 |
| `pip install "parmana-connector-sdk==4.1.1"`                             | Installed. Imports from the README resolve; a malformed capability raises `ValueError`.                                                                                                                   |
| `npm install -g --prefix … @parmana/cli@4.1.1`, then run `parmana-ops`   | **Printed nothing, exit 0.** See the first known issue below. The `dist/index.js` file, run with `node`, works.                                                                                           |
| `npm view` for every workspace package marked public                     | Eight on npm at the repository version; two on npm at `0.1.0`; ten not on npm (see [SDKs](sdk/README.md#published-packages)).                                                                             |

### Docker

| Check                      | Result                                               |
| -------------------------- | ---------------------------------------------------- |
| `docker compose config -q` | Exit 0. Five services listed.                        |
| `docker info`              | Daemon not reachable. **The stack was not started.** |

## Known issues found during this review

Each issue is a difference between what a developer would expect and what the code or the published artifact does. Each was reproduced. None has been changed in the repository, because the task was documentation only.

1. **The existing quickstart does not run as written** (`docs/site/quickstart.mdx`). Four things stop it: the server refuses to start without `PARMANA_POLICY_DIR`; it refuses to start without `PARMANA_KEY_DIR`; `generate-approver-key --out-dir ~/.parmana` fails with `ENOENT` unless the directory exists; and the first execution of `vendor-payment@2.1.0` is refused because the version has no approval record. The quickstart does not mention maker-checker. _Evidence:_ the runs listed above. _Where to fix:_ the quickstart and its command lines.

2. **`PARMANA_ALLOW_UNGOVERNED_POLICY=true` has no effect on the server.** The examples runner sets it, and the runner's comment says it relaxes governance. No server source file under `packages/*/src` reads it, and `createCurrentPolicyVersionSource` says no environment setting turns governance off. Anyone who reads the runner's comment may think governance is relaxed when it is not. _Where to fix:_ the runner's comment, or remove the variable.

3. **`npm run dev:setup` cannot run the fixture flows.** It sets `PARMANA_POLICY_DIR=./policies`, which has no `vendor-payment`, and its caller key may invoke only `test:fixture-execute`, which has no binding. _Evidence:_ `POST /execute` returned `404 Policy 'vendor-payment' version '2.1.0' was not found.`

4. **The server reports `0.4.0`, but the packages are `4.1.1`.** `GET /version` and `GET /api-manifest.json` both report `buildVersion: 0.4.0`. The TypeScript SDK's `version()` returns the server's `/version`. The Python SDK's `version` property returns the SDK's own version. The two SDKs therefore return different things for the same name. _Where to fix:_ the version constant in `packages/api`.

5. **The installed `parmana-ops` binary prints nothing.** In `packages/cli/src/index.ts`, `main()` runs only when `process.argv[1]` ends in `index.js` or `parmana`. An install through the bin name `parmana-ops` does not match, so the command does nothing and exits 0. `npx @parmana/cli` also fails (`parmana-ops: not found`). _Workaround verified:_ `node "$(npm root -g)/@parmana/cli/dist/index.js" …`. _Where to fix:_ the entry-point check.

6. **Hybrid mode without a secondary provider releases an action and then fails to record it.** With `CRYPTO_MODE=hybrid` and no `SECONDARY_SIGNATURE_PROVIDER`, `POST /execute` returned `500` with `Secondary signature provider is not configured.`, after the action was released. The server's own message says not to retry as a new transaction. _Where to fix:_ validate the secondary provider at start-up, before any release. This is a server-side check the code could make.

7. **A default record's signature does not cover most of the record.** Schema 2 covers seven top-level fields. Changing `updatedAt` on a schema 2 record leaves the verifier's `valid` as `true`. The verifier's own format notes describe this limit, and this review reproduced it. Schema 3 detects the same change. The default configuration produces schema 2. _Where to fix:_ the default `HYBRID_SCHEMA_VERSION`, or the documentation of `valid`.

8. **A stale comment in the configuration says version 3 records are unreadable.** `packages/shared/src/config/Config.ts` says schema 3 records "are not readable by the SDKs and by the published third-party verifier until those are updated". This review found that both SDKs and the published verifier read and verify schema 3 records correctly. _Where to fix:_ the comment, after the owner confirms the position.

9. **The SDK offline check reports legacy records as valid.** `verifyExecutionTrustRecordOffline` and `verify_execution_trust_record_offline` return `valid: true` with `coverage: legacy` for a schema 2 record, while the standalone verifier refuses it by default. Callers who rely on `valid` alone get a weaker check than they may expect. _Documented:_ the security pages say to check `coverage`.

10. **The example file's statement about `PARMANA_KEY_DIR` is out of date.** `.env.example` says the key directory is required only when `NODE_ENV` is not `test`. The server refused to start without it under `NODE_ENV=test` as well. _Where to fix:_ `.env.example`.

11. **The TypeScript workspace test script fails in this checkout.** `typescript/test/HealthApi.test.ts`, `ParmanaClient.test.ts`, `PolicyApi.test.ts`, `ReplayApi.test.ts`, `RuntimeApi.test.ts` and `VerificationApi.test.ts` are zero bytes in git, so vitest reports "No test suite found" for each. The two integration suites in that workspace need `PARMANA_POLICY_DIR` and a `./keys` directory, which the workspace run does not set. _Where to fix:_ remove or fill the empty files, and set the integration environment in the workspace script.

12. **Three tutorials fail when run directly with `npx tsx`.** Tutorials 60, 103 and 120 refuse to start without `PARMANA_POLICY_DIR`; 103 also needs `PARMANA_KEY_DIR`. Their READMEs do not say so. The examples runner sets these defaults, which is why `npm run examples` works. _Where to fix:_ the tutorial READMEs.

13. **The OpenAPI document and the code disagree on Policy v2.** The SDK calls `/v2/decisions`, `/v2/reviews/…` and `/v2/evidence/…`, which are not in `openapi/openapi.yaml`. They are mounted only when `PARMANA_POLICY_V2_DECISIONS` and related settings are set. _Documented_ as experimental in the [API overview](api/README.md#experimental-and-opt-in-routes). _Where to fix:_ add the routes to the OpenAPI document, or mark them as experimental there.

14. **An unmounted route returns an HTML page, not the API's error shape.** `GET /kill-switch/status` on a server without the kill switch returned an HTML `404` page. A client that expects JSON will fail to parse it. _Documented_ in the [API overview](api/README.md#errors).

15. **Two published packages are on npm at a different version from the repository.** `@parmana/envelope-verifier` and `@parmana/execution-system` are `0.1.0` on npm, and `4.1.1` in the repository. Consumers who pin `4.1.1` will not find these packages. _Documented_ in the [SDK index](sdk/README.md#published-packages).

16. **Sandbox environment note (not a repository issue).** The sandbox in which this review ran had a `DATABASE_URL` set to a hosted database. The review did not write to it. The first local server start inherited it, and the start-up log showed no database connection or write. Every later run unset it, and the test guard refused it once. The value is not reproduced in this report. An operator should treat a hosted database URL in any shared environment as a secret to rotate if it was exposed.

## Undocumented or unclear functionality

These public functions or routes exist but are documented only at the level of their name, or are not exercised here.

| Item                                                                                                                                                                                             | Status in the portal                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execution intents (ADR-0012): `executionIntent`, `verifyExecutionIntent`, `unfinalizedExecutionIntents`, `finalizeExecutionIntent`, `resolveExecutionIntent` and the `/execution-intents` routes | Listed as experimental. Not exercised.                                                                                                                                                                                                                                  |
| Kill switch (`/kill-switch/*`, `KILL_SWITCH_*`)                                                                                                                                                  | Listed as experimental, opt-in. Not exercised.                                                                                                                                                                                                                          |
| Inbound refund decisions (`/v1/inbound/*`, `INBOUND_AUDIENCE`)                                                                                                                                   | Listed as experimental, opt-in. Not exercised.                                                                                                                                                                                                                          |
| Handbook download leads (`/handbook/download-leads`) and the handbook PDF                                                                                                                        | Named in the endpoint index. Not described beyond the OpenAPI summary.                                                                                                                                                                                                  |
| Sandbox approvals (`/sandbox/approvals`)                                                                                                                                                         | Described as demo only. Not exercised.                                                                                                                                                                                                                                  |
| Policy v2 (`decidePolicyV2`, `policyV2Review`, `decidePolicyV2Review`, `policyV2Replay`, and `/v2/*`)                                                                                            | Documented as experimental. Not exercised.                                                                                                                                                                                                                              |
| Connector release path (the signed release from the gateway to a connector)                                                                                                                      | Described from the connector SDK's README. Not exercised.                                                                                                                                                                                                               |
| `@parmana/crypto`, `@parmana/shared`, `@parmana/envelope-verifier`, `@parmana/execution-system`                                                                                                  | Listed as building blocks. Not documented as APIs.                                                                                                                                                                                                                      |
| Governance changes for approvers, external connectors, business signal sources and authority grants                                                                                              | Every method and operation is named in the [TypeScript](sdk/typescript.md#governance-changes-every-method) and [Python](sdk/python.md#methods-not-covered-above) pages and the [endpoint page](api/endpoints.md#every-other-operation). Not exercised against a server. |
| `POST /transactions/{id}/reconcile`                                                                                                                                                              | Described from the OpenAPI document and the SDK. Not exercised.                                                                                                                                                                                                         |
| Bulk trust-record export (`GET /trust-records` with `since` and `until`)                                                                                                                         | Described. Not exercised.                                                                                                                                                                                                                                               |
| `parmana-ops log verify`, `log export`, `log check-db`, `approver …`, `keys generate-approver-key`, `completion`                                                                                 | Listed in the CLI page from `--help`. Not exercised.                                                                                                                                                                                                                    |
| The 202, 500 `EXECUTION_RECORD_INCOMPLETE`, and 502 `EXECUTION_OUTCOME_UNKNOWN` branches                                                                                                         | Described from the OpenAPI document and the SDK source. Not triggered.                                                                                                                                                                                                  |
| `SIGNING_UNAVAILABLE`, `AUDIT_UNAVAILABLE`, `TENANT_NOT_ALLOWED`                                                                                                                                 | Described from source. Not triggered.                                                                                                                                                                                                                                   |
| The `PARMANA_KEY_MATERIAL_*`, `PARMANA_SECRETS_PROVIDER` and AWS variables                                                                                                                       | Described from the example file and the code. Not exercised.                                                                                                                                                                                                            |
| Python LLM tool-call example (`python/examples/10_llm_tool_call.py`)                                                                                                                             | Referenced, not run.                                                                                                                                                                                                                                                    |

## Missing examples

- A Python version of the declare-then-execute flow and of the approval cases.
- A Python version of the CLI maker-checker flow (the CLI is the same in both languages).
- A live refund against a server with a registered payment source. Tutorial 129 runs the decision in-process; the server path was not run.
- A run of each of the 202, 500 and 502 branches, and of `reconcile`.
- A governance example for approver keys, connectors, signal sources and authority grants.
- A bulk trust-record export example.
- Examples for `KEY_PROVIDER=aws-kms` and the secrets provider.
- Any example in a language other than TypeScript, Python or the shell. The repository has no Java or Go SDK; the API manifest lists them as `null`.

## Terminology

- The portal uses **Business Transaction**, **Execution Trust Record**, **policy version in effect**, **approval artifact** and **maker-checker** throughout, as the glossary defines them.
- The repository uses both "Trust Record" and "Execution Trust Record". The portal uses "Execution Trust Record" in full at first mention on each page, and "record" after that.
- The API says "approval", the schema says `approvalArtifact`, and the SDK calls the function `signApproval`. The portal uses "approval" in prose and the exact names in code.
- The API's `status` values (`RECEIVED`, `EXECUTING`, `VERIFIED`, and others) are plain strings in the Python SDK in this build.

## Remaining gaps

1. The Docker stack, PostgreSQL migrations and the cloud deployment were not run. The Docker path needs a host with a running daemon.
2. No latency or throughput figure is published. The load-test script was not run.
3. Backup, restore, rotation and KMS verification were described from scripts and code, not run.
4. The Python SDK's async behaviour is not applicable (the client is synchronous); the portal says so.
5. The TypeScript SDK in a browser is not documented, and is not verified.
6. The website navigation (see below) is proposed, not applied.

## Website integration

The repository's documentation site is Mintlify (`docs/site/docs.json`). This portal does not change that site. It is plain Markdown, and the [portal index](README.md#proposed-website-navigation) proposes a navigation. **Publishing or changing the site needs the owner's approval, and was not done.**

## Recommended next steps

1. **Fix the quickstart** (known issue 1) before it is linked as the first step for a new developer. The governed setup in this portal can replace it once the owner agrees.
2. **Fix the CLI entry point** (known issue 5), and document the workaround until it is fixed.
3. **Correct the version reported by the server** (known issue 4), so that compatibility checks can rely on it.
4. **Decide the schema 3 default** (known issues 7 and 8). Until then, tell verifiers to require `coverage: full` for records that matter.
5. **Add a startup check for the secondary signature provider** (known issue 6).
6. **Repair the TypeScript test workspace** (known issue 11), so `npm test` reports a true result.
7. **Run the Docker stack** on a host with a daemon, and record the result in this report.
8. **Run the governed-quickstart kit in CI**, with the server started from the generated config. The kit is the only path in this portal that was run end to end.
9. **Have the owner review the proposed navigation** and approve the portal's publication.

## Files created

All files are under `docs/developer-portal/`:

- Portal: `README.md`, `overview.md`, `getting-started.md`, `architecture.md`, `faq.md`, `glossary.md`, `CHANGELOG.md`, `COVERAGE.md`
- SDKs: `sdk/README.md`, `sdk/typescript.md`, `sdk/python.md`, `sdk/verifier.md`, `sdk/cli.md`, `sdk/connector-sdk.md`, `sdk/typescript-method-index.md` (generated), `sdk/python-method-index.md` (generated)
- API: `api/README.md`, `api/endpoints.md`, `api/endpoint-index.md` (generated)
- Tutorials: `tutorials/README.md`, `tutorials/nodejs-integration.md`, `tutorials/python-integration.md`, `tutorials/fintech-integration.md`, `tutorials/refund-authorization.md`, `tutorials/maker-checker.md`, `tutorials/transaction-limits.md`, `tutorials/ai-agents.md`
- Policies: `policies/README.md`
- Deployment: `deployment/README.md`
- Security: `security/README.md`, `security/evidence-verification.md`
- Troubleshooting: `troubleshooting/README.md`
- Reference: `reference/README.md`, `reference/error-codes.md`, `reference/error-code-index.md` (generated), `reference/environment-variables.md`
- Examples: `examples/README.md`, `examples/governed-quickstart/setup.mjs`, `examples/governed-quickstart/start-server.sh` (written to `~/.parmana` by the setup), `examples/governed-quickstart/rest-smoke.sh`, `examples/governed-quickstart/verify-standalone.sh`, `examples/governed-quickstart/typescript/{governed-flow,declare-then-execute,approval-cases,limits,make-transaction}.ts`, `examples/governed-quickstart/python/governed_flow.py`
- Tools: `tools/generate-indexes.mjs`, `tools/check-docs.mjs`
- Changelog: `CHANGELOG.md`

No file outside `docs/developer-portal/` was changed. The existing documentation, the server, the packages, the tests and the examples are unchanged.

## Verification log

The final checker run is listed here. Re-run it with `node docs/developer-portal/tools/check-docs.mjs` and `node docs/developer-portal/tools/generate-indexes.mjs` from the repository root.

| Check                  | Result                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate-indexes.mjs` | TypeScript 58 methods (57 with a request, 1 local). OpenAPI 66 operations (52 covered by a TypeScript method). Python 50 methods (48 with a request, 2 local). Error codes 105 (8 triggered). |
| `check-docs.mjs`       | 37 files. 462 links: all resolve. TypeScript methods not named in narrative pages: 0. Python: 0. OpenAPI operations not named in narrative pages: 0. Stale claims: none. Exit 0.              |
