# Parmana verification gaps: folder

Source: pavancharak/parmana-core docs/internal/VERIFICATION-GAPS.md at commit d1d63c6.
Each gap is in its own file, `<G-id>.md`, with the exact entry text.

Status key (remaining 128 entries): CLAIMED CLOSED (mechanical check) = entry says closed or fixed, and its cited code and tests exist and pass; NEEDS REVIEW = not checked deeply; STALE PATHS = a cited path no longer exists.

Status key: CONFIRMED, CONSISTENT, PARTLY CHANGED (the code differs from part of the entry), NOT VERIFIABLE (depends on production state or timing), NOT IN CORE (in parmana-connect, outside this session's access), NOT CHECKED (not reviewed in this pass).

Test run: 403 test files, 0 failed; 3789 tests passed, 0 failed, 106 skipped (Node 24.22.1).

| Gap | Status | Summary | Cited missing paths | File |
|---|---|---|---|---|
| G-25 | STALE PATHS | Truncated credential fragments reached the caller-visible `POST /execute` response. | 3 | [G-25.md](G-25.md) |
| G-56 | CLAIMED CLOSED (mechanical check) | There was no one command local deployment. CLOSED 2026-09-25.** Before: no Docker | 0 | [G-56.md](G-56.md) |
| G-57 | CLAIMED CLOSED (mechanical check) | The storage provider names did not match what the code does. CLOSED 2026-09-25. | 0 | [G-57.md](G-57.md) |
| G-58 | CLAIMED CLOSED (mechanical check) | Migrations were not applied at start, and one migration assumes Supabase roles. | 0 | [G-58.md](G-58.md) |
| G-59 | CLAIMED CLOSED (mechanical check) | "Console sync" named in the 2026-09-25 plan did not exist. CLOSED 2026-09-25, not | 0 | [G-59.md](G-59.md) |
| G-60 | STALE PATHS | Running with no outbound network had not been tested. CLOSED 2026-09-25.** Before: | 1 | [G-60.md](G-60.md) |
| G-61 | FIXED | The migration bundle is not safe to run again on a database that holds data. FOUND, | 0 | [G-61.md](G-61.md) |
| G-62 | CLAIMED CLOSED (mechanical check) | Approving policies on a self hosted deployment needed the repository's signing script | 0 | [G-62.md](G-62.md) |
| G-63 | CLAIMED CLOSED (mechanical check) | An authorized action whose connector cannot be reached returned a bare `500`. CLOSED 2026-09-25, | 0 | [G-63.md](G-63.md) |
| G-64 | CLAIMED CLOSED (mechanical check) | The two SDKs did not cover the same API, and neither covered policy governance. CLOSED | 0 | [G-64.md](G-64.md) |
| G-65 | CONFIRMED (no search hit) | A refused request cannot be escalated to a person and then approved. FOUND 2026-09-27, | 1 | [G-65.md](G-65.md) |
| G-67 | CLAIMED CLOSED (mechanical check) | A valid Approval Artifact could never pass the Execution Gateway, so an approved HubSpot | 0 | [G-67.md](G-67.md) |
| G-68 | CLAIMED CLOSED (mechanical check) | An approver could not be provisioned on Vercel. FOUND and CLOSED 2026-09-27, | 0 | [G-68.md](G-68.md) |
| G-69 | CLAIMED CLOSED (mechanical check) | On Vercel, a malformed JSON body returned 500 instead of 400. FOUND and CLOSED | 0 | [G-69.md](G-69.md) |
| G-66 | PARTLY CHANGED | The policy version for each action is fixed in code, so a policy change needs a | 0 | [G-66.md](G-66.md) |
| G-70 | STALE PATHS | The refund agent paid an approved refund twice: once through Parmana's connector, then | 2 | [G-70.md](G-70.md) |
| G-71 | STALE PATHS | Only one refund per Paytm transaction can go through Parmana, and the refund reason never | 4 | [G-71.md](G-71.md) |
| G-72 | STALE PATHS | The HubSpot state check signed its own deal fetch with the local key file, so under | 4 | [G-72.md](G-72.md) |
| G-73 | CLAIMED CLOSED (mechanical check) | An agent could authorize a pull request merge by declaring GitHub facts true. FOUND | 0 | [G-73.md](G-73.md) |
| G-74 | CLAIMED CLOSED (mechanical check) | `llm-tool-call` approves a tool call when the caller declares `humanApproval: true`. FOUND | 0 | [G-74.md](G-74.md) |
| G-75 | STALE PATHS | An agent could authorize a refund up to 10000 by declaring the order eligible and the fraud | 2 | [G-75.md](G-75.md) |
| G-76 | PARTLY CHANGED | An agent could post any text to any Slack channel the bot is in, by declaring the channel | 4 | [G-76.md](G-76.md) |
| G-77 | CLAIMED CLOSED (mechanical check) | A refusal reason tells an agent which caller declared fact to flip. FOUND 2026-09-28, | 0 | [G-77.md](G-77.md) |
| G-78 | CLAIMED CLOSED (mechanical check) | The unauthenticated routes that check signatures or write data had no rate limit. FOUND | 0 | [G-78.md](G-78.md) |
| G-79 | CLAIMED CLOSED (mechanical check) | CI's policy approval check never checked anything. FOUND 2026-09-28, `pre-production` | 0 | [G-79.md](G-79.md) |
| G-80 | STALE PATHS | Most actions were authorized with no human approval at all. FOUND 2026-09-30, `blocks-pilot` | 1 | [G-80.md](G-80.md) |
| G-81 | CLAIMED CLOSED (mechanical check) | A registered external connector receives no release, and its policy is not bound yet. FOUND | 0 | [G-81.md](G-81.md) |
| G-82 | NOT VERIFIABLE | What an external endpoint answers is its claim, not proof. FOUND 2026-09-30, `pre-production` | 0 | [G-82.md](G-82.md) |
| G-83 | CLAIMED CLOSED (mechanical check) | The release transport connects to the first checked address only. FOUND 2026-09-30, | 0 | [G-83.md](G-83.md) |
| G-84 | NOT VERIFIABLE | An approved request takes 24 to 32 seconds in production. FOUND 2026-10-01 in the ADR-0013 | 0 | [G-84.md](G-84.md) |
| G-85 | STALE PATHS | The Python SDK cannot verify its own decoded record when `previousChainHash` is `null`. | 1 | [G-85.md](G-85.md) |
| G-86 | NOT VERIFIABLE | All visitor data in the public sandbox was deleted around the retention job's first run, cause not | 1 | [G-86.md](G-86.md) |
| G-87 | FIXED | A `POST /execute` or `POST /transactions` body without `metadata`, `intent` or `policy` returns a bare | 0 | [G-87.md](G-87.md) |
| G-88 | CLAIMED CLOSED (mechanical check) | A policy named `..` let `FilePolicyRepository` read and write outside the policy directory. FOUND | 0 | [G-88.md](G-88.md) |
| G-89 | CLAIMED CLOSED (mechanical check) | An edited Execution with its `chainSignature` removed passed the execution chain check. FOUND 2026-10-05 | 0 | [G-89.md](G-89.md) |
| G-90 | CLAIMED CLOSED (mechanical check) | `PolicyValidator` threw a `TypeError` instead of refusing a malformed policy. FOUND 2026-10-06 by | 0 | [G-90.md](G-90.md) |
| G-91 | STALE PATHS | The offline verifier threw on a malformed `signatures` field. FOUND 2026-10-06 by fuzzing, CLOSED | 1 | [G-91.md](G-91.md) |
| G-92 | CONSISTENT | Business validation (RFC-0023): sources can be registered and are verified, but none is connected. | 0 | [G-92.md](G-92.md) |
| G-93 | CONSISTENT | Per-agent authority grants (RFC-0023 phase 3) are opt in, and their limits are per request. | 0 | [G-93.md](G-93.md) |
| G-94 | CONSISTENT | What a decision rests on is re-checked at release, but "execute only if still valid" at the system is the | 0 | [G-94.md](G-94.md) |
| G-24 | STALE PATHS | Policy-evaluation signals were never bound to the executed Intent: the most | 13 | [G-24.md](G-24.md) |
| G-1 | CLAIMED CLOSED (mechanical check) | Duplicate Business Transaction ID: real, deterministic data-loss race in | 0 | [G-1.md](G-1.md) |
| G-2 | CLAIMED CLOSED (mechanical check) | No CI runs the main test suite. CLOSED in the 2026-07-17 session.** See "Gaps closed | 0 | [G-2.md](G-2.md) |
| G-3 | STALE PATHS | Live external credentials are used by default, unlabeled, on every local test run. | 4 | [G-3.md](G-3.md) |
| G-30 | STALE PATHS | `github:pr-fetch`/`github:pr-merge` were wired into production | 2 | [G-30.md](G-30.md) |
| G-47 | STALE PATHS | `PolicyGovernanceExecutionVerifier` treats a signature-tamper signal | 1 | [G-47.md](G-47.md) |
| G-48 | STALE PATHS | `createExecutionGateway.ts` passed an unconditional `new FileKeyProvider()` as | 1 | [G-48.md](G-48.md) |
| G-49 | STALE PATHS | `express-rate-limit` v8's `ERR_ERL_STORE_REUSE` violated the library's documented | 1 | [G-49.md](G-49.md) |
| G-50 | CONFIRMED | Policy approver authority is not scoped. Any provisioned human checker can approve any | 0 | [G-50.md](G-50.md) |
| G-51 | PARTLY CHANGED | Only the HubSpot capability has an independent signal state verifier, so most policy signals are | 0 | [G-51.md](G-51.md) |
| G-52 | PARTLY CHANGED | The connector can be called before the Execution Trust Record can be signed, so a signing | 0 | [G-52.md](G-52.md) |
| G-53 | CONFIRMED (as traced) | There is no way to rebuild a missing Execution Trust Record for an action that was | 0 | [G-53.md](G-53.md) |
| G-54 | CLAIMED CLOSED (mechanical check) | There is no operation to close an Execution Intent that was reconciled by hand. CLOSED | 0 | [G-54.md](G-54.md) |
| G-55 | CLAIMED CLOSED (mechanical check) | The SDKs cannot verify or manage Execution Intents. CLOSED 2026-09-21, gap 63; | 0 | [G-55.md](G-55.md) |
| G-4 | CONSISTENT (partly closed) | Hybrid/post-quantum signing was dead configuration in production. PARTIALLY | 0 | [G-4.md](G-4.md) |
| G-5 | STALE PATHS | `OverrideService` has zero test coverage and no HTTP route. | 4 | [G-5.md](G-5.md) |
| G-6 | STALE PATHS | `packages/receipt` has zero test files. STALE CLASS NAMES CORRECTED (Phase 3D | 3 | [G-6.md](G-6.md) |
| G-26 | STALE PATHS | External audit of `docs/internal/CLAIMS.md` 2.5/2.6 ("Execution Evidence / Receipt") reported | 2 | [G-26.md](G-26.md) |
| G-27 | STALE PATHS | `payments:execute` (vendor-payment) was a gap-in-waiting against the public | 5 | [G-27.md](G-27.md) |
| G-28 | CONFIRMED | `PARMANA_AUTH_DISABLED=true`'s exact scope, precisely documented (previously | 0 | [G-28.md](G-28.md) |
| G-7 | FIXED | `execution-failure.integration.test.ts` is permanently `describe.skip`ped**, not | 0 | [G-7.md](G-7.md) |
| G-8 | FIXED | Several error branches remain untested, all reachable only via direct library use, | 0 | [G-8.md](G-8.md) |
| G-9 | CONFIRMED | `ExecutionControlService` and `SessionCredentialSecureConnector` each independently | 0 | [G-9.md](G-9.md) |
| G-32 | CLAIMED CLOSED (mechanical check) | Signing key for Execution Authorizations was shared across every tenant in a | 0 | [G-32.md](G-32.md) |
| G-33 | FIXED | `boundSignals` coverage on rule-referenced facts was advisory (a `console.warn` at | 0 | [G-33.md](G-33.md) |
| G-34 | STALE PATHS | `SupabaseClientFactory` (the supabase-js/PostgREST client class) had zero remaining | 2 | [G-34.md](G-34.md) |
| G-35 | STALE PATHS | `dilithium3` (the internal signature-algorithm identifier) had no way for a new | 1 | [G-35.md](G-35.md) |
| G-36 | STALE PATHS | `@supabase/supabase-js` follow-on dependency-hygiene pass (flagged, not required, by | 2 | [G-36.md](G-36.md) |
| G-37 | CLAIMED CLOSED (mechanical check) | G-33's fail-closed `boundSignals` change (`PolicyValidator.validate()` now throws for | 0 | [G-37.md](G-37.md) |
| G-38 | STALE PATHS | `PolicyOutcome`/`PolicyAction` carried a third value, `REQUIRE_OVERRIDE`, that no real | 2 | [G-38.md](G-38.md) |
| G-39 | CLAIMED CLOSED (mechanical check) | No detection existed for two policy rules whose conditions could both be true for the | 0 | [G-39.md](G-39.md) |
| G-42 | CLAIMED CLOSED (mechanical check) | `ExecutionAuditSink` was in-memory only (`MemoryExecutionAuditSink`) in production, | 0 | [G-42.md](G-42.md) |
| G-43 | STALE PATHS | `parmana-paytm-agent` (a separate repository this codebase forwards Paytm refund | 2 | [G-43.md](G-43.md) |
| G-13 | CLAIMED CLOSED (mechanical check) | `MemoryNonceStore` and `InMemoryCallerAuditSink` both lose all state on process | 0 | [G-13.md](G-13.md) |
| G-14 | STALE PATHS | The test that proves G-13 closed could silently not run at all, with a green | 4 | [G-14.md](G-14.md) |
| G-15 | STALE PATHS | A default `npm test` on a machine with live Supabase credentials configured either | 3 | [G-15.md](G-15.md) |
| G-19 | STALE PATHS | `POST /execute` returns HTTP 500 for an expected policy rejection, and neither the | 1 | [G-19.md](G-19.md) |
| G-29 | CLAIMED CLOSED (mechanical check) | Structural/admission-time rejections — malformed input, missing required fields, | 0 | [G-29.md](G-29.md) |
| G-31 | STALE PATHS | Runtime signals were verified once, before authorization, but never re-checked at | 1 | [G-31.md](G-31.md) |
| G-44 | STALE PATHS | `PolicyEngine.evaluate()`'s structured rule-match trace was computed, then discarded | 1 | [G-44.md](G-44.md) |
| G-45 | STALE PATHS | The policy-governance evidence-anchor chain (G-24 / §2.27 / | 1 | [G-45.md](G-45.md) |
| G-46 | CLAIMED CLOSED (mechanical check) | No evidence recorded whether a connector's response included an independent, | 0 | [G-46.md](G-46.md) |
| G-10 | FIXED | CLAIMS.md citations that are vague or indirect** rather than pointing at a specific | 0 | [G-10.md](G-10.md) |
| G-11 | CLAIMED CLOSED (mechanical check) | PARTIALLY CLOSED in the 2026-07-17 session.** `EXECUTION_AUTHORIZATION_TTL_SECONDS`, | 0 | [G-11.md](G-11.md) |
| G-95 | FIXED | The Policy Governance integrity check at startup could not stop a server from starting on a mismatch.** `verif | 0 | [G-95.md](G-95.md) |
| G-96 | CLAIMED CLOSED (mechanical check) | The full policy approval scan could report success having checked nothing.** `findAllPolicyFiles()` in `script | 0 | [G-96.md](G-96.md) |
| G-97 | CLAIMED CLOSED (mechanical check) | The governance UI would send its API key in clear text to any configured base URL.** `loadGovernanceUiConfig() | 0 | [G-97.md](G-97.md) |
| G-98 | FIXED | The Vercel serverless entry did not refuse startup on a Policy Governance integrity mismatch, and skipped the  | 0 | [G-98.md](G-98.md) |
| G-99 | CLAIMED CLOSED (mechanical check) | `POST /transactions` did not check `metadata.tenantId` against the caller's allowed tenants.** `POST /execute` | 0 | [G-99.md](G-99.md) |
| G-100 | CLAIMED CLOSED (mechanical check) | Connector credentials could be sent to an unchecked base URL, and a 2xx non-JSON merge or update counted as su | 0 | [G-100.md](G-100.md) |
| G-101 | FIXED | The TypeScript SDK accepted any endpoint and printed its API key, and the SDKs trusted a non-boolean `valid` a | 0 | [G-101.md](G-101.md) |
| G-102 | FIXED (code); live database not verifiable | Smaller leaks and gaps found by the audit.** The public `/ready` route returned database error text. The Pytho | 0 | [G-102.md](G-102.md) |
| G-103 | FIXED | A signed authorization released for a denied decision.** The gateway verified the signature, expiry, content h | 0 | [G-103.md](G-103.md) |
| G-104 | FIXED | The in-process release service trusted the caller's verification flags.** `ExecutionControlService.execute` re | 0 | [G-104.md](G-104.md) |
| G-105 | CLAIMED CLOSED (mechanical check) | Test and development environments skipped policy governance by default.** The approval-record check was relaxe | 0 | [G-105.md](G-105.md) |
| G-106 | CLAIMED CLOSED (mechanical check) | A published policy version could be overwritten in place.** `FilePolicyRepository.save` replaced whatever was  | 0 | [G-106.md](G-106.md) |
| G-107 | CLAIMED CLOSED (mechanical check) | The HubSpot verification fetch carried no policy hash.** The HubSpot signal-state verifier signs its own `hubs | 0 | [G-107.md](G-107.md) |
| G-108 | CLAIMED CLOSED (mechanical check) | The caller audit chain cannot detect deleting its newest row.** The chain links each row to its predecessor, s | 0 | [G-108.md](G-108.md) |
| G-109 | CLAIMED CLOSED (mechanical check) | Caller authentication could be disabled and the demo approver enabled in production.** `PARMANA_AUTH_DISABLED= | 0 | [G-109.md](G-109.md) |
| G-110 | CLAIMED CLOSED (mechanical check) | There is no revocation of a single authorization.** Revocation is per signing key (`key-expiry.json`) and per  | 0 | [G-110.md](G-110.md) |
| G-111 | FIXED (containment) | The HubSpot verification helper approves its own fetch.** `executeHubSpotCapability` builds an authorization w | 0 | [G-111.md](G-111.md) |
| G-112 | CLAIMED CLOSED (mechanical check) | The offline verifier loads the repository `.env`.** The verification package imports `@parmana/shared`, whose  | 0 | [G-112.md](G-112.md) |
| G-113 | CLAIMED CLOSED (mechanical check) | The execution-boundary signal check fails open during bootstrap.** `LateBoundSignalStateVerifier.findViolation | 0 | [G-113.md](G-113.md) |
| G-114 | CLAIMED CLOSED (mechanical check) | The `legacyInsecure` connector option skips the session credential and audit requirement.** `GatewayConnectorR | 0 | [G-114.md](G-114.md) |
| G-115 | STALE PATHS | End-to-end proof audit covered only the Paytm refund path.** Fix: the same gate conditions (no proof, forged s | 1 | [G-115.md](G-115.md) |
| G-116 | CLAIMED CLOSED (mechanical check) | The startup governance integrity check was not exercised by the proof audit.** Fix: Test 4 now signs a real ap | 0 | [G-116.md](G-116.md) |
| G-117 | CLAIMED CLOSED (mechanical check) | The production stores and signing backends were not exercised by the proof audit.** Fix: the Postgres nonce st | 0 | [G-117.md](G-117.md) |
| G-118 | CONFIRMED OPEN | The attestation key that authorizes the in-process release path lives in the process that calls it.** `createG | 0 | [G-118.md](G-118.md) |
| G-119 | NOT VERIFIABLE | Hybrid signing is not live on any deployment.** Production runs `CRYPTO_MODE=single`, so its records carry onl | 0 | [G-119.md](G-119.md) |
| G-120 | CONFIRMED | A schema version 2 record can be downgraded by anyone who can write to storage.** `schemaVersion` is covered b | 0 | [G-120.md](G-120.md) |
| G-121 | PARTLY CHANGED | Verifiers outside this repository read only schema version 2.** The public verifier 0.3.0 reads schema version | 0 | [G-121.md](G-121.md) |
| G-122 | CLAIMED CLOSED (mechanical check) | Parmana has no operator kill switch, and no fresh check that a stop is in force.** The only stop controls are  | 0 | [G-122.md](G-122.md) |
| G-123 | FIXED | Production policy approvals were refused: the Vercel entry did not pass the checker scope.** Found 2026-10-21  | 0 | [G-123.md](G-123.md) |
| G-124 | CONSISTENT | The server trusted certificates from eMudhra's compromised intermediate CA keys.** Found 2026-10-23. In Octobe | 0 | [G-124.md](G-124.md) |
| G-125 | PARTLY CHANGED | A retry after a lost response cannot recover the outcome of a mutating call.** The execution path consumes the | 2 | [G-125.md](G-125.md) |
| G-126 | FIXED | A loopback `http://` connector base URL was accepted in production.** `readConnectorBaseUrl` (`packages/api/sr | 0 | [G-126.md](G-126.md) |
| G-127 | CLAIMED CLOSED (mechanical check) | A revoked caller API key stayed valid until the server restarted.** Caller keys were loaded once at startup (` | 0 | [G-127.md](G-127.md) |
| G-128 | CONFIRMED OPEN | Connector credentials are readable by code on the same host.** In env mode, the connector credential providers | 0 | [G-128.md](G-128.md) |
| G-129 | PARTLY CHANGED | Callers (AI agents, applications or people) that reach your systems directly are not checked or recorded by Pa | 0 | [G-129.md](G-129.md) |
| G-130 | NOT IN CORE | The bearer path to the connector is open unless `PARMANA_RELEASE_ONLY` is set.** The connector accepts a beare | 1 | [G-130.md](G-130.md) |
| G-131 | NOT IN CORE | Releases above 4096 bytes were refused.** parmana-core signs a release over 4096 bytes as a SHA-512 commitment | 1 | [G-131.md](G-131.md) |
| G-132 | NOT IN CORE | A repeated release was refused with 403, not answered with its first result.** parmana-core's reference (`type | 1 | [G-132.md](G-132.md) |
| G-133 | CONFIRMED (code exists) | No live run between parmana-core and parmana-connect.** External connector registration requires an endpoint U | 0 | [G-133.md](G-133.md) |
| G-134 | NOT IN CORE | The connector’s production public key is not installed or pinned.** parmana-connect's README says its real pub | 0 | [G-134.md](G-134.md) |
| G-135 | CONFIRMED OPEN | Approvals can be rubber-stamped under volume.** Every write needs a signed human approval, but nothing limits  | 0 | [G-135.md](G-135.md) |
| G-136 | CONFIRMED OPEN | The kill switch has no safe pause state.** The operator kill switch stops all new execution and approvals at o | 0 | [G-136.md](G-136.md) |
| G-137 | CONFIRMED OPEN | No risk class is assigned to AI systems or their policies.** The draft CERT-In AI security audit guidelines cl | 0 | [G-137.md](G-137.md) |
| G-138 | PARTLY CHANGED | No alerting or export on approvals, refusals and kill switch trips.** Parmana records each of these as a signe | 0 | [G-138.md](G-138.md) |
| G-139 | CONFIRMED OPEN | No export is designed for a six-hour incident reporting window.** The draft CERT-In guidelines require AI secu | 0 | [G-139.md](G-139.md) |
| G-140 | CONFIRMED OPEN | Memory and reasoning are not recorded.** Parmana records actions and decisions. It does not record what the ag | 0 | [G-140.md](G-140.md) |
| G-141 | PARTLY CHANGED | Content the agent reads can carry instructions.** Each write still needs a signed human approval, and the agen | 0 | [G-141.md](G-141.md) |
| G-142 | CLAIMED CLOSED (mechanical check) | The inbound check did not evaluate the capability's policy. Resolved.** `POST /v1/inbound/checks` (claim 3.30) | 0 | [G-142.md](G-142.md) |
| G-143 | CLAIMED CLOSED (mechanical check) | Inbound records do not carry the policy name or version, or the approver.** The columns exist (claim 3.31). St | 0 | [G-143.md](G-143.md) |
| G-144 | PARTLY CHANGED | Inbound approvals rest only on grant limits, not on facts the business confirms.** Today the check reads no de | 0 | [G-144.md](G-144.md) |
| G-145 | CLAIMED CLOSED (mechanical check) | The probe key is rotated by hand, and the server does not check it at startup.** A mismatch between the produc | 0 | [G-145.md](G-145.md) |
| G-146 | CLAIMED CLOSED (mechanical check) | No business system calls the inbound check, and no probe checks that a direct call is refused.** The check exi | 0 | [G-146.md](G-146.md) |
| G-147 | CLAIMED CLOSED (mechanical check) | A policy decision has no insufficient-evidence outcome: missing signals evaluate as false (R5).** In `packages | 0 | [G-147.md](G-147.md) |
| G-148 | CLAIMED CLOSED (mechanical check) | Decisions do not name the comparison method or version behind the verdict (R3).** `PolicyEngine.evaluate` retu | 0 | [G-148.md](G-148.md) |
| G-149 | CLAIMED CLOSED (mechanical check) | Authorizations with no signals hash skip the release-time signal and approval checks.** `ExecutionGateway.veri | 0 | [G-149.md](G-149.md) |
| G-150 | CLAIMED CLOSED (mechanical check) | CLAIMS.md section 5 says nothing notifies anyone on refusal, but the approval notifier does.** Section 5 says  | 0 | [G-150.md](G-150.md) |
| G-156 | STALE PATHS | The manifest's read or write label is not enforced, so a capability marked "read" can send a write.** In parma | 2 | [G-156.md](G-156.md) |
| G-151 | CONFIRMED OPEN | No approved inventory of tool and MCP connections for agents.** Parmana keeps no approved inventory of the too | 0 | [G-151.md](G-151.md) |
| G-152 | CONFIRMED OPEN | Log retention of 180 days is not defined or enforced.** Parmana defines no minimum retention period for its si | 0 | [G-152.md](G-152.md) |
| G-153 | PARTLY CHANGED | No agent rollback, and no guard against automatic restart after an emergency stop.** The kill switch stops new | 0 | [G-153.md](G-153.md) |
| G-154 | CONFIRMED OPEN | No AI bill of materials (AIBOM) or model-artifact integrity check.** Parmana does not produce an AI bill of ma | 0 | [G-154.md](G-154.md) |
| G-155 | CONFIRMED OPEN | No review-and-challenge flow for AI decisions (contestability).** Parmana records approvals and refusals, but  | 0 | [G-155.md](G-155.md) |
| G-157 | CLAIMED CLOSED (mechanical check) | A request that omitted a fact could be approved by a later rule (partly closes G-147).** `PolicyEngine.evaluat | 0 | [G-157.md](G-157.md) |
| G-158 | NOT VERIFIABLE | A commit bypassed the preflight.** Commit `66c1e50` (the PC-004 fix on `claude/new-session-ml5hdm`) was made w | 0 | [G-158.md](G-158.md) |
| G-159 | CONSISTENT | Three tests depend on the Node build's certificate store.** `packages/api/tests/unit/distrustCompromisedRoots. | 0 | [G-159.md](G-159.md) |
| G-160 | CLAIMED CLOSED (mechanical check) | Decisions recorded at method version `"1"` can replay to a different verdict.** A request that omitted a fact  | 0 | [G-160.md](G-160.md) |
| G-161 | CLAIMED CLOSED (mechanical check) | Private signing keys reach the server through environment variables, in production as well as Preview.** `PARM | 0 | [G-161.md](G-161.md) |
| G-162 | CLAIMED CLOSED (mechanical check) | Schema version 3 (whole-record) records cannot be verified by the SDKs.** Schema version 3 signs every top-lev | 0 | [G-162.md](G-162.md) |
