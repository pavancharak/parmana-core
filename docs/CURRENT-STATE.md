# Parmana: Current State

> Not a roadmap. No dates, no version targets, no performance numbers that
> don't exist in this repo. Every line below was verified directly against
> source or a command actually run, on 2026-09-08, except the test counts
> and the self hosted deployment section, verified on 2026-09-25, and the
> connector list, policy reachability and human approval sections, verified
> on 2026-09-27, and the business validation section, verified on 2026-10-11. Where something is
> mentioned elsewhere in this repo's docs/comments but doesn't exist in
> code, that is stated explicitly, not implied.

## What's real and working

**Core pipeline** (`RuntimeEngine.execute()`, `packages/runtime`): load a
policy → check it against a capability→policy binding map → check its
`boundSignals` against the actual execution intent → evaluate deterministic
rules (`PolicyEngine.evaluate()`, pure function, no I/O) → on approval, sign
an authorization (Ed25519 by default; ML-DSA-65 — Node's native
`ml-dsa-65` key type, referred to in code as "Dilithium3" — under
`CRYPTO_MODE=hybrid`) → `ExecutionGateway` independently re-verifies that
signed authorization before any connector runs → connector executes with a
single-use, credential-isolated session, destroyed after use → a signed
`ExecutionTrustRecord` is produced.

**Reachable today** (`packages/api/src/bootstrap/createConnectorRegistry.ts`,
read directly on 2026-09-27): four connectors, each registered only when its
configuration is present. HubSpot (`HUBSPOT_PRIVATE_APP_TOKEN`), GitHub
(`GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`), Paytm
refunds through a separate connector service (`PAYTM_CONNECTOR_URL`,
`PAYTM_CONNECTOR_SHARED_SECRET`) and Slack (`SLACK_BOT_TOKEN`; since 2026-09-28 a post
also needs its channel in `SLACK_ALLOWED_CHANNEL_IDS`, G-76), plus a
`test-fixture` connector gated to `NODE_ENV=test`. Six capabilities:
`hubspot:deal-fetch`, `hubspot:deal-update`, `github:pr-fetch`,
`github:pr-merge`, `paytm:refund`, `slack:post-message`.

**Storage**: `@parmana/storage`'s `StorageFactory` selects `memory` or
Postgres. `postgres` and `supabase` select the same Postgres storage
(since 2026-09-25, G-57). `sqlite` is not a valid `PARMANA_STORAGE` value,
and the factory still throws "not implemented" for it. The Postgres backend goes through a
raw `pg.Pool`, not `supabase-js`/PostgREST. Tests always force `memory`
regardless of configuration.

**Package version**: `0.1.0` (`package.json`). There is no tagged release
history in this repository.

**Tests**: 2,069 passing, 42 skipped, 0 failing across 246 test files
(231 passed, 15 skipped). Run directly with `npx vitest run` on
2026-09-25, after the self hosted deployment build, branch
`feat/self-hosted-deployment`. The skips are suites gated on live
credentials that skip cleanly when none are configured. (Earlier the same
day, before the build: 2,056 passing. On 2026-09-08: 1,551 passing, 38
skipped.)

## Self hosted deployment (built 2026-09-25)

Audited and built on 2026-09-25, merged to `main` the same day (`4275365`,
merge `a14bc5c`). The operator guide
is the docs site section `docs/site/self-hosted/`. The claim is
`docs/CLAIMS.md` 2.40, and the gaps are G-56 to G-63 in
`docs/VERIFICATION-GAPS.md`.

**What works, verified by running it (Docker Desktop 29.8.0, Windows 11):**

- **One command start.** `docker compose up -d --build --wait` starts
  `setup` (keys and an API key in `./parmana-local`, made inside the image),
  `postgres`, `migrate` (roles, then each migration once, recorded in
  `parmana_schema_migrations`), `seed` (shipped policies into the
  `policies` table, never overwriting) and `api` (the unchanged production
  image, `PARMANA_STORAGE=postgres`). A second start keeps keys, API keys,
  data and policies.
- **`PARMANA_STORAGE=postgres`** selects the same Postgres storage as
  `supabase`, which is unchanged (G-57).
- **Enforcement with no internet route.** `bash
docker/local/offline-check/run.sh` runs a copy of the stack on a Docker
  network with `internal: true` and passed 12 of 12 checks on each clean
  run: policy approval by a second human with a step up signature, an
  authorized refund executed, a refused refund never released, and the
  Trust Record verified with only the public keys (G-60). **Update
  (2026-09-30):** it now has 14 checks, adding a refund manager through maker
  checker so the refund carries a signed approval (G-80); run on 2026-09-30,
  14 of 14 passed.
- **Nothing to extract for "console sync".** Audit events were already
  written to the deployment's own Postgres in the same request. The item
  was dropped (G-59).

**Found while building it:**

- `scripts/apply-all-migrations.sql` is not safe to run again on a database
  with data, although its header said so. Corrected; the Compose deployment
  applies each migration once, and `npm run db:migrate` does the same for any
  Postgres, with `baseline` for a database set up with the bundle (G-61,
  closed).
- An unreachable connector gave the caller a bare `500`. It is now
  `502 EXECUTION_OUTCOME_UNKNOWN` with the transaction's identifiers, matching
  the ERRORED Execution Intent (G-63, closed).
- A new deployment authorizes nothing until its own people approve its
  policies through governance. That is kept on purpose, but the approval
  tools are TypeScript scripts that need the repository and Node.js on the
  approver's machine (G-62, open).

**Unchanged:**

- The hosted API on Vercel. `vercel.json`, `api/index.ts` and the two
  `@vercel/*` packages (loaded only when `AWS_ROLE_ARN` or
  `PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID` is set) are not used by the
  container.
- The container still does not migrate by itself. Only the Compose
  deployment does.
- There is still no SQLite storage, and none is needed.

**Verified on Linux** in CI run 36113024609 (job `self-hosted`), which
repeats on every change to the deployment files and also runs the
quickstart's commands against its documented output.

**Not yet verified:** a real downstream system instead of the stand in, and
any customer running it.

## SDKs (aligned 2026-09-25)

Both SDKs are at 1.3.0 in this repository and cover the same product
operations, including policy governance with step up signing, offline
verification in both languages, caller identity, public keys and Trust
Record listing (`docs/CLAIMS.md` 2.41, G-64). Both are published: the TypeScript SDK 1.3.0 on npm and the Python
SDK 1.3.0 on PyPI, on 2026-09-25, each checked by installing it from its
registry and rerunning the live checks. Tests: TypeScript SDK 191, Python SDK
119, all passing; each SDK passed 11 of 11 live checks against a self hosted
deployment. The route by route mapping is `docs/site/sdks/api-coverage.mdx`.

## Human approval (built 2026-09-27, on `main`, deployed)

Merged to `main` and deployed to production on 2026-09-27 (PR #46, merge `4eebd5f`).

**Every action needs a signed human approval, reads included (2026-09-30,
merged in PR #87 and deployed, `docs/CLAIMS.md` 2.47, G-80).** `PolicyValidator` refuses any policy whose approve rule does not
require an `approvalSignals` fact with `is_true` at its top level, on load and
on proposal, and `RuntimeEngine` refuses an approval with no approval verifier
configured. New versions: `github-pr-read` 1.1.0, `hubspot-deal-read` 1.0.0
(new, for `hubspot:deal-fetch`), `hubspot-deal-update` 1.1.0,
`slack-post-message` 1.1.0, and approval backed versions of every reference
policy. All of them were approved in production through maker checker on
2026-09-30 and are in effect. The rest of this section describes the state
before that change.

- A policy declares in `approvalSignals` which of its signals need a
  person's signed approval, and where the resource (a `parameters` path or
  the Intent's `target`) and, optionally, a value to cover are in the
  request. `ApprovalSignalVerifier` (`packages/approval`) enforces it for any
  action, before authorization and again at the gateway, and uses each
  approval once. HubSpot amount changes keep their own check.
- `paytm:refund` is bound to `customer-refund` 1.1.0: automatic up to 10000,
  a verified manager approval above 10000 and up to 100000, refused above.
  **Since 2026-09-28 the binding names 1.2.0** (G-75): every refund needs a
  verified manager approval, 0 or less and above 100000 are refused. **Approved
  in production on 2026-09-28**, so refunds there run under 1.2.0, as do merges
  under `github-pr-approval` 1.1.0, reads under `github-pr-read` 1.0.0 and LLM
  tool calls under `llm-tool-call` 1.1.0.
- Approvers sign on their own machine with `scripts/sign-approval.ts`, with
  an Ed25519 key from `scripts/generate-approver-key.ts`.
- **In production:** `customer-refund` 1.1.0 was approved on 2026-09-27
  18:53:40 UTC, so refunds run under 1.1.0 (the version in effect comes from
  governance, G-66). `TRUSTED_APPROVAL_ISSUERS` lists one approver,
  `manager-charak1987` (added 2026-09-28), so a refund above 10000 needs
  that approver's signature. The maker, checker and approver credentials are
  currently held by one person.
- **Refund agent (G-70, 2026-09-28):** `parmana-paytm-agent`'s `/agent/refunds`
  called Paytm itself after Parmana had already released the refund through
  its connector, so an approved refund could be paid twice; and it declared
  `customer-refund` 1.0.0, so every refund it sent was refused. Fixed and
  deployed 2026-09-28 in that repository's PR #6 (one Paytm call, version
  read from `GET /policies/in-effect`, signed approvals forwarded).
  Production `PAYTM_CONNECTOR_URL` points at the agent. A refusal through the
  agent was verified in production; an approved refund has not been
  observed live yet.
- **Does not exist:** an escalation state that holds a request for a person,
  or any notification. A refused request stays refused; the agent sends a
  new request with the approval.
- Tests on the branch, 2026-09-27: 2,195 passed, 42 skipped, 0 failed, 253
  files. Open items: `docs/REMAINING-WORK.md`, section G.

## Policy governance (built this session)

A maker-checker approval flow for changes to policy content: real
endpoints (`POST /policies/:name/:version/pending-changes`, `.../approve`,
`.../reject`), a real step-up signature layer independent of the caller's
bearer token, and real signed, hash-chained approval records
(`PolicyChangeApprovalRecord`).

An execution-time enforcement gate (`PolicyGovernanceExecutionVerifier`,
wired into `RuntimeEngine`) exists in code and can refuse execution against
a policy with no approval record, an invalid approval-record signature, or
tampered content. Since 2026-09-20 it is
enforced by default in production (relaxed only when `NODE_ENV` is `test` or `development`), and
`ExecutionGateway` fails closed on policy binding as well (`docs/CLAIMS.md` §2.36).

Signing under AWS KMS handles messages over the 4096 byte KMS raw limit by signing a fixed size
commitment (ADR-0010, `docs/CLAIMS.md` 2.37), verified live against the real KMS service on
2026-09-20. Before release the runtime proves signing works and refuses with 503 if not, and a failure
after release is reported as EXECUTION_RECORD_INCOMPLETE (ADR-0011, `docs/CLAIMS.md` 2.38). On 2026-09-21
the ordering gap G-52 was closed by Execution Intents (ADR-0012, `docs/CLAIMS.md` 2.39): a signed intent is
stored before release, release is refused with 503 EXECUTION_INTENT_UNAVAILABLE if that fails, and a missing
Trust Record (G-53) can be rebuilt with `POST /execution-intents/{id}/finalize` without calling the
connector. Verified live with a real KMS key and a real Postgres. The migration
`20260921120000_add_execution_intents.sql` must be applied before deploying. Still open: finalize cannot
rebuild a record when the execution context was not saved (409), and the SDK methods for intents shipped in SDK 1.2.0 on 2026-09-21 (G-55). An
intent reconciled by hand is closed with `POST /execution-intents/{id}/resolve` (G-54, an unsigned operator
statement).

**Current real database state** (queried directly this session, not
assumed): all 10 policies that have ever been proposed through this
system's own API are `PENDING_APPROVAL`, proposed by the same account. None
have been approved by a distinct human reviewer. Because enforcement is now on in production, executions under a policy with no
approval record are refused until that changes.

## External connectors (ADR-0013, started 2026-09-30)

Goal: connect a new external system with no change to Parmana's code. Verified against source and
production on 2026-09-30.

**Live: registrations through maker checker** (PR #92, `packages/api/src/routes/external-connectors.ts`,
migration `20260930120000_add_external_connectors.sql`, applied in production 2026-09-30, 33 applied,
0 pending). `GET /external-connectors` with the maker key returned `{"connectors":[]}` in production.
Same rules as approver changes: human callers only, maker is not checker, step up on approve and
reject. Built in namespaces (paytm, hubspot, github, slack, test) refused. The endpoint's address
is checked when proposed and when approved (`packages/shared/src/network/externalEndpointAddress.ts`).

**Releasing to a registered endpoint (step 4, 2026-10-01): live, checked in production on 2026-10-01 (step 6).**
`ExternalConnectorAwareRegistry` serves a registered capability from its active registration with
`GatewayExternalAdapter` (PR #93), the policy is bound from the registration at the version policy
governance approved, and `GET /policies/in-effect` answers for it. The SDK helpers
`verifyParmanaRelease` and `verify_parmana_release` (PR #94) are published in SDK 1.5.0 (2026-10-04).
`docs/CLAIMS.md` 2.49 claims the registration governance, and 2.50 releasing to an endpoint, after
the live check (`examples/live-checks/external-connector`). `docs/VERIFICATION-GAPS.md` G-81 fixed;
G-82, G-83 and G-84 (an approved request takes 24 to 32 seconds in production) open.

## Business validation (RFC-0023, deployed 2026-10-11)

An agent's proposal is never a business fact. Built in four phases (PRs #97 to #100), deployed to production with
their migrations, and in SDK 1.6.0 on npm and PyPI (2026-10-11). `docs/CLAIMS.md` 2.53 to 2.56.

- **Separate statuses on every decision:** authority, business validation and, for a refusal, execution, signed in
  the Execution Trust Record and Refusal Record.
- **Business signal sources:** a business system is registered through maker checker (`/business-signal-sources`);
  Parmana asks it with a signed query and accepts only answers signed with its registered Ed25519 key. A policy names
  the source of a fact in `signalSources`.
- **Authority grants:** which agent may have which action decided, within per request limits, until when, through
  maker checker (`/authority-grants`). A policy opts in with `requireAuthorityGrant`.
- **At release:** the facts and the grant are signed into the authorization and re-checked by the gateway; an
  external connector's release carries the facts as `conditions`.

**Verified in production on 2026-10-11** by two live checks with test policies and endpoints that act on nothing:
`examples/live-checks/authority-grant` (4 of 4: refused before a grant, approved within it, refused above its limit
and after its revoke) and `examples/live-checks/business-signal-source` (4 of 4: a deployed demo source's signed
answer approved a paid invoice; unpaid, contradicted and unknown invoices refused as required).

**Not in effect for real actions yet:** no shipped policy declares a source or requires a grant, so production
decisions for refunds and the other built in capabilities are unchanged. No real business system is connected
(G-92); cumulative grant limits are not built (G-93, design in RFC-0023); built in connectors get only the gateway
re-check at release (G-94). What is left: `docs/REMAINING-WORK.md` section L.

## Public sandbox (ADR-0014, live 2026-10-02)

`https://parmana-sandbox.vercel.app`: the same `main` as production with `PARMANA_SANDBOX=true`, its own Supabase
project (`zkrfrfyokkpfwghoohne`), keys and demo approver. One capability, `sandbox:receipt`, registered as an external
connector to `https://parmana-sandbox-receipt.vercel.app/api/release`, which acts on nothing. Published demo key:
caller `sandbox-visitor`, allowed only `sandbox:receipt`. Live check passed 2026-10-02 (`docs/CLAIMS.md` 2.51). Docs:
`docs/site/playground.mdx`, the first OpenAPI server. Retention: a daily `pg_cron` job in the sandbox database deletes what visitors sent more than 7 days
ago (`deploy/sandbox/retention.sql`, kit stage `Retention`). Not set up: the custom domain
`sandbox.parmanasystems.com`. Vercel deploys it on every merge to `main`, as production.

## AgenTrust TRACE listing (merged 2026-10-12)

Parmana is listed in the AgenTrust integrations repository as a TRACE external evidence source:
[agentrust-io/integrations#294](https://github.com/agentrust-io/integrations/pull/294), merged as `6de4cb9`, adds
`integrations/parmana-server` (tier `community`, no conformance level). It maps Parmana's signed records to TRACE
references; its fixtures come from `docs/evaluation/agentrust-refund` (mock connector results). Not a certification.
`docs/CLAIMS.md` 3.23.
Verified tier requested on 2026-10-13 (follow-up PR from branch `parmana-verified`, pinning `parmana` 1.6.0);
independently reproduced by an AgenTrust maintainer on 2026-10-14 (#313: references regenerated byte for byte, 18
tests passed); #313 merged as `1aac6c8`; the tier change follows in a separate maintainer PR, so the tier is still `community`.

## On disk, but not reachable

15 policy names exist under `policies/` (checked 2026-09-28). 5 are bound to a
capability a registered connector can invoke (`CapabilityPolicyBinding.ts`):
`hubspot-deal-update`, `github-pr-read` (`github:pr-fetch`, added 2026-09-28),
`github-pr-approval` (`github:pr-merge`; 1.1.0, which needs a signed approval,
added 2026-09-28), `customer-refund` (1.0.0 and 1.1.0 on disk; the version in
effect is the one most recently approved, 1.1.0 in production) and
`slack-post-message`. The others
have no connector that can invoke them today. They are reference and example
content, not live surface.

## Dead code: deleted (2026-09-08)

Everything below was confirmed to have zero non-self references (rechecked
fresh immediately before deletion, not assumed from this document's own
first draft) and has been removed:

- `@parmana/receipt` — the entire package
- `packages/runtime/src/policy/*` — a second, structurally incompatible
  `PolicyRouter`/`PolicyEngine`/`PolicyValidator` implementation, distinct
  from the real one in `@parmana/policy`; had a live bug
  (`PolicyRegistry.getPolicy()` ignored its own lookup and always
  constructed a fresh `PolicyEngine`), harmless only because nothing called
  it — plus its own dedicated test, `tests/unit/policy-router.test.ts`
- `packages/runtime/src/ports/*`, `services/DecisionService.ts`,
  `services/override-service.ts`, `RuntimeGatewayAuthenticator.ts` (0 bytes)
- `packages/storage`'s `StorageEngine`/`StorageBuilder`/`AppendOnlyLedger`/
  `LedgerEntry`/`LedgerSerializer` subsystem and its three toy in-memory
  repositories — a second, incompatible, in-memory-only "ledger," unrelated
  to the real audit trail — plus its three dedicated tests, and
  `@parmana/replay`'s `ReplayContext.ts` (its only real consumer)
- Eight orphaned files in `@parmana/crypto` (`LocalFileKeyManager.ts`, the
  four `GatewayAuthentication*.ts` files, `modules/CryptoModule.ts` +
  `BuiltinCryptoModule.ts`, a duplicate `KeyProvider` interface)
- Five dead types in `@parmana/shared` (`types/Verification.ts`,
  `ExecutionStatus.ts`, `ExecutionProof.ts`, `ExecutionTransaction.ts`,
  `Metadata.ts` — the last three were exported from the package root despite
  zero consumers anywhere in this monorepo; their export lines were removed
  too)

**Two things this document originally flagged turned out not to be dead on
closer inspection, and were kept:** `packages/runtime/src/components/
ReceiptComponent.ts` is a deliberately-kept, documented, exported extension
point (not wired into the default pipeline, but genuinely used/tested), and
`packages/crypto/scripts/generate-keypair.ts` is actually invoked by
`examples/04-verified-execution/run.ts` — a real caller this document missed
the first time. Full repo `npx tsc -b` and `npx vitest run` clean after the
cleanup: 1,539 passed, 38 pre-existing skips, 0 failed.

## Explicitly does not exist in this codebase

Stated plainly because each of these has been asserted as real in prompts
handed to this session, and none of them are:

- **No Stripe connector code anywhere.** The only Stripe references in this
  repo are inside one architecture doc's own test allowlist, explicitly
  marked as a hypothetical "how you'd add a new vendor" walkthrough — never
  real code.
- **No Razorpay connector.** One existed previously and was deliberately
  deleted; only a few dangling code comments referencing it remain.
- **No multi-tenant isolation of any kind.** A single optional
  `tenantId?: string` field exists on transaction metadata
  (`packages/shared/src/domain/metadata.ts`) with zero enforcement, zero
  row-level scoping by it, and zero isolation logic anywhere in the
  request path.
- **No performance/load-testing harness or benchmark results exist in this
  repo.** No throughput or latency number attributed to this system has any
  basis in code here.
- **No `packages/cli`.** Every operational task (key generation, step-up
  signing, policy approval) is a plain `npx tsx scripts/*.ts` invocation or
  a direct HTTP call — there is no compiled CLI binary.

## Known structural limitations, read directly from the implementation

- Rate limiting (`express-rate-limit`) is per-process, in-memory by
  default: a fleet of N machines has N independent limits, not one
  shared limit, **unless `DATABASE_URL` is configured**, in which case
  both the `/execute` and `/health`,`/ready` limiters share a durable
  Postgres-backed count fleet-wide (`PostgresRateLimitStore`, added
  2026-09-10, `docs/VERIFICATION-GAPS.md` G-41).
- Session/credential state (`InMemoryGatewaySessionStore`,
  `InMemorySessionCredentialVault`) is in-memory, single-process. Not a
  limitation in practice: both are strictly intra-request objects,
  created and consumed within one synchronous `POST /execute` call, with
  no HTTP response or second endpoint that could ever hand one back to
  this process later. Investigated directly 2026-09-10 (traced every
  caller) after an external audit framed this as needing persistence;
  confirmed it does not. See `docs/VERIFICATION-GAPS.md`'s "Gaps checked
  and found not applicable" section.
- `HttpExecutionSystem`'s `timeout` option is declared
  (`ExecutionSystemClientOptions.ts`) but never referenced anywhere in the
  implementation — confirmed by grep: not enforced.
- `DefaultExecutionSystem.execute()` unconditionally returns `success: true`
  for any request — a no-op stub. Not used by any real connector path
  today, but would silently "succeed" everything if ever wired in by
  mistake.
- Capability to policy binding covers 6 capabilities and 4 of the 14 policy
  names. A fail closed startup check (`assertConnectorCapabilitiesBound`)
  stops a _newly registered_ capability from shipping unbound. The binding pins the policy name in code; where policy governance is enforced, the version in effect is the one most recently approved (G-66, on `main` since 2026-09-27), so a new version needs no deploy.
- Signing keys are read from disk files (`FileKeyProvider`) at a fixed
  default key ID; there is no key-rotation mechanism in code.
