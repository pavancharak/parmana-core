# Verification Gaps

Version: 1.0
Status: Public
Companion to `docs/CLAIMS.md`

---

## Purpose

`CLAIMS.md` documents what this repository proves. This document is its complement: every
place a claim, a code path, or a piece of production behavior is _not_ independently
verified today. The goal is to know exactly where the unproven edges are before an external
review finds them first.

Same discipline as `CLAIMS.md`: every entry cites a file, a line, or a specific test (or
names the absence of one). Severity is one of three tiers:

- **blocks-pilot**: a real correctness, security, or operational gap a pilot customer or
  their security team would reasonably block on.
- **pre-production**: real, worth closing before general availability, not urgent enough
  to block a scoped pilot.
- **cosmetic**: a documentation, naming, or observability gap with no behavioral
  consequence.

This audit was run against commit `651497a`, `npm test` reporting 345 passed, 1 skipped, 85
test files, coverage measured via `npm run coverage` (`@vitest/coverage-v8`).

## Open issues at a glance (updated 2026-10-11)

Everything not listed here is closed, with its evidence in its own entry below.

| Entry      | What is open                                                                                                                                                                                                                                                                                                                                                                                                                       | Severity                      | Status                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| G-4        | Hybrid (Ed25519 and ML-DSA-65) signing covers Trust Records and receipts only; refusal records, audit events and authorizations are signed with one algorithm.                                                                                                                                                                                                                                                                     | pre-production                | Decision D-2 required                                                                   |
| G-65       | Nothing holds a refused request for review in the server; an approver learns of it through the optional `approval.needed` webhook (2.46) or by query.                                                                                                                                                                                                                                                                              | pre-production                | Partly closed, see the 2026-10-06 update                                                |
| G-66       | Binding an action to a different policy name, or adding a built in capability, still needs a deploy. A new policy version, an approver key and an external connector do not.                                                                                                                                                                                                                                                       | pre-production                | Partly closed, see the 2026-10-06 update                                                |
| G-9        | Execution Control and the secure connector each write an audit record for the same execution.                                                                                                                                                                                                                                                                                                                                      | cosmetic                      | Open                                                                                    |
| G-50       | A policy change approver, or an approval issuer, is not limited to particular policies or actions: any provisioned approver can approve any.                                                                                                                                                                                                                                                                                       | pre-production                | Open; a per policy and per action approver list is the proposed fix                     |
| G-51, G-76 | Facts an agent declares (`refundEligible`, `fraudCheckPassed`, Slack `contentApproved`) are not checked against another system. Since G-80 they can only make a rule refuse; a signed human approval is what authorizes. A policy can now name the system that owns a fact (`signalSources`, RFC-0023), and such systems can be registered through maker checker, but none is connected and no shipped policy declares one (G-92). | pre-production                | Open by design                                                                          |
| G-53       | When an action ran but neither its Trust Record nor its result could be saved, the outcome is established from the connector and recorded by hand.                                                                                                                                                                                                                                                                                 | pre-production                | Open (residual)                                                                         |
| G-82       | What an external endpoint answers is its claim, not proof that it acted.                                                                                                                                                                                                                                                                                                                                                           | pre-production                | A property of the design, documented                                                    |
| G-84       | An approved request took 24 to 32 seconds in production on 2026-10-01; not measured since.                                                                                                                                                                                                                                                                                                                                         | pre-production                | Open; agents are told to use a 120 second timeout and read the record after a timeout   |
| G-86       | All visitor data in the public sandbox was deleted around the retention job's first run; cause not established.                                                                                                                                                                                                                                                                                                                    | pre-production (sandbox only) | Open; the job is paused. Check made unable to delete (2026-10-06); cause still unproven |
| G-92       | Business validation (RFC-0023): sources can be registered and their signed answers are verified, deployed 2026-10-11, but no real business system is connected yet; a source registered without a key is trusted on TLS alone; Parmana proves the source said it, not that it is right.                                                                                                                                            |
| G-93       | Per-agent authority grants (RFC-0023 phase 3): opt in per policy and no shipped policy opts in; limits are per request, not cumulative; the grantee's caller id is not checked to exist.                                                                                                                                                                                                                                           | pre-production                | Open; cumulative limits and phase 4                                                     |
| G-94       | Execution (RFC-0023 phase 4): an external endpoint must itself check the signed conditions to execute only if still valid; built in connectors get only the gateway re-check; a release refused at release leaves the intent ERRORED.                                                                                                                                                                                              | pre-production                | Open                                                                                    |

Closed on 2026-10-06: G-83 (the release tries the next checked address), G-87 (an incomplete
request body is a `400`, not a `500`), G-11 (environment variables on the docs site), and G-90
and G-91, found by fuzzing and fixed the same day. Recorded as closed on 2026-10-06, closed
earlier without the entry being updated: G-7, G-19, G-47.

---

## Environment note, load-bearing for everything below

Supabase-gated integration tests (see below) are gated on whether `SUPABASE_URL` plus
either `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY` are present in `process.env` at
test-run time (`packages/api/tests/helpers/supabase-availability.ts`). Vite's built-in env
loading exposes whatever a local `.env` file sets to `process.env` inside every `vitest run`
invocation, so whether these tests exercise a real, live Supabase project or are skipped
entirely depends silently on the environment doing the run, with no signal in the test
output either way. During this audit pass, Supabase credentials were available in the
environment, so every Supabase-gated integration test ran against a live project rather
than being skipped, and all of them passed; those results are folded into the "verified"
counts throughout this document.

This is itself flagged as gap **G-3** below: nothing about the test output distinguishes
"ran against a real database" from "ran hermetically," and a fresh clone or a CI job without
Supabase credentials configured would silently get less coverage than an environment that
has them, without anyone noticing the difference.

---

## Gaps closed this pass

| #   | Gap                                                                                                                      | Closed by                                                                                                                                                                                                                                       | Verified                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Credential isolation (issue → consume → destroy) was proven only at the library level, never through a real HTTP request | `packages/api/tests/integration/credential-isolation.integration.test.ts` (new), using `packages/api/tests/bootstrap/createInspectableExecutionSystem.ts` (new, test-only re-composition of the real gateway/execution-control/connector chain) | 3 tests: success case (credential issued + destroyed, proven by a second `consume()` throwing `"has been revoked"`), executor-failure case (same proof, plus confirms the credential is still destroyed on a downstream failure), spoofed-attestation case (proves zero sessions/credentials are ever created when the gateway attestation doesn't verify) |
| 2   | `PolicyNotFoundError` never triggered through HTTP                                                                       | `packages/api/tests/unit/execute-api.test.ts`, "returns 404 when the referenced policy does not exist"                                                                                                                                          | `POST /execute` with an unregistered `policy.name`/`version` → 404                                                                                                                                                                                                                                                                                         |
| 3   | `DuplicateBusinessTransactionError` never triggered through HTTP (sequential case)                                       | Same file, "returns 409 when the same businessTransactionId is submitted twice"                                                                                                                                                                 | Two sequential `POST /execute` calls with the same ID → 200, then 409                                                                                                                                                                                                                                                                                      |
| 4   | `POST /policies/validate` had zero test coverage of any kind                                                             | `packages/api/tests/unit/policies-api.test.ts` (new file)                                                                                                                                                                                       | All 4 branches: missing `policyId` (400), missing `policyVersion` (400), loadable policy (200), unknown policy (404)                                                                                                                                                                                                                                       |
| 5   | `GET /receipt/latest/:id`'s 200 success path never exercised                                                             | `packages/api/tests/unit/receipt-get-api.test.ts`, new case                                                                                                                                                                                     | Executes a transaction, confirms the receipt route returns the same trust record hash the execution produced                                                                                                                                                                                                                                               |
| 6   | `GET /verification/:id`'s 200 success path never exercised                                                               | `packages/api/tests/unit/verification-api.test.ts`, new case                                                                                                                                                                                    | Same pattern                                                                                                                                                                                                                                                                                                                                               |
| 7   | Envelope expiry boundary (`now === expiresAt` exactly) never tested, only "clearly expired"/"clearly valid"              | `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts`, "treats the exact expiresAt instant as expired"                                                                                                                              | Confirms the `<` comparison in `AuthorizationVerifier` is exclusive at the exact instant, and that one millisecond earlier is still valid                                                                                                                                                                                                                  |
| 8   | Session credential expiry boundary never tested at the exact instant                                                     | `packages/execution-control/tests/unit/session-credential-vault.test.ts`, two new cases                                                                                                                                                         | Confirms the `>=` comparison is inclusive at the exact instant, one millisecond earlier is still valid                                                                                                                                                                                                                                                     |
| 9   | `SessionCredentialVault.consume()`/`revoke()` with an unknown ID never tested                                            | Same file, two new cases                                                                                                                                                                                                                        | Both throw `"Unknown session credential: <id>."`                                                                                                                                                                                                                                                                                                           |
| 10  | Nonce store: no test simulated two concurrent `verify()` calls on the same nonce                                         | `envelope-verifier.test.ts`, "under two concurrent verify() calls with one nonce"                                                                                                                                                               | `Promise.all` of two calls, exactly one succeeds, deterministic given `MemoryNonceStore.checkAndRecord()` has no `await` between check and set, not a flaky/probabilistic test                                                                                                                                                                             |
| 11  | Session credential vault: no test simulated two concurrent `consume()` calls on the same session credential              | `session-credential-vault.test.ts`, "under two concurrent consume() calls"                                                                                                                                                                      | Same pattern, deterministic for the same reason                                                                                                                                                                                                                                                                                                            |

18 new tests, 2 new test files, 1 new test-only helper file. Full list of files touched is
in the phase report; nothing in `packages/*/src` was modified.

---

## Gaps closed in the Sep 7, 2026 session

Scope: a full-codebase deep read (six parallel agents covering every package, the two
client SDKs, schemas, and every policy file, grounded only in source — no docs trusted)
surfaced a batch of real, independently-verified defects across the API, execution-gateway,
crypto/policy, storage, connector, and SDK layers. This section records what was actually
fixed and committed that session; findings not acted on remain listed in "Remaining gaps, by
severity" or "Decision required" below, not silently dropped.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Closed by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24  | `ExecutionTrustRecord` carried no record of the `SignedExecutionAuthorization` the gateway actually accepted — a loaded trust record could not independently prove the nonce, expiry, `businessTransactionHash`, `policyContentHash`, or `signalsHash` the authorization was signed under, only that the trust record's own top-level fields hadn't been tampered with                                                                                                                                                                                                                                                                                               | New optional `authorization?: SignedExecutionAuthorization` field on `ExecutionTrustRecord` (`packages/shared/src/domain/execution-trust-record.ts`), captured from `RuntimeContext.authorization` in `BusinessTrustRecordBuilder.build()` (`packages/runtime/src/BusinessTrustRecordBuilder.ts`), included in `VerificationCrypto.canonicalRecord()` (`packages/crypto/src/VerificationCrypto.ts`) so it is covered by the same hash/signature as `transaction`/`overrides`/`executions` — no separate "if missing, skip" branch needed: `CanonicalSerializer` already drops `undefined`-valued keys via `JSON.stringify`, so a record with no authorization serializes byte-identically to before this field existed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `packages/crypto/tests/unit/verification-crypto-authorization.test.ts` (4 cases: verifies with no authorization present; verifies with one present and its hash differs from the same record without one; fails closed on a tampered authorization; a record built with the literal pre-fix draft shape — no `authorization` key at all, not merely `undefined` — hashes identically to one built via the helper with `authorization: undefined`), `packages/runtime/tests/unit/business-trust-record-builder.test.ts` (2 cases: captures a present authorization; leaves it entirely unset, not merely `undefined`, when absent from context). Commit `6303801`                                         |
| 25  | Hybrid-signature fields (`ExecutionTrustRecord.schemaVersion`/`.signatures`, added by an earlier "Hybrid Signature Support" milestone) had no Supabase column at all — a `CRYPTO_MODE=hybrid` trust record silently lost its second signature on every read from Supabase, degrading hybrid verification to single-signature for anything reloaded from durable storage. Found while verifying gap 24's storage round-trip, not previously known                                                                                                                                                                                                                     | New migration `supabase/migrations/20260907120000_add_authorization_and_hybrid_signatures_to_execution_trust_records.sql` adds `authorization_json`, `schema_version`, `signatures_json` columns; `SupabaseExecutionTrustRecordRepository.create()`/`findByTransactionId()` updated to write/read all three                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `packages/storage/tests/unit/supabase-execution-trust-record-repository.test.ts`, two new cases: full round-trip of all three fields against a fake `pg.Pool`, and confirming a legacy row with none of the three persisted returns them as genuinely absent (`undefined`), not `null`. Commit `6303801`                                                                                                                                                                                                                                                                                                                                                                                                 |
| 26  | Python SDK: `POST /transactions` (and the quickstart example) failed with a 500 when submitted via the Python client                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `python/parmana/serialization/encoder.py`'s `encode()` used `dataclasses.asdict()`, which eagerly flattens every nested dataclass into a plain dict before `encode()`'s own recursive call ever runs — so an unset `\| None = None` field on a dataclass _nested inside_ another dataclass (e.g. the newly-regenerated `BusinessTransactionMetadata.granted_capability`, see gap 24's Python-model regeneration) fell through to the plain-dict branch, which has no `None`-filtering at all, and was serialized as an explicit JSON `null`. Server-side, `DefaultConnectorPolicy.assertAllowed()` (`packages/execution-control/src/ConnectorPolicy.ts`) checks `grantedCapability !== undefined`, and a present-but-`null` value satisfies that check, then fails the subsequent equality check against the executed action. Fixed by recursing on real attribute values via `dataclasses.fields()`/`getattr()` instead of `asdict()`, so a nested dataclass stays a genuine dataclass instance — and therefore still `None`-filtered — at every depth                                                                                                                                                                                                                                                                                                                                                                                                                      | Reproduced against a live server (manual `curl` with `grantedCapability: null` in the body, isolating the bug from the Python SDK itself) before and after the fix. `python/tests/test_encoder.py`: added assertions that `tenantId`/`grantedCapability` (both `None` in the existing fixture's nested `metadata`) are omitted, not merely `null`. Full Python suite: 63 passing (the 4 failures seen mid-session were the same pre-existing timeout-under-load flakiness confirmed unrelated below, not a regression from this fix — verified by reverting to `main` and reproducing the same 3-4 failures there). No commit hash tag in this doc; part of commit `6303801`'s Python-model regeneration |
| 27  | TypeScript SDK: `PolicyApi.validate()` sent the entire `Policy` document as the `POST /policies/validate` request body; the real route (`packages/api/src/routes/policies.ts`) and `schemas/requests/policy-validate-request.schema.json` only accept `{policyId, policyVersion}` — any real caller of `ParmanaClient.validatePolicy()` would have received a 400                                                                                                                                                                                                                                                                                                    | `typescript/src/client/PolicyApi.ts`'s `validate()` now takes `(policyId: string, policyVersion: string)` and sends exactly that shape, matching the Python SDK's already-correct `policy_api.py`. `ParmanaClient.validatePolicy()` and the `05-policy-validation.ts` example updated to match                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Full `npx tsc -b` clean; no dedicated unit test existed or was added (no test previously covered this method's request body at all)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 28  | Python SDK: `parmana/api/__init__.py`'s imports and `__all__` omitted `AuditApi` and `RefusalApi`, despite both being real modules wired directly into `client.py` — a wildcard import missed two live API classes                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Added both to the import list and `__all__`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `python -c "from parmana.api import AuditApi, RefusalApi"` succeeds; full Python suite unaffected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 29  | `packages/execution-gateway/src/connector-execution/GatewayHttpAdapter.ts` had a dead, duplicated, badly-indented `throw error;` in its `catch` block — harmless (the first `throw` always fires) but a landmine for the next edit                                                                                                                                                                                                                                                                                                                                                                                                                                   | Removed the duplicate, fixed indentation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `npx eslint`/`npx tsc -b` clean, no behavior change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 30  | `ConnectorEvidence.ts`'s `buildConnectorEvidence()` redacted credential-shaped keys from `responseSummary.metadata` but not from `requestSummary.parameters` — a caller's own action parameters, if secret-shaped, were hashed and stored in evidence unredacted while the response side was protected                                                                                                                                                                                                                                                                                                                                                               | `requestSummary.parameters` now passes through the same `redactSensitiveKeys()` as `responseSummary.metadata`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `npx tsc -b` clean; no dedicated new test (no existing test asserted on `requestSummary` redaction either way)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 31  | `packages/api/src/bootstrap/createConnectorRoute.ts` still mapped `"payments:execute"` → connector id `"vendor-payment"`, a connector that has never been registered since G-27's removal — the mapping itself is unreachable in the current wiring (only consumed by `ExecutionGateway`'s deprecated `executionControl.channel` path, never the `executionControl.service` path this repository actually configures), but was still live, misleading dead code                                                                                                                                                                                                      | Removed the mapping; the function now always throws, with a comment explaining why (satisfies `ExecutionControlOptions.route`'s required shape for a path nothing currently exercises). Also deleted the empty, zero-byte, unreferenced `createVendorPaymentSecureConnector.ts` stub                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `npx tsc -b` clean; existing `packages/api/tests/unit/bootstrap/create-connector-registry.test.ts` (`"payments:execute has no connector to resolve to in any environment"`) unaffected, since that test exercises `ConnectorRegistry.resolveCapability()`, a different code path from the one this change touched                                                                                                                                                                                                                                                                                                                                                                                        |
| 32  | `packages/replay/package.json` declared `@parmana/runtime`, `@supabase/supabase-js`, `express` as dependencies — none used anywhere in `src/` or `tests/` — while `@parmana/policy`/`@parmana/shared`, genuinely imported throughout, were undeclared; the package only built by accident, via npm workspace hoisting                                                                                                                                                                                                                                                                                                                                                | Corrected the dependency list; moved `vitest` to `devDependencies` where it belongs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `npx tsc -b` and full `packages/replay` test suite clean after the change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 33  | `POST /transactions` performed caller-capability admission (`isCapabilityAllowed()`) but, unlike `POST /execute`, never carried the confirmed capability into `transaction.metadata.grantedCapability`, and only audited denials, never grants — a transaction submitted via `/transactions` signed an authorization missing `ExecutionAuthorizationPayload.grantedCapability` that the equivalent `/execute` submission would have carried (a consistency gap in the protection §2.31 of `docs/CLAIMS.md` describes, not a new one)                                                                                                                                 | `packages/api/src/routes/transactions.ts` now records `caller.capability_granted` and sets `metadata.grantedCapability` identically to `execute.ts`, by direct duplication of the existing logic rather than a new shared abstraction — the surrounding capability-check/audit block was already duplicated between the two routes before this change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | New integration test in `packages/api/tests/integration/caller-auth.integration.test.ts` ("`POST /transactions parity with POST /execute (NF-004)`"): both routes, given the same caller, produce a response whose `authorization.payload.grantedCapability` equals the executed action, and both emit exactly one `caller.capability_granted` event. Commit `7da8f0d`                                                                                                                                                                                                                                                                                                                                   |
| 34  | `CapabilityPolicyBinder` (see G-30 below) silently does nothing for any capability absent from `CANONICAL_CAPABILITY_POLICY_BINDINGS` — by design for genuinely out-of-scope actions, but nothing previously stopped a _newly-registered_ production capability from shipping unbound the same way G-30 itself happened (GitHub wired in 2026-08-19, gap not caught until 2026-08-25). Today's three live capabilities (`hubspot:deal-fetch`, `hubspot:deal-update`, `github:pr-fetch`, `github:pr-merge`) are all already bound, so this gap has no current live exploitable surface — it is a structural guardrail against recurrence, not a fix for a present gap | New fail-closed startup assertion, `assertConnectorCapabilitiesBound()` (`packages/api/src/bootstrap/assertConnectorCapabilitiesBound.ts`), called from `createConnectorRegistry()` after every connector registration is built, before the registry is returned: every registered capability must be in `CANONICAL_CAPABILITY_POLICY_BINDINGS` (imported from `@parmana/policy`, which re-exports it from `@parmana/capability-registry` — the package G-30's own "Root-cause architecture decision" addendum below already documents moving it to, 2026-08-26) or listed, with a reason, in a new allowlist (`packages/api/src/bootstrap/intentionallyUnboundCapabilities.ts`, currently just the test-only `test:fixture-execute`). An unbound, unlisted capability now fails startup with a message naming both remediation paths, instead of shipping silently protected only by omission. This is complementary to, not a replacement for, G-30's still-open follow-on work below (deriving `CapabilityPolicyBinder.test.ts`'s hand-maintained coverage-test literal from `createConnectorRegistry.ts` itself) — this guardrail catches an unbound capability at process startup regardless of whether that unit test's literal was updated, but does not itself fix the test                                                                                                                                                                                          | `packages/api/tests/unit/bootstrap/assert-connector-capabilities-bound.test.ts` (4 cases: bound capabilities pass silently; an allowlisted-but-unbound capability passes with a `console.warn`; an unbound, non-allowlisted capability throws; every allowlist entry has a non-empty reason). Full `packages/api` suite (272 tests) and full repo suite (1514 tests) pass with the assertion wired into real startup. Commit `672aee6`                                                                                                                                                                                                                                                                   |
| 35  | `PolicyChangeCrypto.verify()` was unit-tested but never called anywhere in production code — `verifyPolicyGovernanceIntegrityAtStartup()` re-derived and compared a content hash but never re-verified the stored `PolicyChangeApprovalRecord`'s own signature, so a tampered field on an already-persisted record (e.g. a rewritten `approvedBy`) went undetected. Found via an independent audit (artifact published 2026-09-07), not a full-codebase pass                                                                                                                                                                                                         | `verifyPolicyGovernanceIntegrityAtStartup()` now calls `policyChangeCrypto.verify(mostRecent)` before trusting `contentHashAfter` (new `"signature-invalid"` mismatch reason). `PolicyChangeApprovalRecord` also gained `previousRecordHash` (`packages/shared/src/domain/policy-change-approval-record.ts`), computed by `PolicyChangeApprovalService.approve()` from the record that preceded it for the same `(policyName, policyVersion)` and included inside the record's own signed payload (`PolicyChangeCrypto.canonicalRecord()`), independently re-derived and checked (new `"chain-broken"` mismatch reason) — detects a deleted/reordered/substituted record in the approval-record store itself, not only a tampered live file. Requires `supabase/migrations/20260907130000_add_previous_record_hash_to_policy_change_approval_records.sql` and a `SupabasePolicyChangeApprovalRecordRepository` column-mapping update                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts`, rewritten to sign fixtures for real (the prior fixtures used a hand-written placeholder signature string, correct only for a check that never verified it) plus two new cases for `"signature-invalid"`/`"chain-broken"` — 9 cases total. Commit `437f5ec`                                                                                                                                                                                                                                                                                                                                                                   |
| 36  | The integrity check ran at process startup only — an out-of-band edit to a live `policy.json` made while a long-lived process kept running was invisible until the next restart/deploy                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | New `schedulePolicyGovernanceIntegrityCheck()` (`packages/api/src/bootstrap/schedulePolicyGovernanceIntegrityCheck.ts`) re-runs the same check every 5 minutes for the life of the process (`POLICY_GOVERNANCE_INTEGRITY_CHECK_INTERVAL_MS` to override, `0` disables), sharing construction/fail-open error handling with the startup call via new `runPolicyGovernanceIntegrityCheckOnce()` (`packages/api/src/bootstrap/policyGovernanceIntegrityCheckRunner.ts`); its interval timer is `.unref()`'d so it can never itself keep the process alive past shutdown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Wired into `server.ts` alongside the existing startup call; no dedicated timer test (matches this codebase's existing convention of not unit-testing `setInterval` wiring itself, e.g. `createGracefulShutdown`'s own force-exit timer). Commit `437f5ec`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 37  | `PolicyValidator`'s `matches` operator accepted any syntactically-valid regex with no complexity bound — a policy author could commit a catastrophically-backtracking pattern later evaluated against live, attacker-influenced signal values. Separately, `findUncoveredFacts()` coverage warnings were computed but never surfaced anywhere a checker would see them — only a load-time `console.warn`                                                                                                                                                                                                                                                             | `validateRegex()` now rejects patterns over 200 characters and single-level nested quantifiers (e.g. `(a+)+`) — documented in-source as a heuristic improvement, not a ReDoS-proof guarantee. Coverage warnings now returned as `coverageWarnings` on both the `POST .../pending-changes` response and the `GET .../pending-changes` diff listing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | No dedicated new unit test for the regex heuristic itself (existing `PolicyValidator` test suite unaffected — no prior test constructed a nested-quantifier pattern); `npx tsc -b`/`npx vitest run` clean. Commit `437f5ec`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 38  | `packages/policy/src/types/LedgerEntry.ts` and its `hashLedger()` helper were unexported, unimported dead code inside `@parmana/policy` — easy to mistake for the real audit trail. Separately, `@parmana/storage`'s `AppendOnlyLedger`/`StorageEngine` are genuinely tested and exported, but in-memory only (no persistence) and never imported by `packages/api`, `execution-gateway`, or `runtime` — also not part of the live request path, with nothing saying so                                                                                                                                                                                              | Deleted the unused `LedgerEntry.ts`/`hash.ts`. `StorageEngine`'s own doc comment now states explicitly that it is not part of the live request path and points at `PolicyChangeApprovalRecord`/`ExecutionTrustRecord` as the real audit trail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `npx tsc -b` clean (nothing referenced either file outside itself); full repo test suite unaffected. Commit `437f5ec`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 39  | Any `(policyName, policyVersion)` predating Policy Governance (no approval record at all) is permanently invisible to the integrity check — `scripts/verify-policy-changes-approved.ts`'s own doc comment already named this as expected, not a false positive, but nothing closed it                                                                                                                                                                                                                                                                                                                                                                                | New `scripts/backfill-legacy-policy-approvals.ts`: creates a synthetic, system-actor `PendingPolicyChange` + signed `PolicyChangeApprovalRecord` (content unchanged) for any pair with neither an approval record nor an open proposal. Dry-run by default (`--apply` to write); deliberately not wired into server startup — mutating the durable audit trail is a reviewed, one-time action. Its first version did not check for an existing open `PendingPolicyChange` before planning a backfill, and would have misclassified this codebase's own real, human-proposed, still-`PENDING_APPROVAL` policies (§2.26's "Legacy-policy backfill" entry, ten policies proposed 2026-08-19) as "legacy" — fixed the same day after cross-referencing that entry: the script now calls `pendingPolicyChanges.findPending()` and excludes any pair with an open proposal, reporting it separately (`awaitingRealApproval`) instead of fabricating a system approval over a real, unresolved human decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Type-checked directly (`npx tsc --noEmit` with the same strict flags as the main build); no live run performed against any environment — `--apply` has not been executed. Commits `437f5ec`, `4e1a8e3`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 40  | Every governance check up to this point was detection-only: a bypass took effect immediately and was only ever discovered afterward, on the next integrity check (every 5 minutes, gap 36) or startup scan. Nothing stopped a policy from actually executing while illegitimate                                                                                                                                                                                                                                                                                                                                                                                      | New `PolicyExecutionVerifier` (`packages/policy/src/types/PolicyExecutionVerifier.ts`, concrete `PolicyGovernanceExecutionVerifier` in `packages/api/src/governance/`), wired into `RuntimeEngine.execute()` (the real single choke point for every policy evaluation — a prior implementation runbook assumed a nonexistent `packages/api/src/execution-gateway/ExecutionGateway.ts` instead) as a new optional trailing constructor param, same idiom as `signalStateVerifier`/`capabilityPolicyBinder`. A violation (no approval record / bad signature / content mismatch) becomes an ordinary `PolicyDecision` REJECT before any rule is evaluated, flowing through the existing refusal-recording and fail-closed enforcement path unmodified. Feature-flagged (`POLICY_EXECUTION_VERIFICATION_ENFORCED=true`), default OFF — confirmed with the user before implementing, since every real production policy was `PENDING_APPROVAL` at the time (gap 39/§2.26) and an unconditional gate would have refused all of them. **Update 2026-09-16:** all 14 real production policies now have a genuine, distinct-checker `PolicyChangeApprovalRecord` (§2.26's "Legacy-policy backfill" entry) — the precondition that justified default-off no longer holds. The flag itself was left unchanged (`false` in `.env`); turning it on remains a separate, deliberate step per `docs/operations/policy-approval-runbook.md` Part 5, not done as part of closing the backfill | `packages/api/tests/unit/PolicyGovernanceExecutionVerifier.test.ts` (4 cases), `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts` (3 cases, the env-var gate), `packages/runtime/tests/e2e/runtime.e2e.test.ts` (2 new cases), `packages/runtime/tests/unit/optional-protections-logging.test.ts` (1 new case). Full repo suite: 1544 passed, 38 pre-existing skips, 0 failed. Commit `7a1aa37`                                                                                                                                                                                                                                                                                |

Full repo `npx tsc -b`, `npx eslint . --ext .ts`, and `npx vitest run` all clean after every
item above: 1544 passed, 38 pre-existing skips, 0 failed (up from 1513/1513 passed at the
session's start — net +31 is misleading in isolation; many new tests were added alongside a
small number of pre-existing tests that already covered adjacent behavior).
Python: 63 passing, 4 pre-existing timeout-under-load failures confirmed unrelated (see gap
26's entry).

**Gaps 35–39 were found and closed later the same day**, via an independently-published audit
artifact (https://claude.ai/code/artifact/0a454f3f-055c-47c1-a4ff-5401ad582dd0) rather than the
full-codebase pass that produced gaps 24–34. **Gap 40** is not a "found" gap at all but a
requested capability (execution-time prevention on top of the detection gaps 35–39 closed) —
recorded in this same table because it landed in the same session and the numbering is
otherwise continuous, not because it shares that
pass's methodology.

**Explicitly not fixed this session, tracked separately:** NF-001 (upstream authorization
verification, a delegation-layer design question, not a bug — see
`NF-001-UPSTREAM-AUTHORIZATION-VERIFICATION.md`) and NF-005 (HubSpot approval issuer
provisioning) — see "Decision required" below for both.

---

## Gaps closed in the 2026-07-17 audit closeout session

Scope: nine tasks closing findings from the July 16 external audit. Full closing report is
this session's final message to the user; summarized here for the trust-artifact record.

| #   | Gap                                                                                                                                                                                                                                                                                                                   | Closed by                                                                                                                                                                                                                                                                                                                   | Verified                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12  | `.gitignore` was mixed UTF-16LE/ASCII; git could not parse part of it, which is how `trace.txt` got committed                                                                                                                                                                                                         | Rewrote `.gitignore` as clean deduplicated UTF-8/ASCII, recovering every rule from both encoded segments and adding the missing `trace.txt`/`*.trace` rules                                                                                                                                                                 | `file .gitignore` reports ASCII text; `git check-ignore -v` passes for every representative path including a nested `trace.txt`                                                                                    |
| 13  | Committed debris: 1.6MB `trace.txt`, a pasted-transcript `claim.md`, stray root `resume.md`/`pending.md`, and a misplaced root `vendor-payment.json`                                                                                                                                                                  | Deleted `trace.txt` and `claim.md`; archived `resume.md`/`pending.md` content to `docs/sessions/2026-07-11-remaining-enterprise-productization.md` and `docs/sessions/2026-07-07-milestone-1b-note.md`; moved `vendor-payment.json` to `examples/vendor-payment.json`                                                       | `git status` shows the deletions/move; no remaining references to the old paths found by repo-wide grep                                                                                                            |
| 14  | `PARMANA_POLICY_DIR` was read via a non-null assertion; unset, it surfaced as `ERR_INVALID_ARG_TYPE` inside `FilePolicyRepository.load` at request time, not at startup                                                                                                                                               | `packages/shared/src/config/Config.ts`'s `loadConfig()` now validates it at startup, same fail-closed discipline as caller-auth keys                                                                                                                                                                                        | `packages/shared/tests/unit/config.test.ts` (new, 3 tests): refuses to start when unset, refuses when blank, loads the configured value                                                                            |
| 15  | No canonical list of environment variables the system reads; several were undocumented anywhere (see G-11)                                                                                                                                                                                                            | Added `.env.example` at repo root, one entry per `process.env.*` read confirmed by grep across `packages/*/src`, safe placeholders only                                                                                                                                                                                     | Manually cross-checked against every `process.env.` call site in `packages/*/src`                                                                                                                                  |
| 16  | `engines.node` declared `>=22` while the ML-DSA-65 (dilithium3) signature provider requires Node >=24 (native `node:crypto` support); on Node 22/23 the affected tests failed rather than skipping with an explanation                                                                                                | `engines.node` raised to `>=24` in the root `package.json` and the three packages that touch ml-dsa-65 (`crypto`, `execution-gateway`, `envelope-verifier`); added `isMlDsa65Supported()`/`ML_DSA_65_SKIP_REASON` (`@parmana/crypto`) and wired `describe.skipIf`/`it.skipIf` into all 5 affected test files                | All 5 files pass on Node 24 (24 tests); on an unsupported Node build the same tests report skipped with the reason in the test name instead of failing                                                             |
| 17  | No CI ran the main test suite on push or pull request (`.github/workflows/` had only `python-sdk.yml`), which was gap **G-2** below                                                                                                                                                                                   | Added `.github/workflows/ci.yml`: Node 24, `npm ci`, `npm run build`, a terminology-regression grep guard, then `npm test`; explicit env vars only, no dependency on any `.env` file                                                                                                                                        | YAML validated by parsing with the repo's own `yaml` dependency; the terminology-guard grep and each step verified locally against the actual repo tree                                                            |
| 18  | `createApp`'s `callerAuth` option was optional; omitting it silently mounted the API with no caller authentication, and every pre-existing test relied on that omission                                                                                                                                               | `callerAuth` is now a required option: either `{ authenticator, auditSink }` or the literal string `"disabled"`. `server.ts` and all 21 dependent test files (via the shared `tests/test-app.ts` singleton, plus the two direct call sites in `credential-isolation.integration.test.ts`) now state their choice explicitly | Full `packages/api` suite: 85 passed, 1 skipped (Supabase-gated), 0 failed other than the pre-existing live-Supabase-network gap (G-3, unrelated)                                                                  |
| 19  | The retired term "execution governance" remained in 14 files (`GOVERNANCE.md`, `typescript/docs/06-09`, `docs/architecture/EXECUTION-FLOW-AUDIT.md`, `docs/architecture/KEY-MANAGEMENT.md`, `docs/rfcs/RFC-0012`, `docs/00-introduction/PROBLEM.md`, `docs/specifications/reference-policies.md`, plus this document) | Replaced with "execution authorization" / "AI Execution Authorization" in 12 of the 14 (see exclusions below); added a CI grep guard so it cannot silently reappear                                                                                                                                                         | Repo-wide case-insensitive grep for the phrase now returns only the four intentionally-excluded files (see note below)                                                                                             |
| 20  | `FileKeyProvider` built key file paths from `keyId` with no input validation                                                                                                                                                                                                                                          | Rejects any `keyId` not matching `^[A-Za-z0-9._-]+$` before path construction, in `getPrivateKey`, `getPublicKey`, `hasKey`, and `getMetadata` (all route through the same two path-building methods)                                                                                                                       | `packages/crypto/tests/unit/file-key-provider.test.ts` (new, 5 tests): rejects a `../../../../etc/passwd`-style keyId in all four methods; accepts the well-formed `"default"` keyId used by the rest of the suite |
| 21  | Root `package.json` and `typescript/package.json` both declared `"name": "parmana"`, making plain `npm run <script>` cascade across every workspace and `npx <bin>` resolve relative to an arbitrary workspace instead of the repo root (documented in `docs/audit/CORE-API-FINDINGS-SDK-AUDITS.md` §4)               | Renamed `typescript/package.json` to `"@parmana/legacy-reference"`; ran `npm install` to resync `node_modules`/lockfile; removed the `./node_modules/.bin/tsx` workaround from `.github/workflows/python-sdk.yml`, restored to `npm run check:python-models`                                                                | `npm run typecheck` and `npm run check:python-models` at repo root now each run only the intended root script, verified directly                                                                                   |
| 22  | No LICENSE; repository intent (proprietary, evaluation-only) was undeclared                                                                                                                                                                                                                                           | Wrote `LICENSE` (source-available for evaluation, all rights reserved, contact `founder@parmanasystems.com`); updated both `# License` sections in `README.md` to match                                                                                                                                                     | None                                                                                                                                                                                                               |
| 23  | This document's "Environment note" asserted that the `.env` in a specific checkout contains live Supabase credentials, a disclosure of where live credentials exist, not just a description of the gating mechanism                                                                                                   | Rephrased to describe the `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` gating mechanism and gap without asserting where live credentials are currently present                                                                                                                                            | None                                                                                                                                                                                                               |

**Note on item 19's two exclusions:** `docs/site/how-parmana-thinks.mdx` and
`docs/site/concepts/execution-authorization.mdx` both cite an unrelated third-party academic
work actually named "Execution Governance" (Ku, 2026, EG Reference Specification v0.9.7.3)
in a "Related work" callout. Renaming that citation would misrepresent the cited work's
real name, so it was left untouched. `docs/ROADMAP-v1.md` narrates the terminology sweep
itself (quoting the retired term to describe gap G-18 there, which this session's edit to
`docs/specifications/reference-policies.md` happens to resolve as a side effect; that
roadmap document's own G-18/R6 entries were not updated, out of scope for this session). This
document (`docs/VERIFICATION-GAPS.md`) is exempted from the CI grep guard for the same
reason this section needs to name the retired term.

**No shipped npm package name or public API identifier uses "execution governance"** in any
casing (`ExecutionGovernance`, `execution-governance`, `EXECUTION_GOVERNANCE`), confirmed by
repo-wide grep. Nothing requires a decision on that front.

**Explicitly out of scope for this session, remains open:** the in-memory `NonceStore`
(`MemoryNonceStore`) and `InMemoryCallerAuditSink` both lose all state on process restart,
taking with them the replay-nonce window and the caller-authentication audit trail alike. See new gap **G-13**
below. This was not touched this session and must not be read as closed by anything above.
_(Update from a later hardening session: G-13 has since been resolved. See its entry below
for what changed and how it's verified. This paragraph is left as written at the time for an
accurate record of what this specific session did and did not do.)_

---

## Gaps closed in the Phase 3D certification session

An independent, from-scratch re-certification of the public claim _"Even if AI has valid
credentials, it still cannot execute anything your business hasn't authorized. No
exceptions"_ was performed against current repository state (treating every prior phase's
conclusion, including this document's own, as a claim to re-verify, not inherit) and is
recorded in full in `docs/architecture/phase3d-independent-authorization-certification.md`.
**Result: CLAIM FULLY CERTIFIED** for `razorpay:refund-create` and `hubspot:deal-update`,
the two capabilities actually reachable in production.

That certification disclosed eight limitations. Two were genuine, safely closable gaps and
were fixed in the same follow-up session, recorded here as new closed entries:

**G-25. Truncated credential fragments reached the caller-visible `POST /execute` response.**
`GatewayRazorpayAdapter`/`GatewayHubSpotAdapter` returned `keyIdRedacted`/`bearerRedacted`
metadata built by truncating the literal credential to its first 8 (Razorpay `key_id`) or 12
(HubSpot bearer token — the entire credential) characters. `ConnectorEvidence.ts`'s generic
metadata redaction filter (`SENSITIVE_KEY_PATTERN`, matched against key _names_) did not
match either key name, so this literal fragment passed unfiltered through
`ExecutionEvidence.attributes` into the signed Trust Record and the HTTP response body an
AI-facing caller receives. Not a bypass of any authorization decision (the fragment cannot
be used to reconstruct the full secret or skip any check on a subsequent request), but a
genuine exception to a "zero credential bytes ever reach the caller" reading of credential
isolation. **RESOLVED.** `redactRazorpayKeyId`/`redactHubSpotToken`
(`packages/connector-sdk/src/connectors/razorpay/RazorpayTypes.ts`,
`packages/connector-hubspot/src/HubSpotTypes.ts`) now return a one-way, truncated SHA-256
fingerprint (`fp_` + 12 hex chars of the digest) instead of a literal substring — the
operational "which credential executed this" signal an operator needs (same credential ⇒
same fingerprint; a rotated credential ⇒ a different one) is preserved, with zero bytes of
the actual secret reaching any caller-visible surface. `razorpay-connector.test.ts` and
`hubspot-connector.test.ts` were strengthened from asserting a specific redacted string to
asserting the full serialized response contains no substring of the real credential at all —
closing the regression-coverage gap, not merely the immediate instance. Verified:
`npx tsc -b` clean; both suites re-run, 22/22 passing; full monorepo suite re-run,
1039 passed (unchanged count), 43 skipped (+4, the next entry's new file), 0 failed.

**Extends G-24's residual closure (TD-23/Phase 3B): Razorpay daily-cumulative-cap ledger
atomicity was proven live only for the in-memory test implementation.**
`InMemoryRazorpayDailyRefundLedger.test.ts`'s 50-way concurrent-`reserve()` proof exercises
the implementation `NODE_ENV=test` wiring actually uses; the production
`SupabaseRazorpayDailyRefundLedger`'s `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`
atomicity — sound by construction, the same idiom already proven live for `consumed_nonces`
(G-13) — had no dedicated integration test issuing genuinely concurrent connections against
a real Postgres database. **RESOLVED.**
`packages/storage/tests/integration/supabase-razorpay-daily-refund-ledger.integration.test.ts`
(new), gated the same way every other live-database suite in this repository is
(`resolveDatabaseGate`, requiring `ALLOW_LIVE_SUPABASE=1` to run against a real project — not
opted into during this session, so not executed live; confirmed to compile and to skip
cleanly, `1 file skipped, 4 tests skipped`, exactly like its siblings), adds: a two-way race
asserting exact, non-lost-update totals; a 20-way concurrent-reservation proof matching the
in-memory implementation's own proof in kind; and a `release()`-floors-at-zero case (the
schema's `chk_reserved_paise_non_negative` constraint).

**Explicitly not closed by this session, carried forward with reasons (full detail in
`phase3d-independent-authorization-certification.md` §12, items numbered to match that
section exactly):**

- **(§12.1) `payments:execute`/vendor-payment would not satisfy this claim if it were ever
  enabled in production.** Already tracked in this document's own "Investigation
  (2026-08-04): `vendor-payment` remains genuinely blocked" entry above (`vendorVerified`,
  `invoiceVerified`, `paymentApproved`, `sufficientFunds`, `riskScore` remain pure
  caller-declared attestations with no independent verifier and no real system to fetch them
  from) — the certification independently re-confirmed that finding from current source
  rather than merely citing it, and it remains out of scope for this session for the same
  reason: it is not currently a production capability (§2 of the certification), so it
  cannot presently violate the claim, but enabling it as currently written would.
- **(§12.3) HubSpot's `TRUSTED_APPROVAL_ISSUERS`** (`createApprovalIssuerRegistry.ts`)
  remains empty by design; the Signed Approval Artifact mechanism has never been exercised
  against a real, operator-provisioned issuer key in production. Fail-closed, not a
  weakness — and provisioning a real approver key is inherently an operational action, not
  something a code change can substitute for.
- **(§12.5) `GatewayAttestation`** still has no independent expiry/TTL of its own, relying
  on the durable execution-authorization nonce upstream (§6.4 of the certification).
  Deliberately not touched — a shared, foundational crypto primitive; adding a new
  replay-defense mechanism to it is exactly the kind of change this codebase's own
  established practice (Phase 2L's STOP conditions) treats as needing its own chartered
  phase, not a same-session edit, especially with no currently exploitable path found
  through it.
- **(§12.6) The internal gateway-session/session-credential-vault layers** remain
  in-memory, single-process only. Deliberately not touched — persistent/shared storage for
  this layer is infrastructure work of the same shape `02-REMAINING.md` already tracks as a
  dedicated "big rock" (nonce-store persistence), and this layer is downstream of the
  already-durable, load-bearing nonce check.
- **(§12.7) `OverrideService`/`OverrideVerifier`** (G-5, below) remained unreachable dead
  code **until they were deleted on 2026-09-08 (see G-5's 2026-09-20 update)**. **Deliberately, explicitly not wired up** — `02-REMAINING.md`'s own Tier 0 entry
  for this component is a standing security guard reading "do NOT wire overrides" until its
  documented deficiencies are fixed with a design partner's input. Wiring it to "close" G-5
  would directly contradict that guard.
- **(§12.8) Hybrid/PQ signing's scope** (G-4) still stops short of
  execution-authorization/Gateway/connector signing — already tracked there as a
  separately-chartered expansion project, unrelated in kind to this session's scope.

None of these six carried-forward items provide a currently exploitable path for an AI
holding valid credentials to execute an action the business has not authorized, per the
certification's adversarial review (§10 of that document).

---

## Gaps checked and found not applicable

- **Gateway session store concurrency**: `InMemoryGatewaySessionStore.consume()` is fully
  synchronous (not even `async`), so two "concurrent" calls cannot interleave in any sense:
  Node calls them one after another, unconditionally. The existing sequential
  "rejects a reused session" test already covers everything the synchronous case can prove;
  a `Promise.all` wrapper around a synchronous method would not test anything additional.

- **Direct database-write bypass of `RuntimeEngine`.** Raised as `NOT VALIDATED (to full
exhaustiveness)` by the Strategic Positioning source-code validation audit (2026-08-09),
  which had traced every HTTP route and both SDKs but not every method of every repository
  implementation. Closed by tracing every write method on `ExecutionTrustRecordRepository`
  (`create`, `appendExecution`, `replaceExecution`, `appendOverride`, `appendVerification`,
  `appendReceipt`, `appendSettlementConfirmation`) and `BusinessTransactionRepository`
  (`accept`/`create`) to its callers, repo-wide: every one has exactly one caller, always
  inside `packages/runtime/src/services/*` or `ExecutionTrustApplication`
  (`appendSettlementConfirmation`'s sole caller, `RazorpaySettlementProcessor.ts:203`, is
  itself gated by an independent re-fetch of real Razorpay state before writing, not
  caller-triggered directly). Zero routes in `packages/api/src/routes`, zero SDK methods in
  `typescript/src`/`python/parmana`, write to either repository directly. **Now DIRECTLY
  VALIDATED**, not merely unvalidated-but-presumed-clean: `docs/CLAIMS.md` 2.22's "no code
  path that does not pass through `RuntimeEngine`" scope is confirmed to extend to the
  storage layer as well, not only the HTTP/connector-dispatch layer that document's own
  bypass search (Phase 3D §5.2) already covered.

- **`SessionCredentialVault`/`InMemoryGatewaySessionStore` not surviving a restart or
  scaling past one instance** (2026-09-10 production-readiness session). An external audit
  framed this as a gap alongside the `/execute` rate limiter (see G-41 below, which _is_
  real). Traced both objects' actual lifecycle before accepting that framing:
  `InMemorySessionCredentialVault.issue()`/`.consume()`/`.revoke()` all run inside one
  `try`/`finally` in `SessionCredentialSecureConnector.execute()`
  (`packages/execution-control/src/SessionCredentialSecureConnector.ts`), and
  `InMemoryGatewaySessionStore.create()`/`.consume()` both run inside one synchronous call
  chain in `ExecutionControlService.execute()` and `DefaultConnectorPolicy.assertAllowed()`.
  Confirmed directly: `sessionCredentialId` and `GatewaySession.sessionId` are never
  returned in any `POST /execute` response body (`packages/api/src/routes/execute.ts` has
  no reference to either), and there is no second HTTP endpoint that could later present one
  back to this process -- `POST /execute` is the only route that ever touches either store.
  A process restart mid-request fails that one in-flight request the same way any in-flight
  computation would, database-backed or not; there is no scenario where a session/credential
  created by one instance is ever consumed by a different request, process, or instance.
  Persisting either to Postgres would add a database round trip inside the hot `/execute`
  path for no correctness benefit, and would introduce a new failure mode (a database
  hiccup now blocks every execution that previously succeeded purely in-memory). This
  independently confirms -- via direct code tracing, not by citing it -- the Phase 3D
  certification's own §12.6 conclusion above ("this layer is downstream of the already-
  durable, load-bearing nonce check"): correctly in-memory by design, not an unaddressed
  gap. Not fixed; nothing to fix. See G-41 for the one genuinely real durability gap this
  same external audit correctly identified (the rate limiter).

- **Paytm connector should fail startup if unconfigured at all, not only if partially
  configured** (`GAPS.md`, GAP-2, 2026-09-14). The proposed fix was a new `EXECUTION_MODE`
  environment variable (`payment` vs `auth-only`) that would make full absence of
  `PAYTM_CONNECTOR_URL`/`PAYTM_CONNECTOR_SHARED_SECRET` a startup error under payment mode,
  rather than the current warn-and-omit. Checked against `assertPaytmConnectorConfigured.ts`
  (`packages/api/src/bootstrap/`, called from `server.ts` before the port ever binds) before
  building anything: that file already fails closed, hard, at startup, on the one
  configuration state that is actually dangerous — _partial_ configuration (`PAYTM_CONNECTOR_URL`
  set without `PAYTM_CONNECTOR_SHARED_SECRET`, or vice versa; also plaintext HTTP in
  production). Its own doc comment states, deliberately, that full absence is intentional and
  acceptable: "The Paytm connector is optional in any given deployment ... exactly like
  HubSpot/GitHub." That is a considered design decision already present in the codebase, not
  an oversight the audit found — the audit's proposed fix would have reversed it for every
  deployment, on the unstated assumption that this specific deployment requires payment
  capability to always be present, which nothing in this codebase or the audit establishes.
  **Not fixed; nothing to fix**, per the same "found real, but framed differently than
  proposed" pattern as the entry above. If a specific deployment ever does need "boots without
  Paytm capability" to be a hard startup error, that is a one-line, opt-in flag to add at that
  point (e.g. `REQUIRE_PAYTM_CONNECTOR=true`) — deliberately not built speculatively here,
  since no deployment has stated that requirement.

---

## Gaps closed in the 2026-09-10 production-readiness session

Scope: an external code-derived production-readiness audit (`PARMANA-EXP-GAPS-FOR-
PRODUCTION.md`, gitignored per this repo's `PARMANA-*.md`/`GAP-*.md` convention for scratch
audit deliverables) named 13 items, none critical, across HIGH/MEDIUM/LOW priority. Every
item was independently re-verified against current source before being acted on (not taken
on the audit's word) -- see the "found not applicable" entry directly above for the one
item this re-verification overturned.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Closed by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 40  | `KEY_PROVIDER` accepted `aws-kms`/`azure-key-vault`/`gcp-kms`/`hsm` as valid config values (`packages/shared/src/config/KeyProviders.ts`), but `KeyBootstrap.create()` (`packages/crypto/src/KeyBootstrap.ts`) always constructed `FileKeyProvider` regardless -- an operator setting `KEY_PROVIDER=aws-kms` expecting real KMS custody got private-key-on-disk instead, with no error                                                                   | `KeyBootstrap.create()` now throws for any value other than `"local"`, naming the value and stating that only `FileKeyProvider` is implemented. Commit `624adf7`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `packages/crypto/tests/unit/key-bootstrap.test.ts` (7 cases: defaults to local when unset; local explicit; each of the 4 unimplemented values throws naming both the value and "not implemented"; an unrecognized value is rejected earlier, at config-parse time, before `KeyBootstrap` is even reached)                                                                                                                                                                                                                                       |
| 41  | `POST /execute` and `GET /health`/`GET /ready`'s rate limiters used `express-rate-limit`'s default in-process `MemoryStore` -- each machine in a horizontally-scaled deployment counts independently, so the effective ceiling for a caller is `limitPerMinute * machineCount`, not the fleet-wide limit `docs/CLAIMS.md` 3.14 already documented as the scope caveat. Safe only because `fly.toml` pins `min_machines_running = 1` today                | New `PostgresRateLimitStore` (`packages/storage/src/postgres/PostgresRateLimitStore.ts`), a real `express-rate-limit` `Store` backed by an atomic `INSERT ... ON CONFLICT` upsert (new migration `supabase/migrations/20260910120000_add_rate_limit_counters.sql`). Wired via `createRateLimitStore.ts`: used when `DATABASE_URL` is configured; falls back to the in-process default with a loud startup warning otherwise (deliberately not fail-closed like the NonceStore -- a missing shared rate-limit store loosens a capacity control, it does not remove a security check, so refusing to start over it would break every single-instance/local deployment that works correctly today). Commit `2d643ca`                                                                                                                                                                                                                                                          | `packages/storage/tests/unit/postgres-rate-limit-store.test.ts` (7 cases, including window-rollover and independent-keys behavior against a fake `pg.Pool` that implements the real upsert semantics in JS), `packages/api/tests/unit/bootstrap/create-rate-limit-store.test.ts` (3 cases: test/production-without-DATABASE_URL/production-with-DATABASE_URL branches), existing `packages/api/tests/integration/rate-limit.integration.test.ts` (8 cases) unaffected                                                                           |
| 42  | No load testing existed anywhere in the repo -- the system had never been proven to hold up under concurrent `/execute` load, and `.env.example`'s own rate-limit defaults are labeled "sized for a design-partner evaluation deployment, not high-volume production traffic"                                                                                                                                                                            | New `npm run loadtest` (`scripts/load-test.ts`, `autocannon`-based): boots the real server (`NODE_ENV=test`, in-memory storage, caller-auth disabled) and benchmarks `GET /health`, `GET /ready`, and `POST /execute` (real policy evaluation against `policies/vendor-payment`, real Ed25519 signing, real connector execution) at configurable concurrency/duration. Commit `c32a861`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Actually run (10 connections, 5s): `POST /execute` sustained ~51 req/s, p50 188ms / p99 444ms, zero errors, zero non-2xx. Scope stated in the script's own header comment: measures policy/signing/connector overhead under concurrency, not the caller-auth or rate-limiter middleware layers (both disabled for this run) or a durable-storage-backed deployment -- this does not change `README.md`'s existing "sustained volume, load-bearing traffic... not claimed" scope statement, one run is not a volume proof                        |
| 43  | `.env.example` shipped `PARMANA_AUTH_DISABLED=true` uncommented -- a first-time operator who copies it to `.env` without reading every line deploys with caller authentication off. The existing startup `console.warn` (`createCallerAuthenticator.ts`) is easy to miss in a log-aggregation tool after the fact                                                                                                                                        | `.env.example`'s `PARMANA_AUTH_DISABLED` line commented out (defaults to the safe `"false"` the code already falls back to). `GET /ready`'s JSON response now carries `authDisabled` (plus a `warning` string when true) -- a field an operator's own monitoring/synthetic checks (already polling this endpoint every 30s per `fly.toml`) can assert and alert on, not just a log line. Commit `263387b`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `packages/api/tests/unit/routes/ready.test.ts`, 2 new cases (`authDisabled: true` with a warning string when caller-auth is disabled; `authDisabled: false` with no `warning` key when enabled)                                                                                                                                                                                                                                                                                                                                                 |
| 44  | `createGatewayIdentity.ts` hardcoded `gatewayId`/`publicIdentity` to the literal `"parmana-gateway"` with a `TODO: Replace these placeholder values`, blocking more than one logically distinct gateway identity against the same audit trail. `createSessionStore.ts`'s same-process `gatewaySessionIssuanceAuthentication` capability token was a bare `Object.freeze({})` with a `TODO: Replace with the production authentication mechanism` comment | `gatewayId`/`publicIdentity` now configurable via `PARMANA_GATEWAY_ID` (mirrors the existing `PARMANA_GATEWAY_KEY_ID` pattern), validated against the same safe character set `FileKeyProvider`'s `keyId` guard uses, defaulting to the same literal. `gatewaySessionIssuanceAuthentication` is now `Object.freeze({ token: randomUUID() })`; reference identity (not the value's contents) was always the actual mechanism, so this closes the "unaddressed TODO" appearance rather than a real gap -- the comment now says so plainly instead of carrying a stale TODO. Commit `2761548`                                                                                                                                                                                                                                                                                                                                                                                 | `packages/api/tests/unit/bootstrap/create-gateway-identity.test.ts` (3 cases: default value, `PARMANA_GATEWAY_ID` override, rejects an unsafe value)                                                                                                                                                                                                                                                                                                                                                                                            |
| 45  | HubSpot's Private App token (`HUBSPOT_PRIVATE_APP_TOKEN`) is a long-lived static credential with no built-in expiry, unlike GitHub's ephemeral per-execution token -- an architectural property, not a bug, but nothing enforced or reminded anyone to rotate it                                                                                                                                                                                         | New `warnIfHubSpotTokenStale()` (`packages/api/src/bootstrap/warnIfHubSpotTokenStale.ts`), called once at startup from `createConnectorRegistry.ts`: warns if the token is configured but `HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT` is unset (age untrackable), and separately if the recorded rotation date is more than 90 days old. Reminder, not enforcement -- this process cannot itself revoke or replace a HubSpot-side token; only a human with HubSpot admin access can. Commit `33d96b3`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `packages/api/tests/unit/bootstrap/warn-if-hubspot-token-stale.test.ts` (5 cases: not configured, unset rotation date, unparseable rotation date, recent rotation silent, stale rotation warns with the actual age)                                                                                                                                                                                                                                                                                                                             |
| 46  | No dedicated compliance/bulk-audit-export endpoint existed. `GET /trust-records/:id` (single-record) and `GET /transactions` (raw `BusinessTransaction`, no execution/verification/receipt history) were the closest things, neither sufficient for periodic external audit review                                                                                                                                                                       | New `GET /trust-records`: returns the complete signed Execution Trust Record (transaction, executions, verifications, receipts, authorization) for every transaction on the requested page. Scoping/pagination deliberately mirror `GET /transactions` exactly (same `page`/`pageSize` params, same post-fetch `submittedBy` ownership filter, same bare-array response shape); adds `since`/`until` (ISO 8601) to filter by `transaction.createdAt`. `ExecutionTrustApplication.listTrustRecords()` implements this by paginating the existing `BusinessTransactionService.list()` and resolving each entry via the existing `findByTransactionId()` -- deliberately not a new repository-level `list()` method, since every transaction has exactly one Trust Record and this avoids requiring every `ExecutionTrustRecordRepository` implementation to grow new query surface. Documented in `openapi/openapi.yaml` (`operationId: listTrustRecords`). Commit `2aa585f` | `packages/api/tests/unit/trust-record-api.test.ts`, 3 new cases (empty before any execution; returns the full record after one, matching the `/execute` response's own `trustRecordId`; `since`/`until` filtering). `npm run lint:openapi` clean                                                                                                                                                                                                                                                                                                |
| 47  | `packages/governance-ui`'s `POST /login` -- this codebase's only unauthenticated route that validates a submitted credential against the real API -- had no rate limiting at all, a credential-stuffing/brute-force vector the real API itself doesn't have (no "try a key and see" endpoint exists there)                                                                                                                                               | Added `express-rate-limit` (10 attempts/minute, IP-keyed -- no caller identity exists yet at this point), constructed per-router rather than at module scope so each app instance gets its own counter. Reviewed the rest of `governance-ui`'s security posture in the same pass and found it already solid: session-fixation hardening (regenerate on login), `httpOnly`/`secure`/`sameSite` cookies, and XSS-safe rendering of attacker-controlled `reason`/`proposedBy` fields were all already correct (this package was not in scope for the original Phase 3D/2026-07 audits, which focused on `packages/api`). Commit `373a020`                                                                                                                                                                                                                                                                                                                                     | `packages/governance-ui/tests/integration/app.integration.test.ts`, 1 new case: 11 sequential `POST /login` attempts, the 11th returns 429                                                                                                                                                                                                                                                                                                                                                                                                      |
| 48  | `LOG_LEVEL` was read into config (`Config.ts`) but nothing in the codebase gated any output on it -- every `console.*` call site (17 source files) fired unconditionally regardless of its value, with ad hoc log shape (a bare string here, a structured object there)                                                                                                                                                                                  | New `createLogger(level)`/`getLogger()` (`packages/shared/src/logging/Logger.ts`): debug/info/warn/error methods, each a no-op below the configured minimum level, emitting one JSON line per call. `getLogger()` is a lazy, process-wide singleton built from `loadConfig().logging.level`, the same shape `KeyBootstrap.create()`/`CryptoBootstrap.create()` already use. Commit `147a366`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `packages/shared/tests/unit/logger.test.ts` (5 cases: level gating, stdout/stderr routing, unrecognized-level fallback, structured-field round-trip, singleton identity)                                                                                                                                                                                                                                                                                                                                                                        |
| 49  | `npm audit` found 12 vulnerabilities (3 high, 9 moderate) across the dependency tree, none previously reviewed as a batch                                                                                                                                                                                                                                                                                                                                | `qs` (moderate, array-limit bypass + DoS): `express@4.22.2` pinned it to `~6.15.1` (still vulnerable at 6.15.3), unresolvable by `npm audit fix` alone -- added a root `"overrides"` entry forcing `qs@^6.16.0` everywhere, then `npm dedupe`. `vitest`/`@vitest/coverage-v8` (moderate, path traversal via `@vitest/mocker`): bumped `^4.1.9` -> `^4.1.11` across the root and all 17 workspace `package.json` files (non-breaking patch). `express`, `body-parser`, `js-yaml`, `nanoid`, `brace-expansion` resolved as a side effect via `npm audit fix`. Commit `669b198`                                                                                                                                                                                                                                                                                                                                                                                               | `npm audit` after: 3 moderate remain (`autocannon` -> `hyperid` -> `uuid`), entirely from this same session's new `loadtest` devDependency (gap 42) -- no non-breaking fix exists upstream, and confirmed dev-only, never installed in the production image (`Dockerfile`'s `prod-deps` stage runs `npm ci --omit=dev`). Full workspace `npx tsc -b --force`, `npm run typecheck`, `npm run lint`, `npm run format:check` (for every file this session touched) all clean; `npx vitest run`: 1613 passed, 38 pre-existing gated skips, 0 failed |

Full session verification: every commit above was individually rebuilt (`npx tsc -b`) and
tested before the next change began; a final full-workspace `npx tsc -b --force` plus
`npx vitest run` after all nine commits landed reports 1613 passed, 38 skipped, 0 failed
(two isolated re-runs of the three tests that failed under full-suite parallel resource
contention -- `execution-pipeline-latency.test.ts`'s p99 bound and two `typescript/test/
integration/*` server-startup hooks -- both passed cleanly standalone, confirmed
pre-existing environmental flakiness unrelated to this session's changes, not a
regression).

**Explicitly not closed this session, tracked separately:**

- **CI's `verify-policy-approvals` maker-checker gate remains advisory only**, not a
  required GitHub branch-protection status check. Attempted directly, not assumed: `gh api
repos/{owner}/{repo}/branches/main/protection` returned a live 403 -- "Upgrade to GitHub
  Pro or make this repository public to enable this feature." This is a real external
  platform/billing constraint, not a configuration oversight this session could resolve --
  see D-6 below.
- Key-rotation tooling automation and splitting the settlement poll loop into its own
  container (the original external audit's own LOW-priority items 10 and 13) were left
  deferred, matching that audit's own framing of both as "nice to have"/"not urgent."

---

## Gaps closed in the 2026-09-11 real-deployment verification session

Scope: adding and exercising a new authorization-only policy (`agent-vendor-payment`)
end-to-end against a real, live environment -- a new Vercel deployment of the real API
(`parmana-api-real`, not the standalone buildathon demo), the real `parmana-sandbox`
Supabase project, and real caller authentication -- rather than the in-memory/mocked
paths the existing test suite exercises by default. This is the first time this specific
combination (real Postgres-backed `CallerAuditSink`, `PARMANA_AUTH_DISABLED=false`, a
public deployment) has been exercised, which is what surfaced gap 50 below.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Closed by                                                                                                                                                                                                                                                                                                                 | Verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 50  | `caller_audit_events.type` CHECK constraint (last widened by `20260824090000_add_structural_rejected_to_caller_audit_events.sql`, gap 21's own predecessor chain: 20260812120000, 20260816120000, 20260818130000) never included `'caller.capability_granted'`, even though `packages/api/src/routes/execute.ts` and `transactions.ts` (gap 33 / `docs/CLAIMS.md` NF-004) both write that exact event type unconditionally on every successful, authenticated capability check. Combined with `docs/CLAIMS.md` 2.19's fail-closed audit-write guarantee, this meant every successful, authenticated `POST /execute` or `POST /transactions` call, against a real Postgres-backed audit sink, failed closed with `503 AUDIT_UNAVAILABLE` before Policy Engine evaluation ever ran -- the entire capability-granted happy path was unreachable in that configuration. Invisible in the existing test suite because Supabase-backed integration tests are opt-in (`ALLOW_LIVE_SUPABASE=1`); `InMemoryCallerAuditSink` has no such constraint | New migration `supabase/migrations/20260911090000_add_capability_granted_to_caller_audit_events.sql`, widening the constraint the same way each of its four prior widenings did, adding `'caller.capability_granted'` to the allowed list. Applied directly to `parmana-sandbox` via `supabase db push`. Commit `1eb8881` | Reproduced live: an authenticated `POST /execute` against the real deployed API (`https://parmana-api-real.vercel.app`, real `parmana-sandbox` project, `PARMANA_AUTH_DISABLED=false`) returned `503 AUDIT_UNAVAILABLE` with `error: 'new row for relation "caller_audit_events" violates check constraint "caller_audit_events_type_check"'` before the fix. After applying the migration, the identical request reached Policy Engine and produced a real signed decision -- confirmed both for an approved-amount request (reaches the connector-dispatch stage, see below) and a denied one (clean `403 POLICY_DENIED`, persisted, retrievable via `GET /transactions`) |

**New policy, deliberately authorization-only (G-27 parity).** `policies/agent-vendor-payment/1.0.0/policy.json` was added and exercised end-to-end (real `PolicyEngine`, real Ed25519 signing, real Supabase-backed `ExecutionTrustRecordRepository`/`BusinessTransactionRepository`, both locally and against the live deployment above) as part of this same pass. Its signals (`vendorAllowed`, `withinCredentialLimit`, `withinVelocityLimit`) are unbound, caller-declared attestations with no independent verifier -- structurally the same shape G-27 (below) found in `vendor-payment` and closed by removing its connector from production entirely. This policy was deliberately left the same way: `GatewayConnectorRegistry` has no registration for `agent-vendor-payment`, so a request that reaches Policy Engine APPROVAL still correctly fails at the execution/dispatch stage (`No connector registered for capability 'agent-vendor-payment'`) rather than completing, both locally and on the live deployment. Confirmed no partial Execution Trust Record is left behind when this happens: `GET /trust-records/:businessTransactionId` on the live deployment returned `404` for the approved-but-undispatched transaction. This is authorization-only by design, not an oversight -- see G-27's own "What would need to be true before this capability could be enabled" section for what independent signal verification would require before any real connector could be wired for a payment-shaped capability.

**Also found and fixed in this same session, local-environment/deployment configuration only (not codebase gaps):** the checkout's `.env` had `PARMANA_POLICY_DIR` pointing at a sibling checkout (`D:/last/parmana-exp/policies`) rather than this repository's own `policies/` directory -- corrected to `./policies`. Separately, Supabase's direct-connection host (`db.<ref>.supabase.co:5432`) is IPv6-only and unreachable from Vercel's serverless network (`ENOTFOUND`); the new deployment's `DATABASE_URL` uses the Supavisor connection pooler host (`aws-0-<region>.pooler.supabase.com:6543`, `postgres.<ref>` as the username) instead. Neither is a defect in `parmana-exp` itself.

---

## Gaps closed in the 2026-09-11 PQC production-readiness audit remediation

Scope: closing all four RED findings from that same day's earlier post-quantum cryptographic production-readiness audit (independent third-party verification, public-key discovery, durable-evidence key rotation, hybrid-signature downgrade resistance). Every fix was verified by an executed test, not by code review alone; every new capability was exercised against real signed artifacts, not mocked ones.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Closed by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 51  | **RED-1 (offline verifier).** Every verification capability in this codebase -- the unauthenticated `POST /verify`/`/audit/verify`/`/refusal/verify` routes, and both the TypeScript and Python SDKs' `VerificationApi` wrappers -- was a remote call into Parmana's own server. No standalone function anywhere took a signed artifact plus a public key and checked it with zero network access. (Correction to this audit's own first pass: an external, independently maintained, already-published package, `@parmana/sign` (`github.com/pavancharak/parmana-sign`, real and verified via `gh api`), already provides genuinely offline verification of the classical signature -- but it does not know Parmana's specific Execution-Trust-Record canonical field mapping, and does not recognize the `signatures`/`schemaVersion` hybrid envelope, so it cannot fully verify a real, hybrid-signed Parmana artifact on its own.)       | New `packages/crypto/src/OfflineVerifier.ts` (`verifyExecutionTrustRecordOffline`), exported from `@parmana/crypto`: zero disk/network/env-var access, takes public keys directly, verifies the legacy signature and (when present) every entry in a hybrid `signatures` array. Shares its canonical field mapping with the online `VerificationCrypto` via new `ExecutionTrustRecordCanonicalView.ts` (extracted, not reimplemented, so the two can never silently drift apart). CLI: `scripts/verify-trust-record.ts`. Python counterpart: `python/parmana/crypto/offline_verifier.py` (Ed25519 only -- the installed `cryptography` version has no `ml_dsa` module; stated plainly in its own docstring rather than silently omitted)                                                                                                                     | `packages/crypto/tests/unit/offline-verifier.test.ts` (7 cases: valid record, tampered payload, wrong key, missing key material, unsupported algorithm, valid hybrid, stripped-hybrid). CLI proven against a real record signed by the real online `VerificationCrypto` (valid, then correctly rejects a hand-tampered copy). Cross-language determinism proven for real, not assumed: `python/tests/test_offline_verifier.py` spawns the real TypeScript signer as a subprocess and verifies its output using only the independent Python reimplementation -- 2 cases, including a payload containing a non-ASCII character specifically to stress-test canonical-serialization parity                                                                                                                                               |
| 52  | **RED-2 (public-key discovery).** No `/keys`, `/.well-known/*`, or JWKS-shaped route existed anywhere in `packages/api/src/routes/` -- a third party had no self-service way to obtain Parmana's public key at all, even with an offline verifier in hand. Found and fixed alongside it: `FileKeyProvider.getMetadata()` returned `config.crypto.primarySignatureProvider` (a single global config value) as "the" algorithm for _any_ keyId requested -- wrong for every key other than whichever one happens to match today's config (the `gateway` key, or any rotated `verification-*` keyId from gap 53 below)                                                                                                                                                                                                                                                                                                                          | New `GET /keys/:keyId` and `GET /.well-known/jwks.json` (`packages/api/src/routes/keys.ts`), mounted unauthenticated like `/refusal/verify` and `/audit/verify` -- a credential-gated route cannot be how a third party gets the credential-free key it needs. Returns the key as PEM (RFC 7468, what both offline verifiers above consume) plus, where Node's own `KeyObject.export({format:"jwk"})` supports the algorithm, a `jwk` field (Ed25519 as kty `OKP`, ML-DSA-65 as kty `AKP` -- the real IETF JOSE/COSE-track key type, not invented here). `getMetadata()` fixed to derive algorithm from the key material's own `asymmetricKeyType`, not global config. New `FileKeyProvider.listKeys()` (optional on the `KeyProvider` interface, so no existing test fake breaks) enumerates every `*.public.pem` in the key directory for the JWKS listing | `packages/crypto/tests/unit/file-key-provider.test.ts` (2 new cases: `getMetadata` reports a key's real algorithm even when `PRIMARY_SIGNATURE_PROVIDER` is configured to something else; `listKeys` lists exactly the provisioned keys). `packages/api/tests/integration/keys.integration.test.ts` (5 cases, including one proving the full RED-1+RED-2 combination: a key fetched over real HTTP verifies a real signed record with the offline verifier, zero further server calls). Manually reproduced end to end against a running local server too: `GET /keys/default`, `GET /.well-known/jwks.json`, and a record fetched from `GET /trust-records/:id` verified with `scripts/verify-trust-record.ts` using only the fetched key -- all correct. `openapi/openapi.yaml` documents both routes; `npm run lint:openapi` clean |
| 53  | **RED-3 (durable-evidence key rotation).** `VerificationCrypto`, `RefusalCrypto`, and `AuditEventCrypto` -- the signers for Trust Records, Refusal Records, and Audit Events, the durable evidence an auditor actually queries later -- all hardcoded the literal keyId `"default"` for every new signature, with no way to point new signing at a different key without overwriting `default.private.pem`/`default.public.pem` in place. Reproduced empirically before any fix existed: sign a record, regenerate the "default" keypair (the only rotation the code as it stood actually supported), re-verify the original record -- fails. `docs/architecture/KEY-MANAGEMENT.md` separately documented a `generate/load/save/export/import/rotate/list/delete` `KeyProvider` API that has never existed in code -- `FileKeyProvider` implements only four of those eight methods, and `rotate()` does not exist anywhere in this codebase | New `currentVerificationKeyId()`/`currentVerificationSecondaryKeyId()` (`packages/crypto/src/KeyProvider.ts`), read fresh on every signing call from `PARMANA_VERIFICATION_KEY_ID`/`PARMANA_VERIFICATION_SECONDARY_KEY_ID` (unset falls back to the unchanged literal `"default"`/`"default-secondary"`), mirroring `createGatewayKeyPair.ts`'s existing `PARMANA_GATEWAY_KEY_ID` precedent exactly. All three signers now call these instead of the hardcoded constants for NEW signatures; verification is unaffected (it already resolved the public key by the record's own stored keyId, not a hardcoded "current" one). New `scripts/rotate-verification-key.ts`: generates a new keyId's key pair, never touches or deletes any existing key file, prints the env var to set                                                                          | `packages/crypto/tests/unit/verification-crypto-rotation.test.ts`: signs a record under the default keyId, "rotates" by generating a fresh keyId's key pair and pointing `PARMANA_VERIFICATION_KEY_ID` at it, signs a second record, and confirms -- with a freshly constructed `VerificationCrypto`, simulating a new process after redeploy -- that BOTH the pre-rotation and post-rotation records verify correctly under their own distinct keys. This is the automated version of the empirical reproduction above; the reproduction failed before the fix and this test passes after it                                                                                                                                                                                                                                         |
| 54  | **RED-4 (hybrid-signature downgrade).** `VerificationCrypto.canonicalRecord()` excludes `schemaVersion`/`signatures` from the hashed content, and `verifySignature()` silently falls back to legacy-only verification whenever `signatures` is absent -- proven exploitable by the codebase's own pre-existing test, `verification-service-hybrid.test.ts`'s `"still verifies a legacy-shaped record ... additive, not breaking"`, which strips both fields from a genuinely hybrid-signed record and asserts it still verifies. Baking `schemaVersion` into the hash (the naive fix) was considered and rejected: it would change the canonical bytes -- and therefore invalidate the signature -- of every record ever issued, hybrid or not, directly violating this remediation's own no-breaking-changes constraint                                                                                                                     | New `requireHybridSignature` config flag (`HYBRID_SIGNATURE_REQUIRED`, `packages/shared/src/config/Config.ts`), off by default. When enabled, `VerificationCrypto.verifySignature()` rejects outright (no legacy-only fallback) if `signatures` is absent or empty -- closing the downgrade for any deployment that opts in, with zero effect on any already-issued signature, since it is a verify-time policy decision, not a change to what is signed. Deliberately policy-gated rather than hash-based, per this remediation's own explicit before-starting decision                                                                                                                                                                                                                                                                                     | `packages/runtime/tests/unit/verification-service-hybrid.test.ts`, two new cases added alongside the original (kept, unmodified, still describing the correct default-off behavior): with `HYBRID_SIGNATURE_REQUIRED=true`, the identical stripping the original test performs now correctly fails; a genuinely complete hybrid record still verifies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Full verification: `npx tsc -b` clean; `npx eslint . --ext .ts` clean (repo-wide); `npx vitest run` (full workspace): 1653 passed, 38 pre-existing gated skips, 0 failed; `python -m pytest` (full `python/` suite): 69 passed, 0 failed. Commit `1f4b292`.

**Not fixed, by design, per this remediation's own explicit scope:** a Go reference verifier (the original remediation plan's TASK 1 as drafted) was not built -- this repository has no Go anywhere, and introducing an entire second language toolchain for one CLI was judged a real scope increase beyond "fix gaps, no redesign," confirmed with the user before starting. Python was used instead, since it already exists as a first-class SDK language here. Whether to also update the external `@parmana/sign` package (a separate, real, published, admin-accessible repository) was raised but deliberately left as a distinct decision, not folded into this remediation.

**Update (2026-10-03):** the external-package half of this gap is now done. `@parmana/sign`
0.2.0 (published on npm) ships the Execution Trust Record field mapping, the hybrid
`signatures`/`schemaVersion` envelope and `verifyExecutionTrustRecordOffline`, tested
against fixtures signed by this repository's `packages/crypto` code. The canonical
serializer parity fix for literal `"__proto__"` keys landed here in
pavancharak/AgentLabsBuildathon#128.

---

## Gaps closed in the 2026-09-14 execution-audit-trail hardening session

Scope: an independent audit (`GAPS.md`, written against the "Authorization Without Execution Is Just a Promise" Substack post's claims about this repository's execution gateway) found three candidate gaps in the authorization -> proof-verification -> Paytm-execution -> audit-log chain. Two were real and are closed here; the third was examined and found to already be handled by existing code, differently than the audit proposed -- see "Gaps checked and found not applicable" below.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Closed by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 55  | **GAP-1: `ExecutionAuditSink` was in-memory only** (`MemoryExecutionAuditSink`), in production, not only in tests. `session.created`/`execution.completed`/`execution.rejected` events -- the durable record of what the Execution Gateway actually did -- were lost on every process restart and not queryable outside the running process, unlike the analogous `CallerAuditSink` fix already closed (§2.16, `docs/CLAIMS.md`)                                                                                                                                                   | New `SupabaseExecutionAuditSink` (`packages/storage/src/supabase/SupabaseExecutionAuditSink.ts`), wired via `packages/api/src/bootstrap/createExecutionAuditSink.ts`: `NODE_ENV=test` still gets `MemoryExecutionAuditSink` unchanged; every other environment fails closed at startup (`assertDatabaseUrlConfigured`) if `DATABASE_URL` is unset, else writes through `PostgresPoolFactory`, signed at write time (`AuditEventCrypto`) and chained per `authorizationId` (Postgres advisory-lock-serialized, same discipline as `SupabaseCallerAuditSink`). New migration `supabase/migrations/20260914120000_add_execution_audit_events.sql`. Also exposes `query(filter)` for regulator/operator lookups by `authorizationId`, `businessTransactionId`, `connectorId`, `type`, or date range                                                                                                                                                                                                           | `packages/storage/tests/unit/supabase-execution-audit-sink.test.ts` (12 cases: mapping, chaining, tamper-detection via `AuditEventCrypto.verify()`, query filters); `packages/api/tests/unit/bootstrap/create-execution-audit-sink.test.ts` (4 cases, mirroring `create-caller-audit-sink.test.ts`'s own fail-closed assertions); `packages/api/tests/integration/supabase-execution-audit-sink.integration.test.ts` (live-DB, `ALLOW_LIVE_SUPABASE=1`-gated, including the literal "execute -> query audit -> retrieve complete chain" the audit asked for) |
| 56  | **GAP-3: `parmana-paytm-agent` (a separate repository, `PAYTM_CONNECTOR_URL`) recorded nothing at all** for either a successful or rejected refund on its side of the trust boundary -- not even a console log -- despite already correctly verifying the Ed25519 authorization signature (ADR-0009 Phase 2B) before ever calling Paytm. `docs/CLAIMS.md` §3.22 had (accurately, at the time) described that repository's own implementation as out of this codebase's scope to build or verify; this session did both, directly in that repository, with the user's authorization | New `src/parmana/audit.ts` in `parmana-paytm-agent` (that repository's first-ever runtime dependency, `pg`): records `authorization.verified` immediately after signature verification succeeds, then `execution.completed`/`execution.rejected` after the Paytm call resolves -- two rows, not one, so a crash between verification and execution stays visible. Writes into the _same_ `execution_audit_events` table as gap 55 above, correlated by `businessTransactionId` (the only identifier both services actually share -- Parmana's own `authorizationId` is never forwarded across this wire boundary), not `authorizationId`. Deliberately unsigned/unchained (`signature_json`/`chain_hash`/`chain_position` NULL): that service holds Parmana's public key only, never a private signing key -- see two new migrations relaxing those columns to nullable and adding the `business_transaction_id` correlation column (`20260914130000_...`, `20260914140000_...`, both in this repository) | `parmana-paytm-agent`'s own `tests/unit/execute-authorized-connector-request.test.ts`: 3 new cases asserting the exact event-type sequence and recorded reason for the success path, the signature-verification-failure path (never reaches `authorization.verified`), and the Paytm-decline path. Full suite there: 40/40 passing. This repository's own `ExecutionAuditEvent`/`ExecutionControlService` changes (adding `businessTransactionId`, widening the `type` union) verified by the full monorepo suite: 592/592 passing from repo root            |

Full verification: `npx tsc -b` clean (both repositories); `npx eslint`/`npm run lint` clean (both repositories); `npx vitest run` from this repository's root: 592 passed, 42 gated skips, 0 failed; `parmana-paytm-agent`'s own `npm test`: 40 passed, 0 failed.

**Environment-caused false alarm, worth recording so it isn't repeated:** an earlier pass of this same session ran `packages/api`'s test suite via `cd packages/api && npx vitest run`, not from the repository root, and got 10 failing tests including the entire `paytm-refund.integration.test.ts` suite (`404` on `/execute`, actually a swallowed `PolicyNotFoundError` -- `.env`'s `PARMANA_POLICY_DIR=./policies` resolves relative to `process.cwd()`, which is `packages/api` from that invocation, not the repository root where `policies/` actually lives). Root package.json's own `test` script (`vitest run`, no `cd`) and CI's `npm test` both already run from the root; the failures were an artifact of an unusual invocation, not a real regression. Confirmed by rerunning identically from the root: 0 failures.

---

## Gaps closed in the 2026-09-20 fail-closed policy binding session

Scope: a line by line read of the execution enforcement path (`ExecutionGateway`, `RuntimeEngine`, `PolicyGovernanceExecutionVerifier`, `createPolicyExecutionVerifier`) against the claim that no execution exceeds its approved authority. Two real fail open behaviors were found and are closed here. Two narrower limits were found and are recorded as open gaps G-50 and G-51 below, not fixed.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Verified                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 57  | **The Execution Gateway skipped its policy check instead of failing it.** `ExecutionGateway.verify()` ran the policy freshness check only when a `PolicyRepository` was wired and the authorization carried a `policyContentHash`. Either being absent left `policyStillCurrent` undefined, and `isSoleFailureNonceReplay` and `valid` both treated undefined as a pass. An older authorization with no `policyContentHash` therefore released without any policy check. RESOLVED 2026-09-20: by default the gateway requires a `policyRepository` and a `policyApprovalVerifier` at construction, rejects an authorization with no `policyContentHash` (`policyStillCurrent: false`), and requires `policyStillCurrent === true` and `policyGovernanceVerified === true` for `valid`. The only opt out is the explicit `allowUnverifiedPolicy: true`, set on legacy test fixtures and examples and never in production bootstrap. Old authorizations without a hash are now rejected by design.                                                                                                                                                    | `packages/execution-gateway/tests/unit/policy-binding-fail-closed.test.ts` (10 cases, each failure asserts zero connector calls and the nonce is not burned). Full repo `npx vitest run`: 1871 passed, 42 skipped, 0 failed.                                                          |
| 58  | **Execution time policy governance verification was opt in, and was off in production.** `createPolicyExecutionVerifier()` returned `undefined` unless `POLICY_EXECUTION_VERIFICATION_ENFORCED` was exactly `"true"`. The live production startup log on 2026-09-20 showed `policyExecutionVerifierConfigured: false`, so a policy with no approval record, a bad approval signature, or content edited outside the approval API could still authorize executions. The approval record was also never re-checked at the gateway, only before authorization. RESOLVED 2026-09-20: the verifier is enforced everywhere except when `NODE_ENV` is exactly `test` or `development`, so an unset or unrecognized `NODE_ENV` is enforced and the environment variable cannot turn it off in production. The gateway now runs the same approval record check against the live hash at release, so the approved hash, the signed hash and the live hash must all agree. Operational precondition: every policy a deployment executes against needs a genuine signed approval record before that deployment is promoted, or executions under it are refused. | `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts` (enforced in production, env var cannot disable it in production, enforced when `NODE_ENV` is unset or unrecognized, off in test and development unless exactly `"true"`), plus the gateway cases above. |

---

## Gaps closed in the 2026-09-20 KMS large message signing session

Scope: a live `paytm:refund` through production `/execute` returned `500`. The runtime log showed AWS KMS rejecting the message being signed as longer than 4096 bytes. One real gap is closed here. A related ordering gap found in the same run is recorded as G-52 and not fixed.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 59  | **Trust records could not be signed under AWS KMS.** `KmsSigner.sign()` sent the full canonical bytes to KMS with `MessageType: RAW`, and KMS caps a raw Ed25519 message at 4096 bytes. A full Execution Trust Record, with its bound authorization, connector evidence and governance anchor, is larger, so every real execution that reached record signing failed with `500`. The same limit applied to any artifact signed through a `Signer`, such as an authorization with large parameters. It was not seen earlier because KMS tests only used the small `test:fixture-execute` record. RESOLVED in code 2026-09-20 (ADR-0010): a message over 4096 bytes is signed as a fixed 97 byte commitment (prefix, NUL, SHA-512 digest) and verified accordingly. The scheme is a pure function of length, so no schema change is stored and every earlier signature stays valid. A commitment signature over a small message is rejected. The TypeScript verifiers and the Python offline verifier implement the rule, and a third party verifier must too. | `packages/crypto/tests/unit/signature-commitment.test.ts` and `kms-signer.test.ts`, and `python/tests/test_offline_verifier.py` (TypeScript signs a large record as a commitment and Python independently verifies it). Verified live against the real AWS KMS service on 2026-09-20 (production commit 333786a): a synthetic `paytm:refund` returned `200`, the trust record was 4965 bytes, its signature verifies only as the commitment and `verifyExecutionTrustRecordOffline` accepted it against the live `GET /keys/default`. |

---

## Gaps closed in the 2026-09-21 Execution Intents session

Scope: gaps G-52 and G-53, recorded on 2026-09-20 and deferred, then built on 2026-09-21 after the decision was reversed. The design is `docs/adr/ADR-0012-Signed-Execution-Intent-Before-Release.md`. Two limits found while building it, G-54 and G-55, were both closed the same day, G-55 published in SDK 1.2.0 on 2026-09-21.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 61  | **A released action could have no signed evidence, and a missing Execution Trust Record could not be rebuilt (G-52, G-53).** CLOSED 2026-09-21 for the risk they named, with limits. Before an action is released, the runtime now signs and stores an Execution Intent, and refuses with `503 EXECUTION_INTENT_UNAVAILABLE`, releasing nothing, if it cannot. After release it saves the execution context on the intent. A missing Trust Record is rebuilt with `POST /execution-intents/{businessTransactionId}/finalize`, which never calls the connector, is idempotent and race safe, and also verifies the record and generates the receipt. Enforced everywhere except `NODE_ENV` `test` or `development`. Limits: an intent proves what was about to be released and not that it was released or what happened; finalize cannot rebuild a record when the context was not saved and refuses with `409`; see G-54 and G-55. | `packages/runtime/tests/unit/execution-intent.test.ts`, `packages/crypto/tests/unit/execution-intent-crypto.test.ts`, `packages/storage/tests/unit/execution-intent-repository.test.ts`, `packages/api/tests/integration/execution-intents.integration.test.ts`, `packages/api/tests/unit/bootstrap/create-execution-intents.test.ts`, `packages/api/tests/unit/routes/ready.test.ts`. The Postgres queries were run against a real Postgres (16 checks). Verified live on 2026-09-21 with the production image, a real Postgres, the real KMS key `alias/default` and the real `parmana-paytm-agent` using fake Paytm staging credentials: 23 of 23 checks (a normal request, a released action with no stored record repaired with the connector called once in total, and an intent that could not be stored releasing nothing). Not verified: the Vercel OIDC role signing an intent, latency from Vercel, a real Paytm refund. `docs/CLAIMS.md` section 2.39.                                                                    |
| 62  | **An Execution Intent reconciled by hand could not be closed (G-54).** CLOSED 2026-09-21. `POST /execution-intents/{businessTransactionId}/resolve` lets a verified human close a `PREPARED` or `ERRORED` intent with what they found (`NOT_EXECUTED` or `EXECUTED`) and a required note, attributed and timestamped. It leaves the unfinalized list. It never calls a connector, is idempotent, and refuses `RELEASED`, `FINALIZED` and any transaction that has a Trust Record. **Limit:** the resolution is stored in unsigned status, so it is not tamper evident and it is not a Trust Record.                                                                                                                                                                                                                                                                                                                                 | `packages/runtime/tests/unit/execution-intent.test.ts` (closing from `ERRORED` and `PREPARED`, idempotency, a lost race, refusing `RELEASED` and `FINALIZED`, input validation), `packages/storage/tests/unit/execution-intent-repository.test.ts`, `packages/api/tests/integration/execution-intents.integration.test.ts` (over HTTP, including a Trust Record that already exists). The SQL was run against a real Postgres (12 checks, including both constraints). Verified live on 2026-09-21 with the production image, a real Postgres and the real agent chain, a real connector failure produced an `ERRORED` intent that a human closed: 35 of 35 checks with local signing keys, and 37 of 37 under the real AWS KMS key `alias/default`. An earlier KMS attempt failed one scenario for a network reason unrelated to the feature (the agent could not reach Paytm staging), and the check now answers the agent's Paytm call locally, so it no longer depends on the internet (37 of 37 three times in a row under KMS). |
| 63  | **The SDKs could not verify or manage Execution Intents (G-55).** CLOSED 2026-09-21 and **published** in SDK 1.2.0 (TypeScript on npm, Python on PyPI). Both SDKs have the five intent methods, and Python has an offline verifier that needs only the public key. **Limits:** not in 1.1.6 or earlier, and the TypeScript SDK has no offline intent verifier.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `typescript/test/ExecutionIntentApi.test.ts` (13 tests), `python/tests/test_execution_intent_api.py` and `python/tests/test_offline_intent_verifier.py` (24 tests, including a REAL server signed intent, and intents signed by the TypeScript signer with non ASCII text, verified in Python). Python: `ruff`, `black`, `mypy` and 109 tests pass. **Both SDKs were run against the live server** (real Docker image, real Postgres): read, verify (including the Python decode then encode round trip the server accepted), list, finalize, resolve, and the error classes for a non human caller, a conflict, a validation error and a missing intent.                                                                                                                                                                                                                                                                                                                                                                             |

---

## Gaps closed in the 2026-09-20 signing readiness session

Scope: gap G-52 found in the live refund run. It is mitigated here, not closed. What remains is recorded as G-53.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 60  | **The runtime released the action before checking that the evidence signing path could work, and a failure after release surfaced as a generic `500`.** A persistent signing problem (a missing, disabled or denied key, a KMS outage, a key mismatch, a size limit) was only discovered after the connector had been called, and the caller saw `Internal Server Error`, which reads as "nothing happened" and invites a blind retry. MITIGATED 2026-09-20 (ADR-0011): before release the engine proves signing works with a real round trip through the same signer and key, cached for 60 seconds, failing closed with `503 SIGNING_UNAVAILABLE` and nothing executed. A failure after release is now `500 EXECUTION_RECORD_INCOMPLETE` with the `businessTransactionId` and `authorizationId`, and a critical log event. Enforced everywhere except `NODE_ENV` `test` or `development`. This does not remove the residual window, see G-52 and G-53. | `packages/runtime/tests/unit/signing-readiness.test.ts` and `execution-record-incomplete.test.ts` (readiness failure leaves the release counter at zero, failure after release carries the identifiers, a policy rejection before release is not reclassified), `packages/crypto/tests/unit/signing-probe.test.ts`, `packages/api/tests/unit/bootstrap/create-signing-readiness.test.ts`. Verified live on 2026-09-20 (production commit 4047536): `signingReadinessConfigured: true` in the startup log, and a synthetic `paytm:refund` returned `200` with `VERIFIED`, which required the readiness probe to pass against the real KMS. The `503` and `EXECUTION_RECORD_INCOMPLETE` responses are covered by unit tests, not by live fault injection. |

---

## Gaps opened in the 2026-09-25 self hosted deployment audit, and closed the same day

Scope: a read of the source on 2026-09-25, as the first step of offering a deployment the
customer runs next to the hosted API on Vercel, then the build that closed what the read found.
The summary of the deployment is in `docs/CURRENT-STATE.md`, section "Self hosted deployment",
and the operator guide is `DEPLOYMENT.md`, section "Self hosted with Docker Compose".

**Where it was verified:** Docker Desktop 29.8.0 on Windows 11, 2026-09-25, and on Linux in
CI run 36113024609 (`.github/workflows/docker-image.yml`, job `self-hosted`, 2026-09-25, on the merge commit `a14bc5c`): one command start, the second start keeping everything, and the offline check,
12 of 12. The work was merged to `main` as `4275365`, merge `a14bc5c`. `npx vitest run` before the build: 2,056 passed, 42 skipped,
0 failed; after it: 2,069 passed, 42 skipped, 0 failed, and `npm run lint` and
`npx tsc -b packages/api` clean.

**G-56. There was no one command local deployment. CLOSED 2026-09-25.** Before: no Docker
Compose file existed, and running the image took hand steps (start Postgres, create the roles
`anon`, `authenticated` and `service_role`, apply the migrations, generate the `default` and
`gateway` Ed25519 key pairs, hash an API key into `PARMANA_API_KEYS`, mount `keys/`), proven
only as CI shell steps. **Fix:** `docker-compose.yml` does all of it with
`docker compose up -d --build --wait`: `setup` (`docker/local/setup.mjs`) makes the keys and an
API key in `./parmana-local` inside the image, so the host needs only Docker, and keeps them on
every later start; `migrate` and `seed` prepare the database (G-58); `api` runs the unchanged
production image with `PARMANA_STORAGE=postgres`. `./parmana-local` is in `.gitignore` and
`.dockerignore`. **Verified:** a clean start reached `healthy`; `GET /ready` returned
`{"status":"READY","authDisabled":false}`; `POST /execute` returned `401` with no key and `400`
with the generated key and an empty body; the startup log showed signing readiness, Execution
Intents and refusal recording configured. A second start kept both key files and
`api-keys.json` byte for byte (SHA-256 compared), and the six caller audit rows written before
it were still there.

**G-57. The storage provider names did not match what the code does. CLOSED 2026-09-25.**
Before: `StorageFactory.create()` threw "Postgres storage provider not implemented." for
`postgres`, while `supabase` already was a plain Postgres implementation over `DATABASE_URL`.
**Fix:** `postgres` now selects the same implementation as `supabase`, everywhere the name is
checked: `StorageFactory.create()`, `assertStorageConfigured()` and `GET /ready`, through one
helper, `isPostgresStorage()` (`packages/shared/src/config/StorageProviders.ts`). `supabase`
keeps working unchanged. SQLite was not built: every non test deployment needs Postgres anyway,
because the caller audit sink and the nonce store require `DATABASE_URL`. **Tests:**
`packages/storage/tests/unit/storage-factory.test.ts`,
`packages/api/tests/unit/bootstrap/assert-storage-configured.test.ts`,
`packages/api/tests/unit/routes/ready.test.ts` and
`packages/shared/tests/unit/config-validation.test.ts`, 57 of 57 passing, including the new
cases for `postgres`. The deployment above runs with `PARMANA_STORAGE=postgres`.

**G-58. Migrations were not applied at start, and one migration assumes Supabase roles.
CLOSED 2026-09-25 for the Compose deployment.** **Fix:** the `migrate` service
(`docker/local/migrate.sh`) creates the three roles when missing
(`docker/local/postgres-roles.sql`), then applies each file in `supabase/migrations/` once, in
its own transaction, and records it in `parmana_schema_migrations`. The API starts only after it
succeeds. The `seed` service (`docker/local/seed-policies.mjs`) copies the shipped policies
into the `policies` table, which production reads instead of the disk, adding only versions
not already there, so a policy changed through governance is never overwritten. **Verified:**
first start, `31 applied, 0 already applied` and `14 added`; second start,
`0 applied, 31 already applied` and `0 added, 14 already present and kept`. **Scope:** the
container itself still does not migrate; a deployment that runs the image without Compose
still applies migrations by hand (`DEPLOYMENT.md`, "Applying the schema").

**G-59. "Console sync" named in the 2026-09-25 plan did not exist. CLOSED 2026-09-25, not
needed.** Nothing in this repository sends audit events to a hosted console: they are written
in the same request to the deployment's own Postgres (`SupabaseCallerAuditSink`,
`SupabaseExecutionAuditSink`, `execution_intents`), so there was nothing to extract and
`/execute` never waited on a remote call. The item was dropped from the plan on 2026-09-25. If a
central view across customer deployments is wanted later, it is new work, to be designed then.
The plan's source files (`CLAUDE-API-PACKAGE.md`, `PARMANA-SAAS-LOCAL-EXECUTION-PLAN.md`,
`PARMANA-SAAS-LOCAL-SERIES-A-PITCH.md`, `PARMANA-CLAUDE-STUDY-REPO-END-STATE.md`) are still not
in this repository.

**G-60. Running with no outbound network had not been tested. CLOSED 2026-09-25.** Before:
that enforcement makes no call to the hosted service was a reading of the code. **Fix:** an
offline check, `bash docker/local/offline-check/run.sh`
(`docker-compose.offline-check.yml`, `docker/local/offline-check/`). It builds the images while
online, then runs a separate copy of the stack (own project, own database, the deployment's
own signing keys, its own throwaway API keys) on a Docker network created with
`internal: true`. The downstream system is a stand in for `parmana-paytm-agent` that verifies
the Execution Gateway's signature with only the public key and never calls Paytm. The API's
rule that a connector URL must be HTTPS in production was kept: the stand in serves HTTPS with
a certificate made for the run, trusted by the API through `NODE_EXTRA_CA_CERTS` for that run
only. **Verified:** 12 of 12 checks, on each of four clean runs (the last one after the final edit to the check): no internet route from the
network (`https://1.1.1.1` and `https://registry.npmjs.org` both unreachable); READY; a
verified human proposed `customer-refund` 1.0.0 (`201`), was refused as its own approver (`403
SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`), and a second human approved it with a signed step up
authorization (`200`); an authorized refund returned `200` and reached the stand in once, with
the gateway signature verified; a refund over the policy threshold returned `403 POLICY_DENIED`
("Refund rejected because the requested refund amount exceeds the maximum permitted
threshold.") and never reached the stand in; the Trust Record verified with only the two public
keys, and a copy with the amount changed failed. The saved record was verified again on the
host, outside Docker, with `scripts/verify-trust-record.ts`: `valid: true`, `hashValid: true`,
`legacySignatureValid: true`. **Not covered:** a real downstream system, connectors other than
Paytm, and a machine that has never been online (the images are built while online).

**G-61. The migration bundle is not safe to run again on a database that holds data. FOUND,
MITIGATED 2026-09-25, `pre-production`.** Found while building G-58: the first version of the
`migrate` service applied again `scripts/apply-all-migrations.sql` on every start. On the second
start, with caller audit rows already written, it failed with `check constraint
"caller_audit_events_type_check" of relation "caller_audit_events" is violated by some row`.
Several migrations drop and add back that constraint with a longer list of allowed event types
each time, so running it again adds back an older, narrower constraint over rows written under a newer
one. The bundle's own header and `DEPLOYMENT.md` said it was safe to run again; both are corrected
(`scripts/migrationbundle/header.txt`, bundle regenerated,
`tests/architecture/migration-bundle-up-to-date.test.ts` passing). **Mitigation:** the Compose
deployment applies each migration once (G-58). **Still open:** a hosted or hand run database
has no record of which migrations it has, so an operator applying the bundle a second time
there would hit the same failure. It fails inside the statement and changes nothing, but it
blocks the upgrade.

**CLOSED 2026-09-25.** `npm run db:migrate` (`scripts/migrate-database.ts`,
`scripts/migrations/runMigrations.ts`) brings the same tracking to any Postgres through
`DATABASE_URL`: `status` (read only), `apply` (each pending migration once, in its own
transaction, recorded in `parmana_schema_migrations`, the table the Compose deployment already
uses) and `apply --dry-run` (read only), and `baseline --through <file>` for a database whose
schema was created by other means, which records the migrations as applied without running
them. Every command prints the database it uses, and whether it writes, before doing anything;
a mistyped command opens no connection. **Verified** on a real Postgres 16: a fresh database,
31 applied then 0 on a second run; and the failure this gap describes, reproduced first (the
bundle run again over a row of a newer event type fails on
`caller_audit_events_type_check`), then fixed on the same database by `baseline` (31 recorded)
and `apply` (0 applied, the row intact). Unit tests: `scripts/tests/run-migrations.test.ts`
(7), including that `status` and `--dry-run` write nothing. The production runbook
(`docs/site/deployment/production.mdx`, step 2), `DEPLOYMENT.md` and the bundle's header now
point to it. **Incident while building it:** one check meant to run without `DATABASE_URL`
read it from the repository's `.env` instead and connected to the Supabase project in that
file; the first version of `status` then created an empty `parmana_schema_migrations` table
there. Nothing else was written and no migration ran. `status` has been read only since, and
the database is named before any command runs. The empty table is harmless and is left for
the operator to keep (it is what `baseline` would create) or drop.

**G-62. Approving policies on a self hosted deployment needed the repository's signing script
on the approver's machine. CLOSED 2026-09-25 (see the end of this entry).** In production a policy
authorizes nothing until it has completed policy governance (`docs/CLAIMS.md` 2.35), so a new
deployment refuses every request with `403 POLICY_DENIED` and "has no
PolicyChangeApprovalRecord" until its own people approve the policies they use. That is correct
and is kept: `seed` does not approve anything, because approving would fabricate governance
evidence. **Narrowed the same day:** issuing the proposer's and approver's API keys no longer
needs the repository or hand editing of `api-keys.json`: `docker/local/api-keys.mjs` runs inside
the image, reads the approver's step up public key from standard input, and checks every change
with the server's own parser. **Still open:** signing the step up authorization
(`scripts/sign-policy-change-step-up.ts`) is a TypeScript script run with `npx tsx` from a clone
of the repository with `npm install`, because the approver's step up private key must stay on
the approver's machine and the image cannot be used there without Docker. **Closed in the
source the same day (G-64):** SDK 1.3.0 signs from either SDK, installed with `npm install` or
`pip install`, with no clone of the repository. **CLOSED 2026-09-25** when `@parmana/sdk` 1.3.0 was published to npm: an approver installs it with `npm install @parmana/sdk` and signs with `signPolicyChangeStepUp()`, verified from the npm package against a live deployment. The Python SDK 1.3.0 was published to PyPI the same day and signs too (`sign_policy_change_step_up()`), also verified from the PyPI package against a live deployment. The steps are documented and tested in CI
(`docs/site/self-hosted/policy-approval.mdx`, `docker/local/quickstart-check.sh`).

**G-63. An authorized action whose connector cannot be reached returned a bare `500`. CLOSED 2026-09-25,
`pre-production`, found 2026-09-25.** Found while documenting connectors: with
`PAYTM_CONNECTOR_URL` pointing at a host that does not resolve, an authorized `paytm:refund`
returned `500` with `{"error":"Internal Server Error"}`. The Execution Intent was stored in state
`ERRORED`, which is the designed record of an unknown outcome, and the API log shows the cause
(`getaddrinfo ENOTFOUND ...`). But the response carries no `businessTransactionId`, no code and no
statement that the outcome is unknown, unlike `EXECUTION_RECORD_INCOMPLETE` (ADR-0011). A caller
cannot tell this from any other server error and may retry blindly. Documented in
`docs/site/self-hosted/connectors.mdx` and `docs/site/self-hosted/troubleshooting.mdx`. Not
checked: whether a connector timeout or an HTTP error from a reachable connector answers the
same way.

**CLOSED 2026-09-25.** A release error that has no typed response of its own is now
`502 EXECUTION_OUTCOME_UNKNOWN` (`packages/runtime/src/errors/ExecutionOutcomeUnknownError.ts`,
`RuntimeEngine.outcomeUnknown()`), whose message names the `businessTransactionId` and
`authorizationId` and tells the caller not to retry as a new transaction and to close the
intent with resolve, matching the ERRORED intent. The cause's own message is still never in
the response; it is in a critical `execution_outcome_unknown` log line (with the full error,
so a nested reason such as `getaddrinfo ENOTFOUND` is visible) and in the intent's
`failureReason`. Errors that already have a typed response (a `RuntimeError`, a
`ParmanaError` such as `CONNECTOR_NOT_REGISTERED`, a `PolicyError`) pass through unchanged. It
covers timeouts and HTTP error responses too: every connector adapter raises a plain `Error`
for them, which takes the same path. **Tests:**
`packages/runtime/tests/unit/execution-intent.test.ts` (a release error becomes
`EXECUTION_OUTCOME_UNKNOWN` with the ids and without the cause's message; a typed error passes
through), `packages/api/tests/integration/execution-failure.integration.test.ts` (over HTTP:
`502`, the code, the transaction id, and the injected failure message absent). **Verified
live** on the self hosted deployment with `PAYTM_CONNECTOR_URL` pointing at a host that does
not resolve: `502`, `EXECUTION_OUTCOME_UNKNOWN`, both ids in the message, the intent `ERRORED`,
and the critical log line. The OpenAPI description of `POST /execute` and `POST
/transactions`, the error catalog and every page that listed outcome codes now include it.

**G-64. The two SDKs did not cover the same API, and neither covered policy governance. CLOSED
2026-09-25, SDK 1.3.0, published to npm and PyPI the same day.** Found by mapping each of the 37
operations in `openapi/openapi.yaml` to the methods of each SDK. Before: neither SDK could
propose, list, approve or reject a policy change, or sign a step up authorization, so policy
governance needed the repository's scripts (the cause of G-62); neither had `GET /callers/me`,
`GET /keys/{keyId}` or `GET /trust-records`; only Python had offline verification,
`GET /receipt/latest/{id}` and the HTTP status on errors. **Fix:** both SDKs now have all of it,
with the same result fields, and the Python offline verifiers also accept the SDK's own models.
Tests, the live run and the scope are in `docs/CLAIMS.md` 2.41; the mapping is
`docs/site/sdks/api-coverage.mdx`. **Found while fixing:** the Python SDK's model encoder
rewrites any dict key containing an underscore to camelCase, which would have changed a
customer's policy content if a proposal were sent through it; the new methods send policy
content and step up authorizations unchanged, and a test checks this. Also: `client.version`
in Python is the SDK's own version, while `version()` in TypeScript is the server's; documented,
not changed. **Published:** the TypeScript SDK 1.3.0 on npm on 2026-09-25, checked by installing it from npm and rerunning the live checks (11 of 11). The Python SDK 1.3.0 was published to PyPI the same day and checked the same way (11 of 11). Nothing is open.

## Gaps opened in the 2026-09-27 human approval review

Scope: a proposed product flow was checked against the source code only, not against earlier
documentation. The flow: an agent's refund is refused, a manager finds it in the database, signs
an approval, and the agent retries with the approval attached. Two gaps were found. Neither is
fixed.

**G-65. A refused request cannot be escalated to a person and then approved. FOUND 2026-09-27,
`pre-production`. BUILT the same day for refunds (see "Built" at the end of this entry); open
until deployed with a real approver.** What the code did when found:

- **Policy has two outcomes.** `PolicyOutcome` is `APPROVE` or `REJECT`
  (`packages/policy/src/types/PolicyOutcome.ts`), and `DecisionOutcome` is `APPROVED` or
  `REJECTED` (`packages/shared/src/domain/decision.ts`). A refusal is final. Nothing holds a
  request for review and nothing notifies a person. `BusinessTransactionStatus.OVERRIDDEN` is
  declared and never set.
- **Finding refused requests works.** A policy refusal is stored in `refusal_records` with the
  intent, the decision (including the policy name and the reason), any binding violations,
  `submitted_by` and `created_at`, and it is signed. Refusals that happen before policy runs
  (authentication, capability scoping, principal checks, structural validation) are in
  `caller_audit_events` instead. The `refusal_records` write can fail without failing the
  request (`docs/CLAIMS.md` 3.11), so a query can miss rows; each miss is logged as
  `refusal_record_write_failed`.
- **A retry is a new transaction.** `business_transaction_id` is unique, so the refused
  transaction cannot be run again.
- **For `paytm:refund`, a signed approval changes nothing.** `customer-refund` 1.0.0 approves
  only when `refundAmount` is 10000 or less. Above that, `reject-excessive-refund` applies and has
  no approval exception, so a ₹75,000 refund is refused with or without a manager. At or below
  10000, `managerApproved` is a value the caller sends and nothing checks (G-51), so an agent can
  approve itself.
- **The only checked approval is on HubSpot.** A signed approval is verified only for
  `hubspot:deal-update` amount changes above the threshold (`HubSpotSignalStateVerifier`,
  `packages/approval`). `TRUSTED_APPROVAL_ISSUERS` is empty
  (`packages/api/src/bootstrap/createApprovalIssuerRegistry.ts:40`), so every such approval fails
  today.

**What can be said today:** a refused action is blocked and leaves a signed Refusal Record that
people can review. **What cannot be said:** that a decision escalates to a person, or that a
manager's approval lets a refused refund run.

**Plan, not built:**

1. **Verify the approval.** Add a `SignalStateVerifier` for `paytm:refund`, the same shape as
   `HubSpotSignalStateVerifier`. It reads `signals.approvalArtifact` and calls
   `ApprovalVerifier.verify` with `action: "paytm:refund"`, `resourceId` set to the Intent's
   `parameters.orderId`, and `requestedValue` set to the Intent's `parameters.amount` (never the
   caller's own signal). It returns a violation when `managerApproved` is `true` without a valid
   artifact. Add it to the `CompositeSignalStateVerifier` in `packages/api/src/application.ts:83`,
   so it also runs again at the gateway (G-31).
2. **Change the policy.** A new `customer-refund` version: approve automatically at or below
   10000 with the eligibility and fraud checks; above 10000, approve only when `managerApproved`
   is `true`, up to a hard maximum; refuse above the maximum. Bind the new version (G-66).
3. **Provision an approver.** The manager creates a key pair on their own machine and keeps the
   private key there. The public key goes to
   `$PARMANA_KEY_DIR/approval-issuers/<approverId>__<keyId>.public.pem`, with an entry in
   `TRUSTED_APPROVAL_ISSUERS`, then deploy.
4. **Give the manager a signing tool.** An SDK function or script that produces a
   `SignedApproval` for one order and one amount scope, with a short expiry and a single use
   nonce (consumed in `consumed_approval_nonces`).
5. **Test it.** A valid approval executes. Each of these is refused with zero connector calls:
   no artifact, expired, unknown issuer, revoked issuer, a different order, an amount above the
   approved scope, a reused nonce, a changed payload, and `managerApproved: true` with no artifact.
   Refunds at or below the automatic limit behave as before.

**Corrections to an earlier draft of this plan:**

- The check belongs in a `SignalStateVerifier`, which runs before policy evaluation and again
  at the gateway. It does not belong in `RuntimeEngine` after evaluation.
- The approval travels in `signals.approvalArtifact`, as it does for HubSpot. `ExecutionIntent`
  does not change.
- `PolicyOutcome` is an enum and needs no `requiresApproval` field. The threshold is expressed
  in the policy's rules.
- Approval signatures use the deployment's crypto provider (`CryptoBootstrap`, Ed25519 by
  default), not ECDSA on prime256v1.
- The public key is a PEM file under `PARMANA_KEY_DIR`, not a `MANAGER_APPROVER_PUBLIC_KEY`
  variable. Private keys are never distributed; each approver holds their own.
- The regression bar is the full workspace suite (`npm test`), not 68 tests.
- "No faking. No workarounds." is not true until steps 1 to 5 ship, and then only for actions
  routed through Parmana.

**Built 2026-09-27.** Steps 1, 2, 4 and 5 of the plan, with one correction to the plan itself:
approval signatures are verified with Ed25519 only (`APPROVAL_ARTIFACT_CRYPTO_PROVIDER`,
`packages/crypto/src/ApprovalArtifactCrypto.ts`), not with the server's configured provider,
because approver keys belong to people, like step up keys.

- **Verifier, for any action:** a policy declares approval backed signals in `approvalSignals`
  (the Intent's `target` or a path into its parameters for the resource, and optionally a path
  to a number the approval must cover).
  `ApprovalSignalVerifier` (`packages/approval/src/`) enforces them with no per action code, at
  both checks: `RuntimeEngine` and the Execution Gateway both pass the policy
  (`SignalStateVerificationRequest.policy`; the gateway passes the one it loaded and hash checked).
  It checks every approval before using any, and uses each once, at authorization.
  `PolicyValidator` rejects unsafe declarations. Wired next to HubSpot's in
  `packages/api/src/application.ts`, sharing one `ApprovalVerifier` (`createApprovalVerifier.ts`),
  so an approval is single use across actions. A first version checked refunds only
  (`PaytmRefundApprovalVerifier`); it was replaced the same day, before merge, so a new use case is
  a policy change, not a code change.
- **Policy:** `customer-refund` 1.1.0. Automatic up to 10000; above 10000 and up to 100000 only
  with `managerApproved: true`; above 100000 refused; its own rejection reason for "needs a
  manager approval" (`reject-manager-approval-required`), so the refusals waiting for a manager
  can be queried by rule id. `paytm:refund` is bound to 1.1.0. **Behavior change:** 1.0.0 required
  `managerApproved: true` for every refund and nothing checked it; 1.1.0 needs no approval up to
  10000, and a checked one above.
- **Approver tools:** `scripts/generate-approver-key.ts` (key pair, named the way the server
  loads it, never overwrites) and `scripts/sign-approval.ts` (one capability, one resource, an
  amount limit, 15 minutes by default, at most a day, single use).
- **Found while building (G-67 below):** an approval could never pass through the gateway.
- **Tests:** `packages/api/tests/integration/paytm-refund.integration.test.ts` (15, through the
  real production bootstrap): a 75000 refund with a valid approval executes exactly once; each of
  no approval, another order, a smaller approved amount, an untrusted key, a changed payload,
  another capability and a reused approval is refused with zero connector calls; above 100000 is
  refused even with an approval; the old version 1.0.0 is refused by the binding.
  `packages/approval/tests/unit/ApprovalSignalVerifier.test.ts` (24),
  `packages/policy/tests/unit/PolicyValidator-approvalSignals.test.ts` (14),
  `packages/policy/tests/unit/CustomerRefundPolicy110.test.ts` (11, every rule),
  `packages/crypto/tests/unit/approval-artifact-signer.test.ts` (6),
  `scripts/tests/approver-scripts.test.ts` (14, including the script's output accepted by the
  server's verifier).
- **Still open:** step 3. `TRUSTED_APPROVAL_ISSUERS` is still empty, so in a deployment every
  approval is refused until an operator adds a real approver and deploys. **Update (2026-09-28):**
  step 3 done in code: `manager-charak1987` is listed, held by the operator. In production,
  `customer-refund` 1.1.0 authorizes nothing until it is proposed and approved through policy
  governance; until then every refund is refused. `refundEligible` and `fraudCheckPassed` are
  still caller declared (G-51). Nothing notifies a manager of a refusal; they find it by query.

**Update (2026-10-06): what later work changed, and what is still open.** Approver keys are added and
revoked through maker checker with no deploy (CLAIMS 2.45; live once its migration is applied in a
deployment). A request refused only for want of a signed approval sends a signed `approval.needed`
webhook naming what to sign, when `APPROVAL_WEBHOOK_URL` is set (2.46). Every agent action needs a
signed approval, reads included (2.47, G-80), and `refundEligible` and `fraudCheckPassed` are no longer
the only checks on a refund (G-51 closed). **Still open:** the server does not hold a refused
request for review. The agent sends the request again, with the signed approval, as a new
transaction.

**G-67. A valid Approval Artifact could never pass the Execution Gateway, so an approved HubSpot
amount change was always refused. FOUND and CLOSED 2026-09-27, `blocks-pilot`.** Found while
building G-65. The same `SignalStateVerifier` runs twice for one request: in `RuntimeEngine`
before the authorization is signed, and in `ExecutionGateway` just before release (G-31).
`HubSpotSignalStateVerifier` consumed the approval's single use nonce on both runs, so the second
run always saw the nonce as used, reported `preAuthorizedForAmountChange` as false, and the
gateway refused the request. It fails closed (nothing executed), and it was not seen because
`TRUSTED_APPROVAL_ISSUERS` is empty and no test sent a valid approval through the gateway; the
only integration test (TD-23) checks a refusal. **Fix:** `SignalStateVerificationRequest.stage`
(`"authorize"` or `"release"`; the gateway passes `"release"`) and
`ApprovalVerificationRequest.consumeNonce`. A verifier consumes an approval only at
`"authorize"`; at `"release"` every other check still runs. Reuse stays impossible: the nonce is
recorded at authorization, and the execution authorization is itself single use and bound to the
same signals by `signalsHash`. **Verified:** an integration test sends a valid approval through
the real bootstrap for HubSpot
(`hubspot-deal-update.integration.test.ts`) and for refunds; with the fix reverted, both fail,
and with it, both pass. Unit tests: `packages/approval/tests/unit/ApprovalVerifier.test.ts`
(consumeNonce), `packages/execution-gateway/tests/unit/signal-freshness.test.ts` (the gateway
passes `"release"`).

**G-68. An approver could not be provisioned on Vercel. FOUND and CLOSED 2026-09-27,
`blocks-pilot`.** Found while preparing the go live steps for G-65. `createApprovalIssuerRegistry.ts`
read each trusted approver's public key only from
`$PARMANA_KEY_DIR/approval-issuers/<approverId>__<keyId>.public.pem`. On Vercel the key directory
is filled only by `PARMANA_KEY_MATERIAL_JSON`, which writes flat `<keyId>.private.pem` and
`.public.pem` pairs, needs a private key, and cannot write into a subfolder. So no approver could be
added in production, and every signed approval would stay refused. **Fix:** an entry in
`TRUSTED_APPROVAL_ISSUERS` may carry the key as `publicKeyPem` (public keys are not secret; the list
is reviewed code); the file stays as the fallback. `buildApprovalIssuerRegistry` stops the server at
startup on a missing file, a key that does not parse, a key that is not Ed25519, or a duplicate
entry. **Tests:** `packages/api/tests/unit/bootstrap/build-approval-issuer-registry.test.ts` (8).

**G-69. On Vercel, a malformed JSON body returned 500 instead of 400. FOUND and CLOSED
2026-09-28.** Seen on 2026-09-27 (a malformed approve request to production returned `500`, the same
request locally `400 Malformed JSON body`), diagnosed on 2026-09-28 by sending malformed JSON with no
API key to production and reading its log. Vercel's Node.js runtime gives the request its own lazy
`req.body` getter; `express.json()` reads `req.body` first (`body-parser/lib/types/json.js:112`), so the
getter's error, `Invalid JSON` with `statusCode: 400` and no `type`, reached
`packages/api/src/middleware/error-handler.ts` instead of body-parser's `entity.parse.failed` error, and
fell through to the generic `500`. Every such request was still refused before authentication and
before any route ran, so nothing executed; the response was wrong, and the malformed body audit event
(G-29) was skipped. **Fix:** the error handler also maps that error to `400 Malformed JSON body.`
**Tests:** `packages/api/tests/unit/error-handler-vercel-invalid-json.test.ts` (3, reproducing the getter
in front of the real `express.json()`; the 400 case fails without the fix).

**G-66. The policy version for each action is fixed in code, so a policy change needs a
redeploy. FOUND 2026-09-27, `pre-production`. BUILT the same day, merged to `main` and deployed to production on 2026-09-27 (PR #46, merge `4eebd5f`) (see "Built" at the end of
this entry).** `CANONICAL_CAPABILITY_POLICY_BINDINGS`
(`packages/capability-registry/src/CapabilityPolicyBinding.ts:44`) maps each live capability to
one policy name, version and schema version, for example `paytm:refund` to `customer-refund`
1.0.0. `CapabilityPolicyBinder` (called at `packages/runtime/src/RuntimeEngine.ts:361`) refuses
a request that names any other policy, and `assertConnectorCapabilitiesBound.ts` refuses to start
when a live capability has no entry. This binding is the fix for G-30 and must stay. The cost: a
new policy, or a new version of a bound one such as `customer-refund` 1.1.0, is not used until
the map is edited and deployed, and then approved through policy governance.

**Why "check the policy is approved" is not enough on its own.** Production already refuses a
policy with no approval record (`docs/CLAIMS.md` 2.35). Without the binding, a caller could name
an approved policy written for a different action, for example `slack-post-message` 1.0.0 for a
refund, or an older approved version of the right policy with looser rules.

**Option (recommended):** keep the policy **name** in code and take the **version** from
policy governance. The current version for a name is the one with the latest
`policy_change_approval_records` entry. The binder requires the declared name to equal the bound
name and the declared version to equal the current one, and refuses the request if the lookup
fails. A new version then goes live through propose and approve, with no deploy. A new name or a
new capability still needs a deploy. **Alternative:** move the whole map into the database
behind maker and checker. That needs a new table and a new change type, because
`pending_policy_changes` carries only policy content.

**Built 2026-09-27 (the recommended option).** The name stays in
`CANONICAL_CAPABILITY_POLICY_BINDINGS`; the version comes from policy governance.

- `CapabilityPolicyBinder` takes an optional `CurrentPolicyVersionSource` and is now async. With
  it, the declared version must equal the version in effect for the bound name; without it
  (`NODE_ENV` test and development), the version in the table applies. No approved version, or a
  failed lookup, refuses the request with a `reason`.
- The version in effect is the `policyVersion` of the most recent approval record for the name,
  across versions (`PolicyChangeApprovalRecordRepository.findMostRecentForName`, memory and
  Postgres; the existing index on `(policy_name, policy_version, approved_at)` serves it).
  Approving a version makes it current; approving an older version again rolls back to it.
- `GovernedPolicyVersionSource` (`packages/api/src/governance/`) reads it.
  `createCurrentPolicyVersionSource.ts` turns it on under exactly the rule of
  `createPolicyExecutionVerifier.ts`, so the version comes from governance wherever governance is
  enforced, and nowhere else. Wired through `RuntimeFactory.create` and
  `RuntimeBuilder.withCurrentPolicyVersions`.
- It reads only the version from the record. The same request then verifies that record's
  signature and content hash (`PolicyGovernanceExecutionVerifier`, and again at the gateway), so
  a record changed in the database outside the API makes the request fail, not pass.
- **Tests:** `packages/capability-registry/tests/unit/CapabilityPolicyBinder.test.ts` (15, 8 new:
  approved version accepted over the table's, the table's version refused once another is
  approved, an older approved version refused, another name refused, the bound name looked up
  and never the declared one, none approved, lookup failure, unbound actions untouched);
  `packages/api/tests/unit/GovernedPolicyVersion.test.ts` (5, through `RuntimeBuilder` with
  governance enforced: no approval refuses, 1.0.0 approved runs, approving 1.1.0 makes it current
  and refuses 1.0.0, approving 1.0.0 again rolls back, lookup failure refuses; without the source,
  2 fail); `packages/api/tests/unit/bootstrap/create-current-policy-version-source.test.ts` (10,
  on exactly where governance is enforced);
  `packages/storage/tests/unit/policy-change-approval-record-most-recent-for-name.test.ts` (2).
- **Behavior change to know:** agents name the version in each request. Once a new version is
  approved, a request naming the old one is refused, with a message naming the version in effect.
  There is no endpoint yet to ask for the version in effect ahead of time. **Update
  (2026-09-28):** `GET /policies/in-effect?capability=<action>` now returns it (PR #56); the refund
  agent reads it before every refund since `parmana-paytm-agent` PR #6, deployed 2026-09-28 (G-70).
- **With PR #46:** once both are deployed, refunds keep running under the version already
  approved in production (1.0.0, where `managerApproved` is not verified) until 1.1.0 is approved.
  Approving 1.1.0 is what switches refunds to verified manager approvals; no deploy is needed for
  that step.
- **Still needs a deploy:** binding an action to a different policy name, adding a capability,
  and adding an approver. `HubSpotSignalStateVerifier`'s own deal read still names
  `hubspot-deal-update` 1.0.0 in code; it goes straight to the gateway, not through this binder,
  and keeps working while 1.0.0 stays approved.

**Update (2026-10-06).** Since this entry: approver keys change through maker checker with no deploy
(CLAIMS 2.45), and external connectors are registered through maker checker with no deploy, their
policy bound from the registration (2.49, 2.50, G-81). **Still needs a deploy:** binding a built in
capability to a different policy name, and adding a built in capability.

## Gaps opened in the 2026-09-28 refund agent review

**G-70. The refund agent paid an approved refund twice: once through Parmana's connector, then
again itself. FOUND 2026-09-28, `blocks-pilot`, in `parmana-paytm-agent`. FIXED and deployed
2026-09-28 (that repository's PR #6, merge `8504b57`); refusal path verified in production; the
approved path is covered by tests and not yet observed live (see "Verified" below).**
`parmana-paytm-agent` has two endpoints. On
`/agent/refunds` it asked Parmana `POST /execute` and, when the answer was APPROVED, called Paytm
itself (`src/governed-refund.ts`, `this.paytm.initiateRefund`, with the caller's `refId`, by default
`PARMANA-<uuid>`). But Parmana releases an approved action inside that same `/execute` call
(`packages/runtime/src/RuntimeEngine.ts`, "The action is released to the connector inside this
call"): with `PAYTM_CONNECTOR_URL` set, the Paytm connector is registered for `paytm:refund`
(`packages/api/src/bootstrap/createConnectorRegistry.ts`), and `GatewayPaytmAdapter` sends the
refund to `PAYTM_CONNECTOR_URL/connector/paytm-refund`, the agent's other endpoint, which calls Paytm
with a refId from `deriveDeterministicPaytmRefId(orderId, transactionId)`. Two different refIds, so
Paytm's per refId idempotency would not catch the second call: **an approved refund could be paid
twice.**

- **Where it applied:** wherever Parmana's `PAYTM_CONNECTOR_URL` points at the agent. In production
  the value is stored as a Sensitive Vercel variable and could not be read back; a live run on
  2026-09-20 did reach the agent's `/connector/paytm-refund` (G-52). On 2026-09-28 the operator set it
  again to `https://parmana-paytm-agent.vercel.app`; it took effect with the deploy of the #57 merge
  (`35aab9f`) on 2026-09-28.
- **When:** before 2026-09-27 18:53:40 UTC, `customer-refund` 1.0.0 was the version in effect and the
  agent declared 1.0.0, so an approved refund through `/agent/refunds` took both paths. From then on it
  was dormant: the agent still declared 1.0.0 (`src/parmana/refund-authorizer.ts`), which the binder
  refuses once 1.1.0 is in effect (`CapabilityPolicyBinding.ts`, declared version must equal it), so
  no refund was approved. Whether any real refund was paid twice before 2026-09-27 was not checked:
  that needs the Paytm merchant records (a second refund on one order, with a refId starting
  `PARMANA-`).
- **Why earlier reviews missed it:** each side was checked alone. ADR-0009 called `/agent/refunds`
  "a separate, already correct path", and CLAIMS 3.22 describes Parmana's path only.
- **Fix (agent PR #6):** `GovernedPaytmRefundService` has no Paytm client. It returns what Paytm
  reported from the last execution's `evidence` in the Trust Record `/execute` returns
  (`readRefundExecution`); an approval with no evidence fails and leaves the refId `UNKNOWN` for
  reconciliation, never falling back to calling Paytm. The same PR reads the policy version from
  `GET /policies/in-effect` before every refund (a failed lookup stops before `/execute`), forwards
  an optional signed manager approval as `signals.approvalArtifact`, answers `502` when Paytm did not
  report success, and runs the agent's build time env check only for production builds.
- **Tests (agent):** 80 passed (57 before), including that an approved refund makes no Paytm call and
  no network call from `/agent/refunds`.
- **Verified in production, 2026-09-28:** agent PR #6 merged (`8504b57`) and deployed; the agent's
  `AGENT_API_KEY` was replaced (the old value was not held locally) and the agent redeployed. A
  `/agent/refunds` request for 50000 with no approval returned `403 DENIED` with the reason of
  `customer-refund` 1.1.0's `reject-manager-approval-required` rule. So the agent read the version in
  effect from Parmana (a declared 1.0.0 is refused by the binder with a message naming the version),
  its Parmana key and principal work, and a refusal reaches no connector.
- **Not yet observed live:** an approved refund making exactly one Paytm call. No settled order was
  at hand. Covered by the agent tests above. **Closes fully when** one refund up to 10000 (a Paytm
  staging order if the agent's `PAYTM_ENVIRONMENT` is staging, or a real order that needs a refund)
  returns `200` with `refund.success` true and the merchant dashboard shows one refund for it.

**G-71. Only one refund per Paytm transaction can go through Parmana, and the refund reason never
reaches Paytm. FOUND 2026-09-28, `pre-production`. FIXED and deployed the same day: Parmana PR #59
(merge `6bd2800`), then `parmana-paytm-agent` PR #7 (merge `0ee7376`). Covered by tests; a second
refund of one transaction has not been observed live.**
`GatewayPaytmAdapter` sent
`deriveDeterministicPaytmRefId(orderId, transactionId)` as the refId
(`packages/connector-paytm/src/PaytmTypes.ts`), deliberately, so a retry of one refund reuses the
same refId. It follows that a second, partial refund of the same Paytm transaction gets the same
refId; how Paytm answers a reused refId with a different amount was not checked. Separately,
`refundReason` is in `PAYTM_ALLOWED_REFUND_PARAMETERS`, but the adapter sends only `orderId`, `txnId`,
`refId` and `amount` to the connector service, so a reason is accepted and dropped.

- **Fix, Parmana side:** `refundReference` joins `PAYTM_ALLOWED_REFUND_PARAMETERS`. When the Intent
  carries it, `deriveDeterministicPaytmRefId(orderId, transactionId, refundReference)` keys the refId on
  all three (JSON encoded, so a `:` inside an id cannot make two triples collide): retries of one
  refund keep one refId, a different refund of the same transaction gets another. Without it the
  derivation is byte for byte what it was, so a refund retried across the change keeps its refId.
  `refundReason` is now sent to the connector service as `reason`. Both are optional; a value that is
  not a non empty string, or longer than 128 (reference) or 256 (reason) characters, is refused before
  any network call. These limits are the adapter's own; Paytm's limit on a refund comment was not
  checked. Both are Intent parameters, so they are inside the signed, hash checked Intent, but not
  inside the narrower signature the connector service verifies (it covers `orderId`, `txnId`, `amount`
  and the expiry, as before; `refId` was never in it).
- **Fix, agent side (`parmana-paytm-agent`):** `/agent/refunds` sends its `refId` as
  `refundReference` and its `reason` as `refundReason`; `/connector/paytm-refund` passes `reason` to
  Paytm as the refund comment. The agent must be deployed after Parmana: before that, Parmana's
  allowlist refuses the new parameters.
- **Tests:** `packages/connector-paytm/tests/unit/paytm-types.test.ts` (3 new: per refund refIds, the
  old derivation pinned, no `:` collisions), `packages/execution-gateway/tests/unit/paytm-connector.test.ts`
  (6 new: reference and reason sent, none sent when absent, four refusals before any network call),
  `packages/api/tests/integration/paytm-refund.integration.test.ts` (1 new: two refunds of one
  transaction through `POST /execute` reach the connector with different refIds, reason sent).
- **Not checked:** how Paytm answers a second refund of one transaction in practice (total refunded
  above the transaction amount, or its own limits on partial refunds).

**G-72. The HubSpot state check signed its own deal fetch with the local key file, so under
`KEY_PROVIDER=aws-kms` every `hubspot:deal-update` was refused. FOUND 2026-09-28, `pre-production`
(fails closed; nothing unsafe ran). FIXED the same day on branch `fix/hubspot-verifier-key-provider`.
Whether production has the HubSpot connector configured was not checked.**
Before a `hubspot:deal-update` is authorized, `HubSpotSignalStateVerifier` fetches the real deal through
the gateway with its own signed authorization. `packages/api/src/bootstrap/createHubSpotSignalStateVerifier.ts`
built it with `keys: new FileKeyProvider()`, the last `new FileKeyProvider()` in the API bootstrap code,
so the fetch was signed with the local `default` key whatever `KEY_PROVIDER` said, while the gateway
verifies against the key `SignerBootstrap` selects (G-48's fix). Under KMS the two keys differ, the fetch
is refused, the verifier reports a `hubspot:deal-fetch` violation, and the request is refused. Found while
checking the connector guide against the code (docs cleanup pass 4).

- **Fix:** `HubSpotSignalStateVerifier` takes `resolveSigner` (a `Signer`, ADR-0009) as an alternative to
  `keys`, exactly one of the two, and `executeHubSpotCapability` signs with
  `AuthorizationSigner.signWithSigner` when given a `Signer`. Production wiring resolves the `Signer`
  from `SignerBootstrap` on first use (`lazySignerBootstrap`); a failed resolution is not cached and each
  check fails closed until it succeeds. `keys` remains for tests and tutorials with local keys.
- **Tests:** `packages/connector-hubspot/tests/unit/HubSpotSignalStateVerifier.signer.test.ts` (4 new:
  a Signer signed fetch accepted by a gateway stub that checks the signature, a fetch signed with a
  different key refused, an unresolvable Signer fails closed, construction with neither or both options
  refused), `packages/api/tests/unit/bootstrap/create-hubspot-signal-state-verifier.test.ts` (2 new: the
  Signer is resolved once, on first use; a failure is retried). Tutorial 118
  (`examples/tutorials/118-hubspot-verifier-signer`) shows the refusal and the fix.
- **Not checked:** a live `hubspot:deal-update` under KMS.

---

## Gaps opened in the 2026-09-28 AI attack review

Scope: the user asked whether Parmana can be attacked through AI, validated from the code. Parmana runs
no model itself, so the threat is an agent that has been manipulated (prompt injection through a
document, an email, an issue) and then calls the API. The review read the request path end to end:
`caller-auth.ts`, `execute.ts`, `isPrincipalAllowed.ts`, `isCapabilityAllowed.ts`, `RuntimeEngine`,
`SignalIntentBinder`, `PolicyEngine`, `OperatorEvaluator`, `CapabilityPolicyBinder`,
`ApprovalSignalVerifier`, `ExecutionGateway`, `pending-policy-changes.ts`, every policy under
`policies/`, and the public routes in `app.ts`.

Held against a manipulated agent (no change needed): API key authentication, principal binding,
capability grants, bound signals against the Intent, capability to policy binding for connector
actions, the gateway's signature, content hash, policy hash, governance and nonce checks, single use
signed approvals, maker checker on policy changes, strict typing in the evaluator, and ownership
scoping on reads.

Found: facts the agent declares and nothing checks can authorize real actions (G-73 to G-76), a
refusal reason can tell an agent which flag to flip (G-77), and some public routes have no rate
limit (G-78).

**G-73. An agent could authorize a pull request merge by declaring GitHub facts true. FOUND
2026-09-28, `blocks-pilot` wherever the GitHub connector is configured (not checked for production).
FIXED in the repository the same day on branch `fix/ai-attack-hardening`; takes effect in production
when `github-pr-approval` 1.1.0 and `github-pr-read` 1.0.0 are approved. APPROVED in production
2026-09-28: 1.1.0 at 17:30:00 UTC (change `39bfa083-7850-4cdc-bfd0-67738fc61432`), `github-pr-read`
1.0.0 at 17:30:18 UTC (change `af938bab-f205-4e02-8adf-e602edcd7695`) (proposed by `charak1987` at 17:16 UTC, approved by `reviewer-charak1987`, two credentials held by one person). Trusted approvers are not limited to
an action (G-50), so `manager-charak1987`, the one listed approver, can sign merge approvals.**
`github-pr-approval` 1.0.0 approved `github:pr-merge` when `repositoryAuthorized`,
`requiredReviewsCompleted`, `statusChecksPassed` and `branchProtected` were true and `riskScore` was at
most 20. All five are caller declared (`unboundSignalReasons`), no `SignalStateVerifier` covers GitHub,
and 1.0.0 is approved in production (2026-09-16). An agent with the `github:pr-merge` grant could merge
any pull request the GitHub App installation can reach by sending those values; only GitHub's own branch
protection stood in the way.

- **Fix:** `github-pr-approval` 1.1.0 approves a merge only with `mergeApproved: true`, declared in
  `approvalSignals` with `resourceId: "target"`, so it counts only with a signed approval for that pull
  request (2.42 machinery, no new verifier). The other facts now only refuse. `github:pr-fetch` is bound
  to a new policy, `github-pr-read` 1.0.0, which approves a read with no caller facts, so reads do not
  need a merge approval. **Update (2026-09-30, G-80):** every read now needs its own signed approval,
  under `github-pr-read` 1.1.0. `createApplication` takes an optional `approvalVerifier` (defaulting to the
  production one) so tutorials can trust an in memory approver.
- **Tests:** `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts` (the structural check that
  every approve rule requires the approval fact; the most permissive caller facts are refused);
  `packages/api/tests/integration/github-pr-merge.integration.test.ts` (4 new: every caller fact true
  and no approval, `mergeApproved: true` and no approval, an approval for another pull request, an
  approval used twice; each makes zero merge calls where refused), `github-caller-scoping` updated.
  Tutorial 96 shows the refusal and the approved merge.
- **To finish in production:** propose and approve `github-pr-approval` 1.1.0 and `github-pr-read` 1.0.0
  through maker checker, and list a reviewer in `TRUSTED_APPROVAL_ISSUERS`. After deploy and before
  `github-pr-read` is approved, `github:pr-fetch` is refused.
- **Not checked:** whether production has `GITHUB_APP_ID` and the other GitHub variables set; the gated
  live suite was updated but not run.

**G-74. `llm-tool-call` approves a tool call when the caller declares `humanApproval: true`. FOUND
2026-09-28, `pre-production` (no connector runs a tool call, so the hosted API executes nothing).
FIXED in the repository the same day as `llm-tool-call` 1.1.0; closed by the update below. 1.1.0
APPROVED in production 2026-09-28 17:30:53 UTC (change `8751d3dc-7fa3-4037-b23b-b059d9ae9d42`), so
1.0.0 is refused there as superseded.**
`llm-tool-call` 1.0.0 (approved in production 2026-09-16) approves when the caller declares
`humanApproval`, `toolAllowed` and `resourceAuthorized` true, the environment `production` and
`riskScore` at most 25. `humanApproval` is the caller's own word that a person agreed. The action used
with it (`ExecuteTool` in `python/examples/10_llm_tool_call.py`) has no connector, so on the hosted API
the pipeline refuses to release it; the risk is an integration that treats Parmana's decision as
permission and runs the tool itself.

- **Fix:** `llm-tool-call` 1.1.0 declares `humanApproval` in `approvalSignals` with
  `resourceId: "target"`, so it needs a signed approval for that tool; the other facts only refuse.
- **Still open:** the action is not in `CANONICAL_CAPABILITY_POLICY_BINDINGS` (that map is for
  connector capabilities, and a test pins its exact set), so a caller can still name `llm-tool-call`
  1.0.0, which stays approved. An integration using the decision alone must require 1.1.0 in the signed
  authorization. Options: bind an agreed action name such as `llm:tool-call`, or a way to retire an
  approved version.
- **Update (2026-09-28): CLOSED** by retiring older versions, for every policy. `PolicyGovernanceExecutionVerifier`,
  which runs before authorization and again at release, now refuses any version other than the one most
  recently approved for that policy name, naming the version in effect. So once `llm-tool-call` 1.1.0 is
  approved, 1.0.0 is refused whatever action names it. Approving an older version again makes it current
  (a rollback), as G-66 already did for connector actions. Tests: `PolicyGovernanceExecutionVerifier.test.ts`
  (2 new: superseded refused, rollback), `GovernedPolicyVersion.test.ts` (2 updated: the refusal now names
  the version in effect as superseded). Callers of any policy must send the version in effect; an
  authorization signed just before a newer approval is refused at release.
- **Tests:** `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts`.

**G-75. An agent could authorize a refund up to 10000 by declaring the order eligible and the fraud
check passed. FOUND 2026-09-28, `blocks-pilot`, live in production (the Paytm connector is configured
there and `customer-refund` 1.1.0 is in effect). FIXED in the repository the same day as
`customer-refund` 1.2.0; takes effect in production when 1.2.0 is approved. CLOSED in production
2026-09-28: 1.2.0 APPROVED (change `5916b946-6ee0-4ae0-ac1f-6384d021653b`) (proposed by `charak1987` at 17:16 UTC, approved by `reviewer-charak1987`, two credentials held by one person). Every refund now
needs a signed approval from `manager-charak1987`, the one trusted approver.**
`customer-refund` 1.1.0's `approve-refund-automatic` rule approves when `refundEligible` and
`fraudCheckPassed` are true and `refundAmount` is at most 10000. Both facts are caller declared
(`unboundSignalReasons`), and no verifier covers them (G-51). An agent with the `paytm:refund` grant
could refund any order it can name, up to 10000 per request, by sending both as true. The same rule
approved a refund of 0 or a negative amount, since nothing set a lower bound.

- **Fix:** `customer-refund` 1.2.0 approves only with `managerApproved` true, which is approval backed
  (the same `approvalSignals` declaration as 1.1.0: order and amount from the Intent), refuses 0 or
  less, and refuses above 100000. The eligibility and fraud facts only refuse. The binding table names
  1.2.0, so test and development use it, and the in effect version in production follows governance.
- **Tests:** `packages/policy/tests/unit/CustomerRefundPolicy120.test.ts` (11) and the refund case in
  `ApprovalBackedPolicies.test.ts`; `packages/api/tests/integration/paytm-refund.integration.test.ts`
  moved to 1.2.0 with 2 new cases (every caller fact true and no approval, with `managerApproved` false
  and true; a refund of 0), 18 in all. Tutorials 111 and 119 moved to 1.2.0.
- **Product change:** every refund now needs a manager. Automatic small refunds need an eligibility and
  fraud check the server reads itself (a `SignalStateVerifier` against the order and a fraud service),
  which does not exist.
- **To finish in production:** propose and approve `customer-refund` 1.2.0; the refund agent reads the
  version from `GET /policies/in-effect` and already forwards `approvalArtifact` (G-70), so it needs no
  change, but every refund it sends will need a signed approval.
- **Self hosted (updated 2026-09-28):** the quickstart, its check (`docker/local/quickstart-check.sh`) and
  `refund-request.mjs` adopt 1.2.0; the quickstart now also shows a refund of 500 without an approval
  refused. The offline check (`docker/local/offline-check`) stays on 1.1.0 on purpose: it proves an
  authorized refund runs end to end with no internet route, which under 1.2.0 needs an approver key the
  server trusts, and adding a demo approver to the trusted list would weaken every deployment.

**G-76. An agent could post any text to any Slack channel the bot is in, by declaring the channel
authorized. FOUND 2026-09-28, `blocks-pilot` wherever the Slack connector is configured (not configured
in production, checked by the operator on 2026-09-28). FIXED the same day on branch `fix/ai-attack-hardening`; takes effect on deploy, and needs
`SLACK_ALLOWED_CHANNEL_IDS` set or every post is refused.**
`slack-post-message` 1.0.0 approves when the caller declares `contentApproved` and `channelAuthorized`
true, and binds only `channelId` to the Intent's `target`. Two holes: nothing checks
`channelAuthorized`, and `GatewaySlackAdapter` posts to `parameters.channel`, which nothing compared with
`target`, so even a correct check on the target could be sidestepped by naming an allowed channel there
and another in `parameters.channel`. A manipulated agent could send data it had read to a channel of its
choosing, the usual way prompt injection leaks data.

- **Fix, in code (no policy change, so no approval needed):** `SlackChannelSignalVerifier`
  (`packages/api/src/bootstrap/createSlackChannelSignalVerifier.ts`), in the same composite verifier as
  HubSpot and approvals, refuses a `slack:post-message` unless `parameters.channel` is a string, equals
  the target, and is in `SLACK_ALLOWED_CHANNEL_IDS`. It runs before authorization and again at release.
  Unset or empty refuses every post (fails closed). `GatewaySlackAdapter` also refuses a channel that is
  not the target, before any network call.
- **Tests:** `packages/api/tests/unit/bootstrap/create-slack-channel-signal-verifier.test.ts` (7),
  `packages/api/tests/integration/slack-post-message.integration.test.ts` (4, new: an allowed channel
  posts once; a channel off the list, an allowed target with another `parameters.channel`, and an unset
  list are each refused with zero Slack calls), `packages/execution-gateway/tests/unit/slack-connector.test.ts`
  (1 new). Tutorial 112 has a fourth scenario.
- **Still open:** `contentApproved` is caller declared. The content of an approved post is whatever the
  agent writes, limited to channels on the list. A per post human approval (`approvalSignals`) would
  close it at the cost of a person per message.
- **Production:** the Slack connector is not configured there (the operator checked on 2026-09-28), so
  this was never exposed in production and nothing needs setting. Set `SLACK_ALLOWED_CHANNEL_IDS` together
  with `SLACK_BOT_TOKEN` if Slack is added later.

**G-77. A refusal reason tells an agent which caller declared fact to flip. FOUND 2026-09-28,
`pre-production`. CLOSED the same day by making flipping useless, not by hiding reasons.**
A refusal carries the matched rule's reason (for example "did not pass fraud assessment"), and a goal
seeking agent that retries can learn from it which fact to change. Hiding reasons was considered and
rejected: every policy file is in the public repository, and the submitting caller can read its own
Refusal Record (`GET /refusal/:id`), so a vaguer message would be obscurity, and it would cost people
reviewing refusals the reason they need.

- **Fix:** after G-73, G-75 and G-76, no approve rule of a connector action that changes something can
  be satisfied by caller declared facts alone. `packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts`
  enforces it for every capability in `CANONICAL_CAPABILITY_POLICY_BINDINGS`: each approve rule must
  need, on every path, a fact declared in `approvalSignals` or a fact a server verifier checks for that
  capability (`HUBSPOT_VERIFIED_SIGNAL_KEYS`, `SLACK_VERIFIED_SIGNAL_KEYS`, both exported from the
  verifiers so the test follows them). Bound facts do not count. Reads (`hubspot:deal-fetch`,
  `github:pr-fetch`) are listed separately, and a new capability fails the test until it is classified.
  The test also checks it flags `customer-refund` 1.1.0 and `github-pr-approval` 1.0.0.
- **Scope:** checked for the versions named in the binding table, which production moves to on
  approval. Until they are approved, production still runs 1.1.0 and 1.0.0 (G-73, G-75). Policies with
  no connector (`llm-tool-call` and the reference policies) are outside the test; `llm-tool-call` 1.1.0
  meets the rule (G-74).

**G-78. The unauthenticated routes that check signatures or write data had no rate limit. FOUND
2026-09-28, `pre-production`. FIXED the same day; takes effect on deploy.**
`POST /refusal/verify`, `POST /execution-intents/verify` and `POST /audit/verify` verify signatures
(including ML-DSA-65 where configured) for anyone, and `/handbook/download-leads` inserts a row for any
well formed email. Only `/health` and `/ready` had an IP limit. Anyone, an agent included, could spend
server CPU or fill the leads table.

- **Fix:** `createPublicRateLimiter` (`packages/api/src/middleware/rate-limit.ts`), keyed by IP, one
  counter shared by the four routes, `RATE_LIMIT_PUBLIC_PER_MINUTE` (default 60), its own `public:`
  store (Postgres when `DATABASE_URL` is set) in `server.ts` and `api/index.ts`. The OpenAPI spec declares
  `429` on those routes.
- **Tests:** `packages/api/tests/integration/rate-limit.integration.test.ts` (3 new).
- **Not checked:** behind Vercel the key is `req.ip` with `trust proxy` set to one hop; whether that is
  the real client address there was not checked live. The leads table has no size cap beyond this.

**G-79. CI's policy approval check never checked anything. FOUND 2026-09-28, `pre-production`
(detection only; production refuses unapproved policies on its own, 2.35). CLOSED the same day.**
The `verify-policy-approvals` job in `.github/workflows/ci.yml` compares every changed
`policies/**/policy.json` with its approval record in the production database. It failed on every run
that changed a policy, without checking: first because `SUPABASE_URL` and `SUPABASE_ANON_KEY` were not
set in GitHub Actions ("Refusing to run without it"), and, once they were, because `loadConfig()`
refused to start without `PARMANA_POLICY_DIR`, which that job never set (the other job sets it at job
level). The second cause was hidden behind the first. A red check that always fails for a setup reason
teaches people to merge past it, which is how this job's purpose (D-6) is lost.

- **Fix:** the operator set both secrets on 2026-09-28 (the read only anon key, never the service role
  key), and PR #74 sets `PARMANA_POLICY_DIR: ./policies` on the step. PR #78 makes the job check every
  policy file on every run (`--full-scan`) instead of only changed ones, so every run proves the check
  can reach the approval records and catches drift.
- **Verified:** CI on PR #78 ran the full scan: all 19 policy files match their approval records. The
  same result on the operator's machine, run the way CI runs it.
- **Consequence:** a pull request that adds a policy version passes only once that version is approved
  in production, so propose and approve from the branch before merging. Pull requests from forks get
  no secrets and fail the check.

---

## Gaps opened in the 2026-09-30 approval everywhere review

Scope: the operator stated the rule "no AI agent can do anything without approval ever", reads
included, and asked for it to be validated from the code and, if needed, enforced. The review read
every policy under `policies/`, `CANONICAL_CAPABILITY_POLICY_BINDINGS`, `PolicyValidator`,
`PolicyRouter`, `RuntimeEngine`, `ApprovalSignalVerifier`, `HubSpotSignalStateVerifier`,
`createApplication` and `pending-policy-changes.ts`.

**G-80. Most actions were authorized with no human approval at all. FOUND 2026-09-30, `blocks-pilot`
against the stated rule. FIXED the same day (PR #87, merge `e18ddae`). CLOSED in production
2026-09-30: all 13 new policy versions approved through maker checker (proposed by `charak1987`,
approved by `reviewer-charak1987`, two credentials held by one person), then merged and deployed.
After the deploy `hubspot:deal-fetch` reported `hubspot-deal-read` 1.0.0 in effect, `/ready` was
READY and `/execute` without a key returned `401`.**
Human approval was a property of each policy, not of the product. Only three policies required it:
`customer-refund` 1.2.0, `github-pr-approval` 1.1.0 and `llm-tool-call` 1.1.0. Every other policy
approved on facts the agent declares or on nothing:

- `github-pr-read` 1.0.0 (`github:pr-fetch`): `always: true`, no fact at all.
- `hubspot-deal-update` 1.0.0 (`hubspot:deal-fetch` and `hubspot:deal-update`): any update within the
  amount threshold, and every read, with no person. Only an amount change above the threshold needed
  a signed approval.
- `slack-post-message` 1.0.0 (`slack:post-message`): caller declared `contentApproved` plus the channel
  allowlist (G-76), no person.
- The reference policies with no connector (`vendor-payment` 2.0.0, `access-control`,
  `agent-vendor-payment`, `api-key-issuance`, `connector-capability`, `database-change` 3.0.0,
  `expense-reimbursement`, `production-deployment`, `rag-document-access`): caller declared facts only.
  A caller can name any of them for an action with no binding and receive a signed authorization.
- Nothing stopped a new policy, or a proposed change, from approving without a person: the rule
  existed only as a convention, checked for the four bound write capabilities by
  `connector-policies-not-self-authorizing.test.ts` (G-77), which accepts a server verified fact in
  place of an approval.
- `RuntimeEngine` treats the signal state verifier as optional. A runtime built without one would
  accept `managerApproved: true` with no signed approval behind it. The production `createApplication`
  always wires one, so this was not reachable through the hosted API.

- **Fix:**
  - `PolicyValidator.validateEveryApprovalNeedsSignedApproval` refuses any policy with an approve rule
    that does not require a fact declared in `approvalSignals` with `is_true`, as its whole condition
    or directly inside its top level `all` (an `any`, a nested `all` or `eq true` does not count).
    `PolicyRouter` runs it on every load and `pending-policy-changes.ts` on every proposal, so no such
    policy can run or be proposed.
  - `RuntimeEngine` refuses an approve decision when no signal state verifier is configured
    (`approval-verifier-not-configured`).
  - New versions that need a signed approval: `github-pr-read` 1.1.0 (`readApproved`, the pull
    request), `hubspot-deal-read` 1.0.0 (new policy for `hubspot:deal-fetch`, `readApproved`, the
    deal), `hubspot-deal-update` 1.1.0 (`dealUpdateApproved`, the deal, every update), `slack-post-message`
    1.1.0 (`postApproved`, the channel), and `humanApproved` for the Intent's `target` in
    `vendor-payment` 2.1.0, `access-control` 1.1.0, `agent-vendor-payment` 1.1.0, `api-key-issuance`
    1.1.0, `connector-capability` 1.1.0, `database-change` 3.1.0, `expense-reimbursement` 1.1.0,
    `production-deployment` 1.1.0 and `rag-document-access` 1.1.0 (with the amount in the three
    payment and expense policies). The binding table names the new connector versions.
  - `HubSpotSignalStateVerifier` skips its own pre authorization check when the policy declares
    `approvalSignals`, so the one approval for a deal update is not spent twice.
  - Tests, the SDK examples and the tutorials sign approvals with a hermetic approver
    (`test-support/approvals.ts`, `examples/shared/helpers/demo-approval.ts`).
- **Tests:** full suite 2506 passed, 0 failed. New and changed coverage is listed in `docs/CLAIMS.md`
  2.47. Every tutorial under `examples/tutorials/` was run. The Docker offline check
  (`docker/local/offline-check/run.sh`) now adds a refund manager through maker checker and
  sends a refund with that manager's signed approval: 14 of 14 passed on 2026-09-30. The Python SDK
  suite (135 tests, including three that start a real server) passed.
- **Not done, stated plainly:**
  - **Production: done 2026-09-30.** The 13 versions are approved and deployed. `connector-capability`
    1.1.0 was approved twice: the first proposal, read with Windows PowerShell 5.1 `Get-Content -Raw`,
    changed an em dash in the description, so CI `verify-policy-approvals` (G-79) found the approved
    hash different from the file and refused the merge until the file's exact content was approved.
  - **An approval covers the action and the resource, not every parameter.** A Slack approval does not
    fix the text; a HubSpot approval does not fix the new stage or amount. Binding those would need the
    approval scope to carry them.
  - **One person approves everything.** One approver is trusted today, held by the operator (G-50,
    2.42). Every agent action now waits for that person.
  - **Superseded versions stay in `policies/`** as history; each is refused at load. The approval
    records for them in production are unchanged.
  - **No automatic path by design.** An action cannot be authorized by a server side check alone.
    Adding one would be a change to this rule, not a fix.

**G-81. A registered external connector receives no release, and its policy is not bound yet. FOUND
2026-09-30, `pre-production` (open by design until ADR-0013 step 4; nothing executes). FIXED in the
repository 2026-10-01 by ADR-0013 step 4 (see the update at the end of this entry); in effect once
deployed. Not yet checked against a live endpoint (step 6).**
Registrations through `/external-connectors` are live in production (2.49), but:

- **No connector is built for a registered capability.** `createConnectorRegistry.ts` lists only the
  built in connectors, and `ConnectorRegistry.resolveCapability` is synchronous and in memory, so a
  request for a registered capability is refused with `503 CONNECTOR_NOT_REGISTERED`.
  `GatewayExternalAdapter` is merged and deployed but nothing constructs it.
- **The registration's policy is not enforced as the binding.** `CapabilityPolicyBinder` binds only the
  capabilities in `CANONICAL_CAPABILITY_POLICY_BINDINGS`; for any other capability the caller's
  declared policy is used. Every policy needs a signed approval (G-80), and no connector runs, so no
  action follows, but the binding ADR-0013 requires does not exist yet.
- **`GET /policies/in-effect` does not answer for a registered capability** (`404 CAPABILITY_NOT_BOUND`).
- **The policy name is checked for form only** when a registration is proposed, not that the policy
  exists or has an approved version.
- **To close (ADR-0013 step 4):** resolve a registered capability to the adapter at request time,
  bind its policy with the version in effect from policy governance, refuse when that policy has no
  approved version, and answer `GET /policies/in-effect` for it; then the live check (step 6).
- **Update (2026-10-01, step 4):** `ExternalConnectorAwareRegistry` serves a capability no built in
  connector serves from its active registration, read at every request, and builds
  `GatewayExternalAdapter` behind the same secure connector, session credential, policy and audit
  path as a built in connector (`createConnectorRegistry.ts`); `resolveCapability` may now be
  asynchronous. `CapabilityPolicyBinder` binds a registered capability to its registration's policy
  at the version policy governance approved, and refuses when none is approved, when governance
  does not decide versions (test and development), or when the registration cannot be read; the
  canonical table still wins for built in capabilities. `GET /policies/in-effect` answers for it.
  The connector authenticator trusts the external identity form `ext-<capability>` only.
  Tests: `external-connector-release.integration.test.ts` (through `createExecutionControl`, to an
  endpoint that checks the release with the TypeScript SDK's `verifyParmanaRelease`; revoked and
  unregistered refused; a new registration followed to its new endpoint; storage errors fail
  closed), `policy-in-effect-external.integration.test.ts`, `ExternalPolicyBinding.test.ts`,
  `external-connector-identity.test.ts`. Still true: the policy name is checked for form only at
  registration, so a registration naming a policy with no approved version is accepted and every
  request for it is refused (`409 NO_APPROVED_POLICY_VERSION` from `GET /policies/in-effect`). The
  agent's key must still be granted the capability (`allowedCapabilities`).

**G-82. What an external endpoint answers is its claim, not proof. FOUND 2026-09-30, `pre-production`
(a property of the design, ADR-0013 Security; recorded so no claim overstates it).**
`GatewayExternalAdapter` accepts an answer that echoes the release's `businessTransactionId` and
`capability`, with a boolean `success` and a `result` object of at most 16 KB. A compromised or wrong
endpoint can still report a false `success` or `result`; it cannot widen what Parmana approved,
because the release names one capability, target and parameter set. An endpoint's own signature on
its answer is recorded as sent and not verified (ADR-0013 open question 3: optional in version 1).
`approvedBy` in the release lists the signed approvals only when the Gateway checked the request's
signals against the authorization's signed `signalsHash` (production has a signal state verifier);
otherwise it is empty. An endpoint must not treat an empty list as "no approval was needed": every
policy requires one (G-80).

**G-83. The release transport connects to the first checked address only. FOUND 2026-09-30,
`cosmetic` (availability, not security).**
`createPinnedHttpsTransport` resolves the endpoint's host, refuses if any address is not public,
and connects to the first address, never resolving the host again. If that address is down and
another would answer, the release fails (and is recorded as an unknown outcome) instead of trying
the next address. Trying further checked addresses would keep the same SSRF guarantee.

**CLOSED 2026-10-06.** `createPinnedHttpsTransport` tries each checked address in turn when a
connection cannot be made, under one deadline for the whole release. Once a connection is made
nothing is retried, so the endpoint never receives a release twice. Only addresses already checked
to be public are used, and the host is never resolved again. Tests in
`packages/execution-gateway/tests/unit/external-adapter.test.ts` ("several checked addresses"): a
refused first address moves on to the second, a connection that fails after it was made is not
retried (one request received), and no reachable address reports the error; the first failed
before the change.

**G-84. An approved request takes 24 to 32 seconds in production. FOUND 2026-10-01 in the ADR-0013
live check, `pre-production` (availability and agent behavior, not authorization).**
In the live check (`docs/CLAIMS.md` 2.50) an approved `livecheck:receipt` request took 23.9 seconds,
and about 32 seconds the first time, end to end. The endpoint itself took about 2 seconds (a cold
start). The record's own timestamps for transaction `ec2f6c00-1009-43f0-9faf-1aeb84917860` show every
Parmana stage taking seconds: stored 2.1 s, decided and authorized 4.3 s, intent prepared 4.7 s, gateway
checks before release 7.0 s, record built and signed 5.4 s, verification, receipt and finalizing 6.5 s.
That points to many sequential round trips to the database and to AWS KMS, possibly from a function
region far from them; not measured yet. Effects: the SDKs' default timeout is 30 seconds, so an agent
can stop waiting while its request completes and the action runs, as the first attempt did (its
record, fetched afterwards, is `APPROVED`). An agent that then sends a new transaction would act
twice. Until this is fixed, agents should set a longer timeout and, after a timeout, read the record
(`GET /trust-records/{id}`) before anything else. The refund flow takes the same path.

**G-85. The Python SDK cannot verify its own decoded record when `previousChainHash` is `null`.
FIXED IN CODE 2026-10-02, published in the Python SDK 1.5.0 (2026-10-04); 1.4.0 and earlier have it. FOUND 2026-10-02 while writing the sandbox Playground, `pre-production` (verification tooling, not
authorization).** `verify_execution_trust_record_offline(record, keys)` accepts the decoded
`ExecutionTrustRecord` model (`python/parmana/crypto/offline_verifier.py`, `_as_json`), and encodes it again
with `parmana.serialization.encode`, which leaves out every field whose value is `None`. The server
sends `executions[0].previousChainHash: null` (the TypeScript type is `previousChainHash?: string | null`;
the generated Python field is `previous_chain_hash: Any | None = None`, so null and absent are the same).
The encoded record lacks the key, its canonical hash differs, and verification reports
`trustRecordHash mismatch` and a failed signature for a record that is intact. Reproduced on 2026-10-02
against the public sandbox with the published `parmana` 1.4.0 and with `main`: the raw JSON of
transaction `f0ff68b5-adab-49d4-ad00-12a1fcd99536` verifies, the model of the same record does not. The
TypeScript SDK is not affected. Until fixed, the docs (`docs/site/sdks/python.mdx`,
`docs/site/playground.mdx`) say to verify the raw JSON. A fix has to tell null from absent in the
generated models or keep the server's JSON with the model.

Fix: the decoder keeps the server's JSON on every decoded model (`SOURCE_JSON_ATTRIBUTE`, not a field), and
`encode()` returns a copy of it, so a decoded model goes back out exactly as the server sent it. This also fixes
`refusal_record` and Execution Intent verification, which send a decoded model back to the server. A model changed
with `dataclasses.replace()` has no source and is encoded from its fields. Test:
`python/tests/test_decoded_record_verifies.py`, on the real sandbox record with the sandbox's public key.

**G-86. All visitor data in the public sandbox was deleted around the retention job's first run, cause not
established. FOUND 2026-10-02, `pre-production` (sandbox data only; production not affected).**
The job `parmana-sandbox-retention` (`deploy/sandbox/retention.sql`, installed at about 03:00 UTC) ran once, at
03:30:00 UTC, for 9 ms, and `cron.job_run_details` reports `succeeded`. At 03:46 UTC the sandbox listed no
transactions, known Trust Records answered 404, and the oldest caller audit event left was from 03:36:54 UTC: every
event and request before it was gone, although all of it was less than a day old and the job's period is 7 days.
What was ruled out: the database holds one version of the function; the repository has only ever had one version of
`retention.sql`; every time column it compares is `TIMESTAMPTZ` and the server stamps them with its own clock; no
application code deletes from these tables; the install stage's check runs its 0 day period inside a transaction it
rolls back, and 28 transactions were still listed after it. Run against real Postgres with every migration (PGlite),
the job's exact command keeps a row an hour old and deletes one 10 days old. So either the scheduled run behaved
differently on Supabase than in every reproduction, or something deleted the data by hand between 03:30 and 03:36,
such as the manual reset `parmana_sandbox_retention(0)` the kit's README then documented; nobody could say whether
it was run. Production's database has no such function (the job is not a migration, and the kit refuses
production's project), and production answered READY throughout. The CLAIMS 2.51 evidence is kept in
`deploy/sandbox/evidence/check-record.json`; its transaction no longer exists in the sandbox. The job was paused
the same day (`cron.unschedule`).

Fix: any period under 7 days is refused unless the second argument is the confirmation word
`'DELETE RECENT DATA'`, and the one argument version of the function is dropped, so `parmana_sandbox_retention(0)`
alone deletes nothing. The README no longer shows a reset line. Every run that deletes writes a row to
`sandbox_retention_runs` (time, period, cutoff, session user, application name, client address, backend pid,
counts per table), so a future deletion says who ran it. Test: `tests/architecture/sandbox-retention-postgres.test.ts`
runs the file and the job's exact command against PGlite. Open: reinstall the job (`setup-sandbox.ps1 -Stage
Retention`) and check the first run's log row the next morning.

Update, 2026-10-06. A second reading of the timeline: every caller audit event before 03:36:54 UTC was gone, and the
job ran at 03:30:00. A 7 day run at 03:30 cannot delete events written after 03:30, so if any request reached the
sandbox between 03:30:00 and 03:36:54, the job did not delete everything; a 0 day run at about 03:36 did. That fits
the manual reset the README showed, or a check run whose transaction was not held: Supabase's transaction pooler
(port 6543) and an SQL editor that commits each statement both let a `parmana_sandbox_retention(0)` call commit on its
own, and `ROLLBACK` then undoes nothing. Not proven: whether any request arrived in those six minutes is unknown.
Fixed so that path cannot recur: the kit's check now calls `parmana_sandbox_retention_preview(0)`, which runs the
deletes inside a block that always undoes them and returns the counts, so it deletes nothing even with no
transaction around it; and `retention.ts` refuses a port 6543 string itself, not only through `setup-sandbox.ps1`.
Tests: `sandbox-retention-postgres.test.ts`, the two "(G-86)" cases, which fail without the change. To settle the
cause, if the logs still exist: the sandbox project's Postgres logs for 2026-10-02 between 03:25 and 03:40 UTC,
searched for `parmana_sandbox_retention`.

**G-87. A `POST /execute` or `POST /transactions` body without `metadata`, `intent` or `policy` returns a bare
`500`. FOUND 2026-10-02 in the API guide audit, `pre-production` (error reporting, not authorization; nothing is
executed).** With a valid `businessTransactionId`, a body missing any of those objects reaches
`BusinessTransactionValidator.validate` (`packages/runtime/src/validators/BusinessTransactionValidator.ts`), which
reads a field of the missing object and throws a `TypeError`. The error handler does not recognize it, so the
caller gets `500 {"error":"Internal Server Error"}` with no code and no hint of the missing object. Captured
2026-10-02 against the in process app for all three objects. Documented on `docs/site/api-reference/error-handling.mdx`
and in the error catalog. Fix, not built: check that each required object is present before validating and answer
`400` naming it.

**CLOSED 2026-10-06.** `BusinessTransactionValidator.validate` now checks, before anything else, that the
body is an object, that `metadata`, `authority`, `authorization`, `intent` and `policy` are objects, and
that each field the checks read is a string. A missing or malformed one is refused with `400`, for
example `{"error": "policy is required and must be an object."}`. Found again, and confirmed fixed, by the
request fuzzing added the same day: `packages/api/tests/integration/request-fuzz.integration.test.ts`
removes or replaces up to three fields of a valid transaction with arbitrary JSON and requires that
neither route ever answers `500` (it found `policy: null` and `policy: {}` before the fix). Exact tests:
`packages/runtime/tests/unit/BusinessTransactionValidator.test.ts` (20).

**G-88. A policy named `..` let `FilePolicyRepository` read and write outside the policy directory. FOUND
2026-10-05 by CodeQL (`js/path-injection`), CLOSED the same day.** The name and version pattern
(`/^[A-Za-z0-9._-]+$/`) rejected `/` but allowed a bare `.` or `..`, which `path.join` treats as a directory step.
`load("..", "x")` read `<basePath>/../x/policy.json`, and `save("..", "x", ...)` wrote it; `save` runs when an
approved policy change is applied, so reaching it needs an authenticated proposer and a second approver. Fixed in
`packages/policy/src/FilePolicyRepository.ts`: dot-only segments are rejected, and the resolved directory must stay
inside `basePath`. `FileKeyProvider` gained the same containment check, though key ids could not traverse (a key
file name always ends in `.private.pem` or `.public.pem`). Tests: `packages/policy/tests/unit/file-policy-repository.test.ts`,
"FilePolicyRepository dot-only name/version"; the three `save` cases failed before the fix.
Follow up, 2026-10-06: the policy change route (`POST /policies/:name/:version/pending-changes`) now refuses a
dot-only name, version or `proposedContent.policyVersion` with a 400 at proposal time, instead of the proposal
being stored and failing only when an approved change was applied; `@parmana/policy` is now 0.1.1, the first
version with the fix. Tests: `pending-policy-changes-governance.integration.test.ts`, the four "(G-88)" cases,
which fail without the route change. Advisory:
[GHSA-hp43-9p54-wqp9](https://github.com/pavancharak/parmana/security/advisories/GHSA-hp43-9p54-wqp9) (low).

**G-89. An edited Execution with its `chainSignature` removed passed the execution chain check. FOUND 2026-10-05
by mutation testing, CLOSED the same day.** `ExecutionChainCrypto.verifyChain` treated an Execution as chain
protected only when it carried both `chainHash` and `chainSignature`, and skipped any other Execution as legacy
data that predates chaining. Removing `chainSignature` from an edited Execution therefore skipped it, and removing
both fields from the last Execution of a record did too. Not exploitable on its own: every Execution is inside the
trust record's own hash and signature, which `VerificationService` checks as well, so the edit still failed
verification there. The chain is a second layer, and it was weaker than described. Fixed in
`packages/crypto/src/ExecutionChainCrypto.ts`: an Execution carrying only some chain fields is a break (`chain()`
always writes both), and once the chain has started, a later Execution without chain fields is a break. Legacy
Executions before the first chained one are still accepted. Tests: `packages/crypto/tests/unit/crypto-verifiers.exact.test.ts`,
"ExecutionChainCrypto, exactly"; three cases failed before the fix.

**G-90. `PolicyValidator` threw a `TypeError` instead of refusing a malformed policy. FOUND 2026-10-06 by
fuzzing, CLOSED the same day, `cosmetic` (a policy is still refused; the error was the wrong kind).** A
policy file is JSON an author writes. A `policyId`, `policyVersion`, `schemaVersion`, rule `id`, outcome
`reason` or condition `fact` that is not a string, a rule or condition that is `null` or not an object,
or an outcome that is a string, made `PolicyValidator.validate` throw a `TypeError` (`policyId?.trim is
not a function`, `Cannot use 'in' operator`). The policy was still not loaded, but the error did not say
which field was wrong, and callers that catch `PolicyValidationError` did not catch it. Each is now a
`PolicyValidationError` naming the field. Found by `packages/policy/tests/unit/policy.fuzz.test.ts`, which
also checks that a policy that validates evaluates any signals to `APPROVE` or `REJECT` without throwing;
exact tests in `PolicyValidator.exact.test.ts`.

**G-91. The offline verifier threw on a malformed `signatures` field. FOUND 2026-10-06 by fuzzing, CLOSED
the same day, `pre-production` (an auditor's tool must answer, not crash).**
`verifyExecutionTrustRecordOffline` is documented to report `valid: false`, never to throw. A record whose
`signatures` field held `null` entries, entries missing a string `algorithm`, `keyId` or `signature`, or a
value that is not an array, made it throw. It now reports `hybridSignaturesValid: false` with the error
"malformed signatures". Found by `packages/crypto/tests/unit/offline-verifier.fuzz.test.ts`, which hands
the verifier arbitrary records and keys and requires `valid: false` with a reason; exact tests in
`offline-verifier.exact.test.ts`. `@parmana/sign`, the published verifier, was not affected: checked the same
day, it already refuses a `signatures` value that is not an array, and any entry whose `algorithm`, `keyId`
or `signature` is not a string (`src/parmana/OfflineVerifier.ts` in that repository).

**G-92. Business validation (RFC-0023): sources can be registered and are verified, but none is connected.
OPENED 2026-10-10 with phase 1, `pre-production`; narrowed 2026-10-11 by phase 2.** Phase 1 added `signalSources` to
policies, the Trusted Signal, the resolver and the separate authority, business validation and execution statuses on
every Decision (CLAIMS.md 2.53). Phase 2 added registering any business system as a source through maker checker
(`/business-signal-sources`), the HTTP source with signed queries, and answers verified against the source's
registered Ed25519 key (CLAIMS.md 2.54). What is still open:

- **Verified in production with a demo source; no real business system connected.** The live check
  `examples/live-checks/business-signal-source` passed on 2026-10-11: a deployed source registered through maker
  checker with an Ed25519 key answered four production decisions under test policy `livecheck-signal`, signed and
  verified: paid approved on its answer, unpaid refused by the policy, the agent's contradicted value refused as
  `INVALID`, an unknown invoice as `MISSING_DATA` (`d736681f-8d86-4e24-bcf3-66debfa6ac23`, `266278b4-7683-43fd-97e7-aa724c6cca9a`, `1fd2274c-65e2-47c4-bda5-4dd57b198277` and `173c6f4f-f9d7-46e0-a712-9d9f39a274cd`). No shipped policy declares a source, so G-51 and G-76 are
  unchanged in practice until a real system (for refunds, the order system) is connected and a policy names it.
- **A source registered without a key is trusted on TLS alone.** Its answers carry no `sourceProof`, so the Trusted
  Signal proves what Parmana received over the pinned HTTPS connection, not that the source said it. A key is
  recommended, not required.
- **Parmana proves the source said it, not that it is right.** A compromised or mistaken source gives verified wrong
  answers. Limiting what a source may answer (which claims, for which policies) is not built.
- **Validity at release** is re-checked by the gateway since phase 4 (CLAIMS.md 2.56); what is open there is G-94.
- **Authority is the existing checks,** except under a policy with `requireAuthorityGrant`, which also needs
  the caller's grant (phase 3, CLAIMS.md 2.55; what is open there is G-93).
- **Nonce reuse is the source's to refuse.** Parmana sends a fresh nonce and a 60 second expiry with each query; the
  example endpoint refuses a nonce it has answered, in memory. A source that keeps no record of nonces would answer a
  replayed query again; the answer still names the replayed query's nonce, so it cannot be used for another one.

**G-93. Per-agent authority grants (RFC-0023 phase 3) are opt in, and their limits are per request.
OPENED 2026-10-11, `pre-production`.** A policy with `requireAuthorityGrant` decides a request only when the
authenticated caller holds a grant in force, within its limits, made through maker checker (CLAIMS.md 2.55). What is
open:

- **Verified in production with a test policy; no shipped policy requires a grant.** The live check
  `examples/live-checks/authority-grant` passed on 2026-10-11: under `livecheck-grant` (`requireAuthorityGrant`), a
  request was refused before a grant, approved within it (the grant in the signed record), refused above its limit and
  refused after its revoke (`8a75374c-150d-4cea-b57a-abb3a92bcac6`, `da96002b-66ec-44cf-88da-0f29997e4711`, `87770ab4-ac7c-4768-94a9-46df2367782b` and `41ec047d-bf64-48f4-b718-a419c7575e8d`). Production authority for real actions is unchanged until a policy for one opts in
  through policy governance.
- **Limits are per request.** A grant can cap one request at 100000, not the total per day. Cumulative limits need a
  counter written atomically with the decision, as the earlier Razorpay daily refund ledger did; not built. The design for building them is in RFC-0023, "Cumulative grant limits".
- **The grantee's caller id is not checked to exist.** API keys live in configuration (`PARMANA_API_KEYS`), not in a
  repository the route can read. A grant to a key that does not exist has no effect, but is listed.
- **Re-checked at release** since phase 4 (CLAIMS.md 2.56): a grant that expires or is revoked between the decision and
  the release stops that release.
- **Deployed 2026-10-11** (`main` at `4fdc2c2`); `GET /authority-grants` answers in production, and no grant has been
  made there. The SDK methods are in SDK 1.6.0.

**G-94. What a decision rests on is re-checked at release, but "execute only if still valid" at the system is the
endpoint's to implement. OPENED 2026-10-11, `pre-production`.** Phase 4 signs the business conditions and the authority
grant into the authorization, the gateway refuses a release once either no longer holds, and an external connector's
release carries the conditions (CLAIMS.md 2.56). What is open:

- **The endpoint decides whether to check the conditions.** Parmana signs them and the SDK verifies them, but only an
  endpoint that checks them in the same transaction as the action executes only if they still hold. One that ignores
  them still works, without the guarantee.
- **Built in connectors get only the gateway re-check.** Paytm, HubSpot, GitHub and Slack are called by Parmana's own
  adapters, which do not ask the business system again between the gateway check and the call.
- **A release refused at release leaves the Execution Intent `ERRORED`.** The response says `NOT_EXECUTED`; the intent
  has no "not released" state, so a person closes it as `NOT_EXECUTED`, as for a connector that is not registered.
- **No end to end test through `POST /execute` with the production gateway.** The gateway checks, the adapter and the
  runtime are each tested; a request whose grant is revoked between decision and release cannot be timed through one
  `execute` call without a test hook.
- **Deployed 2026-10-11** (`main` at `4fdc2c2`), not yet exercised in production: no production decision carries
  conditions or a grant until a policy uses `signalSources` or `requireAuthorityGrant`.

---

## Remaining gaps, by severity

**Status note, updated in the adversarial-testing hardening session that added G-24:**
every `blocks-pilot` entry (G-1, G-2, G-3, G-24) is now resolved. **This note's own prior
claim, "none describes a live, exploitable security defect," was wrong at the time it
was written**, not because anything regressed, but because G-24 was a real, live,
exploitable bypass of the core execution-authorization invariant that this document's own
internal audit process had not found; an external adversarial exercise found it. Left here
deliberately, struck through in spirit rather than silently rewritten, as the concrete
reason this document's own "re-verify before relying on it" caveat exists. Every gap still
open below (`pre-production`: G-4, G-5, G-6, G-7, G-8, G-9; `cosmetic`: G-10, G-11) is, by
its own text, either explicitly not a security defect (G-9), unreachable from any HTTP path
(G-8), disconnected from the live request path (G-6), a permanent-skip test-coverage gap
rather than a vulnerability (G-7), or a documentation/citation gap (G-10, G-11). This is
again an assessment of those entries as written, not a fresh audit pass against them, and
carries the same re-verify caveat G-24 just demonstrated the cost of skipping.

**Addendum (2026-08-24):** this status note's own gap list (G-4 through G-11) predates
several gaps added in later sessions and is not being retroactively expanded to enumerate
all of them here — see each gap's own entry for its current status. One addition from this
date is directly relevant to this note's own claim structure: **G-29** (new, `pre-production`,
below) is, like G-9, explicitly not a security defect — no request that should be rejected
executes — but unlike every other `pre-production` entry in this note's list, it is a gap
in this system's own audit/evidentiary trail, the same category of property RFC-0021
(Refusal Records) and the caller-audit-sink work exist specifically to provide. It is
open precisely because those two mechanisms both fire downstream of the point where G-29's
rejections occur, not because either mechanism has a defect. **G-29 itself was resolved
later the same day** — see its own entry below for the fix.

**Addendum (2026-09-14):** same pattern as G-29 above, twice over. **G-42** and **G-43**
(new, `pre-production`, below) are, like G-9 and G-29, explicitly not security defects — no
unauthorized execution occurs in either — but gaps in this system's own audit/evidentiary
trail: G-42 for the Execution Gateway's own events (the `ExecutionAuditSink` analogue of
G-13's already-closed `NonceStore`/`CallerAuditSink` gap), G-43 for the equivalent, and
previously total, absence of any audit trail at all in `parmana-paytm-agent`, a separate
repository this codebase forwards Paytm refund requests to. **Both were resolved the same
session they were found** — see their own entries below.

**Addendum (2026-09-25):** the self hosted deployment audit opened G-56 to G-60, and the
same day's build closed G-56, G-57, G-58 and G-60 and dropped G-59 as not needed, each with
evidence in its own entry above. The build found G-61 (the migration bundle is not safe to
run again on a database with data), `pre-production`, now mitigated for the self hosted path,
and G-62 (policy approval on a self hosted deployment needs the repository's scripts on an
operator machine), `pre-production`, open. The docs pass of the same day found G-63 (an
unreachable connector gave the caller a bare `500`), `pre-production`, and G-63 and G-61 were
both closed later the same day (`502 EXECUTION_OUTCOME_UNKNOWN`; `npm run db:migrate`), and the SDK
alignment pass closed G-64 in the source (the SDKs did not cover the same API or policy
governance); the TypeScript SDK 1.3.0 was published to npm the same day, which closed G-62, and the Python SDK 1.3.0 was published to PyPI the same day. None is a security defect and none affects the
hosted API on Vercel.

**Addendum (2026-09-27):** a check of a positioning draft against the source code opened G-65 (a
refused request cannot be escalated to a person and approved) and G-66 (the policy version for
each action is fixed in code). Building G-65 the same day found G-67 (a valid approval could never
pass the gateway), `blocks-pilot`, closed in the same change. **One security defect on `main`,
live wherever the Paytm connector is configured (not checked for production on this date):** a
`paytm:refund` agent can send `managerApproved: true` with no manager, and nothing checks it
(G-51); with `customer-refund` 1.0.0 that approves any eligible,
fraud checked refund up to 10000. PR #46, merged to `main` and deployed to production on 2026-09-27 (PR #46, merge `4eebd5f`), closes it once `customer-refund` 1.1.0 is approved in production: 1.1.0 declares `managerApproved` in `approvalSignals`, and it is verified. Until that approval, refunds run under 1.0.0 and the defect stands. G-66 was built and merged in the same PR. The resume point is
`docs/progress/2026-09-27-HUMAN-APPROVAL.md`.

**Addendum (2026-09-28):** the production Vercel project had `PAYTM_CONNECTOR_URL`,
`PAYTM_CONNECTOR_SHARED_SECRET` and `PAYTM_CONNECTOR_TIMEOUT_MS` set (names checked with the Vercel CLI
on 2026-09-27, values not read) and a `paytm-refund-agent` API key, so the G-51 defect above was live in
production. It is closed there: every production API key was rotated on 2026-09-27, and
`customer-refund` 1.1.0 was approved in production at 2026-09-27 18:53:40 UTC (change
`008f504d-0efd-4bec-b33a-2991bb84099f`), so `managerApproved: true` is verified. With no approver in
`TRUSTED_APPROVAL_ISSUERS`, every production refund above 10000 is refused. The change was proposed by
`policy-maker` and approved by `reviewer-charak1987`: two distinct credentials held by one person, which
the server cannot tell apart from two people. `refundEligible` and `fraudCheckPassed` are still caller
declared. **Update (2026-09-28):** one approver, `manager-charak1987`, held by the operator, is now listed
in `TRUSTED_APPROVAL_ISSUERS`; refunds above 10000 need that approver's signature.

**Addendum (2026-09-28, AI attack review):** a review of what a manipulated agent can do found G-73
to G-78 (section "Gaps opened in the 2026-09-28 AI attack review" above). **One live security defect in
production:** G-75, a `paytm:refund` up to 10000 authorized on the agent's own eligibility and fraud
claims under `customer-refund` 1.1.0. Fixed in the repository on branch `fix/ai-attack-hardening`
(`customer-refund` 1.2.0). G-73 (GitHub merges) is fixed the same way; G-76 (Slack channels) and G-78
(public rate limits) take effect on deploy; G-77 is closed by a test; G-74 (`llm-tool-call`) is closed
by retiring superseded versions. **Update (2026-09-28):** PRs #70 and #71 are merged; #70's bindings are live in production (`GET /policies/in-effect`
refused `github:pr-fetch` for want of an approved `github-pr-read` before the approvals), and
`customer-refund` 1.2.0, `github-pr-approval` 1.1.0, `github-pr-read` 1.0.0 and `llm-tool-call` 1.1.0 are
approved in production, so G-75 is closed there. `GET /policies/in-effect` in production then returned
`customer-refund` 1.2.0 for `paytm:refund`, `github-pr-approval` 1.1.0 for `github:pr-merge` and
`github-pr-read` 1.0.0 for `github:pr-fetch` (checked by the operator, 2026-09-28). Slack is not configured in production (checked by
the operator the same day), so G-76 had no production exposure.

**Addendum (2026-09-28, refund agent):** reading the refund agent against Parmana's release path
found **G-70**, `blocks-pilot`: `parmana-paytm-agent`'s `/agent/refunds` called Paytm itself after
Parmana had already released the refund through its connector, so an approved refund could be paid
twice. Dormant in production since 1.1.0 was approved (the agent declared 1.0.0 and every refund was
refused); possible before that. Fixed in that repository's PR #6, which also makes the agent read the
policy version from `GET /policies/in-effect`. **Update (2026-09-28):** merged and deployed the same
day; a refusal was verified in production through the agent; the approved path is covered by tests and
closes fully when one refund is observed live with one Paytm call. The same review found **G-71**, `pre-production`: one refund per Paytm transaction through
Parmana, and the refund reason is not sent to Paytm. Fixed and deployed the same day (optional
`refundReference`, reason forwarded): Parmana PR #59, then agent PR #7.

### blocks-pilot

**Stale-narrative notice, added 2026-08-24, read before relying on anything below.** The
Razorpay connector — `RazorpayConnector`, `RazorpayRefundService`,
`RazorpaySignalStateVerifier`, `RazorpayDailyRefundLedger`,
`RazorpayCumulativeRefundLedger`, `RazorpaySettlementProcessor`, and every
`packages/connector-sdk/src/connectors/razorpay/*`/`packages/api/src/bootstrap/*Razorpay*`
file this G-24 entry and its updates below cite by path — **was deliberately removed from
this codebase in its entirety on 2026-08-12** (commit `d8a6ded`, "Add HubSpot integration
evidence and update TRL assessment"; confirmed directly: `git log --all -- <any of the
paths above>` shows no file at `HEAD`). `docs/CLAIMS.md` §3.16 and §3.8/§3.9 (both now
marked "Historical: Razorpay connector removed 2026-08-12") already carry this correction;
this document did not, until now — nothing here had been touched since commit `586ea3a`,
which predates the removal, RFC-0021 (Refusal Records), caller-to-capability scoping
(`allowedCapabilities`), the principal-denied audit trail (`docs/CLAIMS.md` §3.19), and
the structural-validation audit trail (G-29 below) alike. The
narrative below is preserved as-written, unedited, as an accurate historical record of
what closed G-24 and its TD-23/RFC-0022 residuals for Razorpay _while the connector still
existed_ — but every present-tense claim in it about `RazorpaySignalStateVerifier` etc.
being "wired into production `POST /execute`" is no longer true of current `main`.
`hubspot:deal-update`/`hubspot:deal-fetch` and, since 2026-08-19,
`github:pr-fetch`/`github:pr-merge` (`docs/CLAIMS.md` §3.17) are the capabilities actually
reachable in production today; `HubSpotSignalStateVerifier` (the hubspot-deal-update
closure, further below in this same entry) remains live and current, unaffected by the
Razorpay removal. See G-30 below: the GitHub pair was never added to
`CANONICAL_CAPABILITY_POLICY_BINDINGS`, unlike HubSpot's.

---

**G-24. Policy-evaluation signals were never bound to the executed Intent: the most
severe gap found in this document, a live, reproducible bypass of the core "no
unauthorized execution" invariant, not merely an operational or data-consistency gap
like the rest of this tier. RESOLVED in the adversarial-testing hardening session that
found it.** Found via an external adversarial security exercise (not this codebase's own
internal audit process) run against a disposable local clone: `BusinessTransactionMapper.
fromRequest` (`packages/api/src/mappers/BusinessTransactionMapper.ts:34,36`) takes
`policy` and `signals` verbatim from the client request body. `SignalValidator`
(`packages/policy/src/SignalValidator.ts`) only checks that `signals` is a well-shaped
object, never that its _values_ are true. `RuntimeEngine.execute`
(`packages/runtime/src/RuntimeEngine.ts`) evaluated `PolicyEngine.evaluate(policy,
signals)` against exactly those caller-declared signals, with no server-side enrichment
or derivation anywhere in the codebase (confirmed by a repo-wide grep for
enrichment/derivation patterns at the time: zero hits). Separately, `ExecutableContent`
(`packages/shared/src/domain/executable-content.ts`), the thing `ExecutionGateway`
actually signs and executes, is built from `intent.action`/`intent.target`/
`intent.parameters`, a completely disjoint set of fields from `signals`. Nothing
cross-validated that the two described the same real-world action. `docs/CLAIMS.md`
§3.4 already documented half of this precisely, neutrally, without flagging it as a
risk: "policy is evaluated against caller-supplied signals, the same generic mechanism
vendor-payment already uses"; the authors knew signals were caller-supplied; nothing in
the document connected that fact to the missing binding.

Live proof-of-concept, reproduced against an isolated disposable clone (no production
system, no real credentials, no live traffic; see that session's own isolation
confirmation) and again against this repository directly after the fix, both via `POST
/execute` with a real, valid API key and no other privilege: `signals` declared a fully
verified, policy-approved $5,000 payment to a known vendor
(`vendorVerified/invoiceVerified/paymentApproved/sufficientFunds: true, paymentAmount:
5000, riskScore: 10, vendorId: "VENDOR-1001"`), while `intent`, the part that actually
executes, targeted `"ATTACKER-CONTROLLED-ACCOUNT-9999"` for `999999999`. Before the fix:
`200`, policy decision `APPROVED`, execution `COMPLETED`, a real Ed25519-signed Execution
Trust Record and receipt issued for it: the exact artifacts this project's "independently
verifiable execution" claim rests on, attesting to something that never happened as
described. A related, compounding finding from the same session: `authority.principalId`
(who the trust record says approved the action) was likewise caller-declared with no
binding to the identity `callerId` actually proves. Any caller holding any valid API key
could claim to be any human or role, including an "impersonate the CEO" PoC that also
succeeded before this fix.

Fix, two parts, deliberately scoped to _bind the signals a policy actually evaluates to
the intent it actually executes_ rather than the larger, separate problem of
independently re-verifying every signal's truth (most signals, `vendorVerified`,
`riskScore`, and similar, have no Intent-side equivalent at all; deriving _those_ from an
independently verified source, the way `RazorpaySettlementProcessor` already correctly
does for webhook-derived settlement facts ("the webhook is a doorbell, not a delivery"),
is real, valuable, future work, not done this session):

- **`Policy.boundSignals`** (`packages/policy/src/types/Policy.ts`), an opt-in map from
  signal key to an intent dot-path (`{ "paymentAmount": "parameters.amount", "vendorId":
"target" }`), validated structurally by `PolicyValidator`. **`SignalIntentBinder`**
  (`packages/policy/src/SignalIntentBinder.ts`) checks every declared binding (strict
  equality; a missing signal counts as a violation, not a pass), and `RuntimeEngine.
execute` runs this check immediately before `PolicyEngine.evaluate`, over the exact
  signals about to be evaluated and the exact intent that will be signed and executed if
  approved. A violation is built into an ordinary `PolicyDecision` with outcome `REJECT`
  and a reason naming every mismatched field. It flows through the same `ExecutionGate.
enforce` rejection path as any other policy rejection, so **no authorization is ever
  generated** for a mismatched request, the same fail-closed shape as every other gate in
  this document. `policies/vendor-payment/2.0.0/policy.json` and
  `policies/razorpay-refund/1.0.0/policy.json` were patched in place (not new versions:
  this is a security fix to existing behavior, the same precedent G-1's in-place atomicity
  fix set, not a new business capability) to declare `boundSignals` for their
  amount/target-shaped signals.
- **`isPrincipalAllowed`** (`packages/api/src/auth/isPrincipalAllowed.ts`): an
  authenticated caller may only submit a transaction whose `authority.principalId` is in
  its `ApiKeyEntry.allowedPrincipalIds` grant (`packages/shared/src/config/
ApiKeyEntry.ts`), defaulting, when unset, to requiring `principalId === callerId`
  exactly, never "anything." Enforced in `routes/execute.ts` and `routes/transactions.ts`
  before `application.execute` is ever called; a mismatch is `403`, no transaction
  constructed. Composed with a second, independent fix for the compounding IDOR finding
  from the same session (any authenticated caller could read any other caller's complete
  transaction/trust-record/receipt history via `/transactions`, `/trust-records`,
  `/verify`, `/verification`, `/replay`, `/receipt*`, none of them scoped by caller at
  all): `metadata.submittedBy` is now stamped server-side from the authenticated
  `callerId` (any client-supplied value is overwritten, never trusted), and
  `isOwnedByCaller` (`packages/api/src/auth/isOwnedByCaller.ts`) gates all six read routes
  plus `GET /transactions`'s list (filtered post-fetch) and `GET /transactions/:id`.
  Cross-caller access now reads as a clean `404`, not a `403` that would confirm the
  target id exists. Both principal-binding and ownership checks are skipped only when
  caller-auth itself is disabled (`req.callerId === undefined`), matching that mode's
  existing no-caller-identity posture.

A third, unrelated finding from the same session was fixed alongside these because it was
already well-scoped: `FilePolicyRepository.load` (`packages/policy/src/
FilePolicyRepository.ts`) built its file path from `name`/`version` with no input
validation, the same bug class G-20 (this table's item 20, FileKeyProvider) had already
been hardened against, just not applied here. Live PoC: `policy: { name:
"../examples/tutorials/01-hello-world", version: "." }` produced a _different, content-
dependent_ error (`400 "policyId is required."`) than the clean `404 "not found"` a
genuinely absent path returns, proof the file was read and parsed from outside
`PARMANA_POLICY_DIR`. Now rejected by the same `^[A-Za-z0-9._-]+$` allowlist
`FileKeyProvider` already uses, before any filesystem access, collapsing both cases to an
identical `404` with no differential signal. A fourth, lower-severity finding (malformed
JSON and oversized request bodies on `/execute` surfaced as a generic `500`, indistinguish-
able from a crash, even though the identical `entity.too.large` error type already had
dedicated `413` handling on the webhook route) was fixed the same way, in
`middleware/error-handler.ts`.

Verified: 28 new tests across `packages/policy` and `packages/api` (`SignalIntentBinder.
test.ts`, `file-policy-repository.test.ts`, `isPrincipalAllowed.test.ts`,
`caller-scoping.integration.test.ts`, `error-handler-body-parsing.test.ts`, plus new cases
in `runtime.e2e.test.ts` and `caller-auth.integration.test.ts`), each reproducing the
specific live exploit shape found and asserting it is now rejected, alongside positive
controls proving legitimate matching requests still succeed and cross-caller access to a
caller's _own_ data is unaffected. Full suite: 597 tests (558 passed, 35 skipped, the
same pre-existing Supabase-gated skip count as before this session, nothing newly
skipped), `npm run lint` and `npm run typecheck` both clean. The exact live exploit
sequence (signal/intent mismatch, principal spoofing, path traversal, cross-caller read)
was re-run via real HTTP against a freshly built, isolated clone with the fix applied,
not only the automated suite, and confirmed blocked in every case, with a positive
control confirming a legitimate, correctly-bound request still executes successfully.

**Residual, explicitly not addressed by this session, flagged for a future pass:**
`boundSignals` only closes the _decoupling_ between what a policy evaluates and what
executes for the specific fields a policy author declares bound. It does not verify that
an unbound signal (`vendorVerified`, `paymentApproved`, `sufficientFunds`, `riskScore`,
and similar) is actually _true_. Those remain caller-declared attestations with no
independent verification, same as before this session; closing that gap for real would
mean extending the `RazorpaySettlementProcessor` fetch-verify pattern to policy signals
generally, a materially larger project than this session's scope. `razorpay-refund/1.0.0`
was bound only on `requestedRefundAmountPaise`; a `paymentId`-shaped binding (so a
declared `paymentStatus: "captured"` claim cannot be about a different payment than the
one `intent` actually refunds) was considered and deliberately not added, since the
policy's `signalsSchema` has no existing field cleanly mappable to `intent.parameters.
paymentId` without inventing new policy-author-facing surface beyond this session's
scope. Flagged here rather than silently left unmentioned.

**Update (2026-08-04), RFC-0022: the razorpay-refund slice of this residual is now closed.**
`SignalStateVerifier` (`packages/policy/src/types/SignalStateVerifier.ts`) is a new, optional,
additive port. `RuntimeEngine.execute` computes a _provisional_ decision exactly as before
(`SignalIntentBinder` check, then `PolicyEngine.evaluate` if binding passed), and only when that
provisional decision is `APPROVE` does it run the configured `SignalStateVerifier`, over the
exact signals just evaluated; a violation overrides the decision to an ordinary REJECT
(`matchedRuleId: "signal-state-verification-violation"`), the same fail-closed shape
`SignalIntentBinder` violations already use. Gating on "provisional decision is APPROVE" rather
than running unconditionally is deliberate: a request already going to be REJECTed (by binding or
by an ordinary policy rule) needs no independent re-fetch, which preserves the existing "a policy
denial makes zero calls to the external vendor system" property those tests already asserted
(see `hubspot-deal-update.integration.test.ts`'s `fetchSpy` assertions, updated below). `SignalIntentBinder`
itself is unmodified. `RazorpaySignalStateVerifier`
(`packages/connector-sdk/src/connectors/razorpay/RazorpaySignalStateVerifier.ts`) is the
concrete implementation wired into production `POST /execute`
(`packages/api/src/bootstrap/createRazorpaySignalStateVerifier.ts`, composed in
`packages/api/src/application.ts`): for `razorpay:refund-create` requests only, it independently
re-fetches the real payment from Razorpay -- reusing the exact fetch `RazorpayRefundService`
already performed (`executeRazorpayCapability`, extracted from `RazorpayRefundService` into
`RazorpayCapabilityExecution.ts` so both share one implementation) -- and compares `paymentStatus`,
`paymentCurrency`, `refundableRemainingPaise`, and `requestedExceedsRemainder` against the
caller-declared signals. A fetch failure (network error, payment not found) is itself treated as
a violation: fail-closed, never a silent pass-through. `requestedRefundAmountPaise` is read from
the caller's declared signals rather than re-derived, because `SignalIntentBinder` has already
proven it equals `intent.parameters.amountPaise` by the time this verifier runs.

**Verified:** a new regression test,
`packages/api/tests/integration/razorpay-refund.integration.test.ts` ("rejects by policy through
POST /execute when caller-declared signals misrepresent the real Razorpay payment state"), was
written first and confirmed failing (`200 APPROVED`, a real refund landing on the mock server)
against the code as it stood before this fix, then confirmed passing (`403 POLICY_DENIED`, no
refund reaches the mock server) after it. Full repo `tsc -b`, `eslint . --ext .ts`, and `vitest
run` (762 passed, 40 pre-existing skips, no new skips) all clean, no regressions.

**Explicitly still open, not addressed by this update:**

- ~~`dailyCumulativeAfterThisRefundPaise` is _not_ independently verified~~ **-- CLOSED, TD-23
  Phase 3B, see `docs/CLAIMS.md` 3.4's RFC-0022/TD-23 update.** `RazorpayDailyRefundLedger`
  (`packages/connector-sdk/src/connectors/razorpay/RazorpayDailyRefundLedger.ts`, a new,
  differently-shaped `reserve()`/`release()` atomicity primitive -- not the same interface
  as the 2026-08-04 `RazorpayCumulativeRefundLedger.recordApprovedRefundIfWithinCap()` fix
  below, which lived inside `RazorpayRefundService`, since deleted entirely in the
  execution-ownership refactor that moved `RazorpayConnector` to `execution-gateway`; see
  the connector-path corrections elsewhere in this document) is now unconditionally
  supplied to `RazorpaySignalStateVerifier` in production
  (`createRazorpaySignalStateVerifier.ts`), backed by `SupabaseRazorpayDailyRefundLedger`.
  This residual note originally tracked whether _any_ ledger was reachable from production
  at all -- it is now, via this new primitive, superseding the deleted class's fix rather
  than continuing it.
- **`vendor-payment`** (`policies/vendor-payment/2.0.0/policy.json`) has the identical shape of
  gap and no verifier: `vendorVerified`, `invoiceVerified`, `paymentApproved`, `sufficientFunds`,
  and `riskScore` remain pure caller-declared attestations. There is no single external system in
  this codebase these facts could be fetched from the way Razorpay's payment API supplies
  `razorpay-refund`'s facts, so closing this one is a materially different, larger problem than
  either closure below, not a trivial extension of them.

**Update (2026-08-04), RFC-0022: the hubspot-deal-update slice of this residual is now also
closed**, following the razorpay-refund closure above exactly, as its flagged "natural next
candidate" (a real, fetchable external source -- HubSpot's own deal API -- already existed).
`HubSpotSignalStateVerifier`
(`packages/connector-hubspot/src/HubSpotSignalStateVerifier.ts`) is the concrete implementation,
wired into production `POST /execute` the same way
(`packages/api/src/bootstrap/createHubSpotSignalStateVerifier.ts`, composed alongside the Razorpay
verifier in `packages/api/src/application.ts` via a new `CompositeSignalStateVerifier`
(`packages/policy/src/CompositeSignalStateVerifier.ts`), since `RuntimeEngine` accepts exactly one
`SignalStateVerifier` and each capability-scoped verifier only recognizes its own action, returning
no violations for anything else): for `hubspot:deal-update` requests only, it independently
re-fetches the real deal from HubSpot -- reusing the exact fetch `HubSpotDealUpdateService`
already performed (`executeHubSpotCapability`, extracted from `HubSpotDealUpdateService` into
`HubSpotCapabilityExecution.ts`, mirroring `RazorpayCapabilityExecution.ts` exactly) -- and
compares `currentDealStage`, `dealStageChangeRequested`, `dealStageTransitionAllowed`,
`amountChangeRequested`, `amountDeltaAbs`, and `amountChangeExceedsThreshold` against the
caller-declared signals. A fetch failure is itself treated as a violation: fail-closed, never a
silent pass-through. `proposedDealStage`/`proposedAmount` are read from the caller's declared
signals rather than re-derived, because `SignalIntentBinder` has already proven they equal
`intent.parameters.dealstage`/`intent.parameters.amount` by the time this verifier runs.
`preAuthorizedForAmountChange` is deliberately excluded from _this_ verifier's fetch-based
mechanism: it is an explicitly out-of-band claim with no HubSpot-side fact to fetch and compare
against (see `HubSpotDealUpdateSignals.ts`'s own comment on that field), the same category of
exclusion as `dailyCumulativeAfterThisRefundPaise` above was, at the time this paragraph was
written. **Update (TD-23, Phase 3C, now closed):** exclusion from fetch-based verification did
not mean unverified forever -- `preAuthorizedForAmountChange` now has its own, differently-shaped
verification path (a real, independently-issued, signed Approval Artifact, not a HubSpot API
fetch), added directly to `HubSpotSignalStateVerifier` itself. See `docs/CLAIMS.md` 3.10's
TD-23 update for the full mechanism (`ApprovalVerifier`, `packages/approval/src/ApprovalVerifier.ts`).

**Verified:** a new regression test,
`packages/api/tests/integration/hubspot-deal-update.integration.test.ts` ("rejects by policy
through POST /execute when caller-declared signals misrepresent the real HubSpot deal state"),
was written and confirmed failing (`200 APPROVED`, no deal-state check) with the HubSpot verifier
deliberately left out of the composite while the Razorpay verifier stayed wired, then confirmed
passing (`403 POLICY_DENIED`, the mock deal stage stays unchanged) once wired in. This also
implicitly re-verified the ordering fix above: the two pre-existing `hubspot-deal-update`
policy-denial tests, each asserting _zero_ HTTP calls reached the mock HubSpot server on a
denial, kept passing with the verifier now in the request path, because it only ever runs when
the provisional decision is `APPROVE`. `HubSpotDealUpdateService`'s own 42 pre-existing unit
tests pass unmodified -- this was a pure additive change to production wiring, not a change to
that service's behavior. (`HubSpotDealUpdateService` was itself later deleted in the Phase 1C
execution-ownership refactor, replaced by `HubSpotCapabilityExecution.ts`; this was a true,
accurate statement about the code as it stood at the time this paragraph was written.) Full repo `tsc -b`, `eslint . --ext .ts`, `tsc --noEmit`, and `vitest
run` (763 passed, 40 pre-existing skips, no new skips) all clean, no regressions.

**Explicitly still open, not addressed by this update:** `vendor-payment` (above) remains the
only capability of the three using this generic signals mechanism with no independent state
verification at all, for the reason already stated: no single fetchable external source exists
for its signals in this codebase.

**Investigation (2026-08-04): `vendor-payment` remains genuinely blocked, not merely
unattempted.** Per-fact breakdown of every unbound signal in
`policies/vendor-payment/2.0.0/policy.json`'s `signalsSchema` (only `paymentAmount` and
`vendorId` are bound, via `boundSignals`):

- `vendorVerified` -- would need a vendor-verification/KYB (know-your-business) service. No
  connector anywhere in this codebase represents one, not even as a write-only placeholder.
- `invoiceVerified` -- would need an accounts-payable/invoicing system exposing invoice
  match/approval status. `SapConnector` (`packages/connector-sdk/src/connectors/sap/
SapConnector.ts`) is the plausible real-world candidate (SAP is a common AP system), but it is
  a bare `MockConnector` with exactly one capability, `sap:post-invoice` (write-only, scripted,
  in-memory), explicitly documented as "temporary... until the real connector is implemented."
  No fetch/read capability exists.
- `paymentApproved` -- would need an approval-workflow system. `WorkdayConnector`
  (`.../workday/WorkdayConnector.ts`) is the plausible candidate, same situation exactly:
  `MockConnector`, one write-only capability (`workday:submit-expense-report`), no fetch
  capability, same "temporary" doc comment.
- `sufficientFunds` -- would need an account-balance/treasury API. `OracleConnector`
  (`.../oracle/OracleConnector.ts`) is the plausible candidate, same situation: `MockConnector`,
  one write-only capability (`oracle:create-purchase-order`), no fetch capability.
- `riskScore` -- would need a risk/fraud-scoring service. No connector of any kind represents
  one in this codebase, not even a write-only placeholder like the four above.

`VendorPaymentConnector` itself (`.../vendor-payment/VendorPaymentConnector.ts`) is likewise a
bare `MockConnector`, one write-only capability (`vendor-payment`), no fetch capability, same
"temporary... until the real connector is implemented" doc comment.

Unlike Razorpay and HubSpot, where `MockRazorpayServer`/`MockHubSpotServer` stand in for a real,
already-production-capable HTTP integration (`RazorpayConnector`/`HubSpotConnector` speak to the
real vendor API today whenever no test-only `*_BASE_URL` override is set), `MockConnector` here
is not a test substitute for anything real: in production it would simply return
`{ success: true, metadata: {} }` for whatever it's asked to execute. There is no real system,
mocked in tests, that a verifier's fetch could be faithfully checked against for any of the five
facts -- building one now would mean either fetching from a write-only capability that has
nothing to fetch, or fabricating a new read capability backed by nothing but a hardcoded test
double, which would not be independent verification, only the appearance of it. Per this
investigation's own instructions: this is "genuinely blocked," not "could close this but
haven't" -- **no code was changed for vendor-payment.** All five facts remain exactly as
documented above: pure caller-declared attestations.

**Update (2026-08-04): the daily-cumulative-cap ledger race (flagged above and in the
state-freshness investigation that preceded the razorpay-refund closure) is now fixed.** The
race: `RazorpayRefundService.requestRefund()` read `RazorpayCumulativeRefundLedger
.cumulativeAmountToday(scopeId)` once, early (before that call's own payment fetch and policy
evaluation), then -- across two further `await` points (the payment fetch, and later the actual
refund-create capability call) -- unconditionally appended to the ledger only after a successful
refund, with nothing re-checking the total in between. Two concurrent `requestRefund()` calls for
the same `scopeId` could both read the same pre-write total, both independently pass the
`reject-exceeds-daily-cumulative-cap` rule, and both execute, pushing the real combined total
over the configured cap.

Fix: `RazorpayCumulativeRefundLedger.recordApprovedRefundIfWithinCap(scopeId, amountPaise,
businessTransactionId, capPaise, now?)`
(`packages/connector-sdk/src/connectors/razorpay/RazorpayCumulativeRefundLedger.ts`) re-reads the
current total and appends in a single synchronous call -- no `await` anywhere inside it, so
JavaScript's run-to-completion semantics make the read-then-append atomic with no explicit lock
needed. Returns the new total when the append is accepted, or `null` when appending would exceed
`capPaise` (nothing appended). `RazorpayRefundService.requestRefund()` now calls this immediately
before the actual refund-create capability call (not at the point signals are first built, and no
longer unconditionally after success): a `null` result is treated as an ordinary REJECT
(`matchedRuleId: "reject-exceeds-daily-cumulative-cap-race-guard"`) and Razorpay is never
contacted for it, the same "zero external calls on a denial" shape every other REJECT path here
already has. `capPaise` comes from a new `RazorpayRefundServiceOptions.dailyCumulativeCapPaise`
field, defaulting to a new exported constant,
`RAZORPAY_DEFAULT_DAILY_CUMULATIVE_CAP_PAISE = 2_000_000`
(`packages/connector-sdk/src/connectors/razorpay/RazorpayRefundSignals.ts`) -- this must match
`policies/razorpay-refund/1.0.0/policy.json`'s own cap literal exactly; the two are not
mechanically linked (nothing reads a rule's literal value back out of hand-authored policy JSON),
the same accepted coupling risk `HUBSPOT_DEFAULT_AMOUNT_CHANGE_THRESHOLD` already carries against
`hubspot-deal-update`'s policy.

Known, accepted trade-off of reserving before executing rather than only recording after success:
if the reservation succeeds but the subsequent Razorpay-side refund-create call itself then fails
(network error, Razorpay rejects it), the ledger entry is not rolled back --
`AppendOnlyLedger` is deliberately append-only, by design, with no delete. The day's recorded
cumulative total can therefore end up slightly higher than the sum of refunds that actually
landed on Razorpay, conservatively reducing remaining headroom for the rest of that scope's day.
This is the opposite failure direction from the race being fixed (under-permits rather than
over-permits) and is flagged here rather than left implicit.

**Verified:** a new regression test,
`packages/connector-sdk/tests/unit/razorpay-refund-service.test.ts` ("two concurrent requests
against the same daily cumulative cap cannot both succeed when only one should"), fires two
concurrent `requestRefund()` calls via `Promise.all` against a ledger seeded to 1,700,000 of a
2,000,000 cap, each individually requesting 200,000 (within the per-refund cap and, read
naively, within headroom) but 2,100,000 combined -- over the cap. Proven failing empirically, not
just reasoned about: `git stash`-ed the fix's own source changes (keeping the earlier
razorpay-refund closure's extraction intact) and ran the test against the resulting pre-fix code,
observing both concurrent requests approved and executed (`approvedCount` `2`, failing the `<= 1`
assertion) before restoring the fix. Re-ran the now-passing test five consecutive times with no
flake. Full repo `tsc -b`, `eslint . --ext .ts`, `tsc --noEmit`, and `vitest run` (764 passed, 40
pre-existing skips, no new skips) all clean, no regressions.

**Independently re-confirmed, Phase 3D (fresh re-verification, not a citation of this entry's
own history).** Every update above documents this codebase's own account of closing G-24 and
its TD-23 residuals across several sessions. The Phase 3D certification
(`docs/architecture/phase3d-independent-authorization-certification.md`) treated all of it as a
claim to re-verify, not inherit: it re-traced `SignalIntentBinder`, `CapabilityPolicyBinder`,
`RazorpaySignalStateVerifier`, `HubSpotSignalStateVerifier`, and `RazorpayDailyRefundLedger`
directly from current source (not from this document's narrative) and confirmed, as of commit
`cb467fc`, that all five are still unconditionally wired into production bootstrap (§4, §5 of
that document) and that no alternate execution path bypasses them (§5.2 — the two open
questions an evidence pass raised there, the exact Razorpay dispatch site and
`SdkConnectorExecutor`'s internals, were independently closed by direct reading, not left as
citations). This re-confirmation is current as of that commit, not merely a restatement of the
closures already documented above.

**G-1. Duplicate Business Transaction ID: real, deterministic data-loss race in
`MemoryBusinessTransactionRepository`. RESOLVED (Option A, as written in D-1 below,
implemented as written) in the audit-sink/G-1 hardening session that followed the G-13
session.** The original bug
(`packages/runtime/src/services/business-transaction-service.ts:36-49`): `accept()` does
`await this.repository.exists(id)` then, only if false, `await this.repository.create(...)`,
a classic check-then-act race, not atomic. Two concurrent `accept()` calls with the same
`businessTransactionId` and _different_ content both used to succeed, no
`DuplicateBusinessTransactionError` was ever thrown by either, and the second write silently
overwrote the first (100% reproducible via `Promise.all`, not probabilistic).

The fix, exactly as D-1's Option A specified:

- **`MemoryBusinessTransactionRepository.create()`** now does the `Map.has` check and the
  `Map.set` in the same synchronous tick, no `await` between them, so two concurrent calls
  cannot interleave (the same technique `MemoryNonceStore.checkAndRecord()` and
  `SupabaseNonceStore.checkAndRecord()` already use for G-13), and throws
  `DuplicateBusinessTransactionError` itself on a collision, rather than relying on the
  service layer's separate (and racy) `exists()` check. `business-transaction-service.ts`'s
  own `exists()`-then-`create()` sequence is untouched; it remains a cheap fast-path for the
  non-racing common case, but the storage layer is now the actual source of truth.
- **`BusinessTransactionRepository`'s `create()` contract** (`packages/shared/src/
repositories/business-transaction-repository.ts`) now documents the insert-if-absent
  requirement explicitly: every implementation must throw `DuplicateBusinessTransactionError`
  atomically for a duplicate, not overwrite it.
- **`SupabaseBusinessTransactionRepository.create()`** now maps a `23505` unique-violation
  (from the `business_transaction_id TEXT PRIMARY KEY` constraint that was already there,
  in `supabase/migrations/20260629013035_initial_schema.sql` since the original schema, no
  new migration needed) to `DuplicateBusinessTransactionError` via the same
  `isUniqueViolation` helper G-13 built (`packages/storage/src/errors/
PostgresErrorCodes.ts`), instead of rethrowing the raw Postgres error.
- **Architectural note, not anticipated by D-1's text**: `DuplicateBusinessTransactionError`
  previously lived in `@parmana/runtime`, which `@parmana/storage` cannot depend on without a
  circular reference (`packages/runtime/tsconfig.json` already references `../storage` for
  its own test fixtures). The class was moved to `@parmana/shared`
  (`packages/shared/src/errors/duplicate-business-transaction-error.ts`, alongside the
  existing sibling `BusinessTransactionNotFoundError`/`ConflictError`/`ParmanaError`
  hierarchy that `execution-service.ts` already used) so both repositories can throw the
  identical class. `packages/runtime/src/errors/DuplicateBusinessTransactionError.ts` now
  re-exports it, so every existing import path
  (`business-transaction-service.ts`, `error-handler.ts`, `execute-api.test.ts`) is
  unchanged and `instanceof` identity is preserved end to end, verified directly by
  `execute-api.test.ts`'s existing "returns 409 when the same businessTransactionId is
  submitted twice" test, which still passes unmodified.
- **API-layer HTTP mapping required no change.** `packages/api/src/middleware/
error-handler.ts`'s existing `instanceof DuplicateBusinessTransactionError` branch
  (409, no `code` field, matching `schemas/common/error.schema.json`'s documented contract)
  already matches the relocated class via the re-export, confirmed by the same
  `execute-api.test.ts` test above.

Verified: 8 unit tests with mocked/in-memory storage:
`packages/storage/tests/unit/memory-business-transaction-repository.test.ts` (including the
concurrency proof: two simultaneous `create()` calls with the same id and different content,
exactly one succeeds and the other rejects with `DuplicateBusinessTransactionError`, and the
stored record is exactly the winner's, never a merge or the loser's),
`packages/storage/tests/unit/supabase-business-transaction-repository.test.ts` (mocked
`23505` mapping, and fail-closed propagation of any other storage error), and
`packages/storage/tests/unit/business-transaction-repository-duplicate-consistency.test.ts`
(`describe.each` over both implementations, asserting the identical error class and message
for a duplicate), plus 2 Supabase-gated integration tests against a real project, routed
through `resolveSupabaseGate`:
`packages/storage/tests/integration/supabase-business-transaction-duplicate.integration.test.ts`
(sequential duplicate, and the same concurrent-race proof against real Postgres).

**G-2. No CI runs the main test suite. CLOSED in the 2026-07-17 session.** See "Gaps closed
in the 2026-07-17 audit closeout session" above. `.github/workflows/ci.yml` now runs
`npm ci`, `npm run build`, a terminology-regression guard, and `npm test` on every push and
pull request, Node 24, with explicit env vars and no dependency on any `.env` file.
Supabase-gated integration tests are not run in CI (no `SUPABASE_*` secrets are configured
there); they skip cleanly rather than failing, which is itself a decision worth revisiting
if fleet-wide Supabase coverage in CI is wanted later; not done this session.

**G-3. Live external credentials are used by default, unlabeled, on every local test run.
RESOLVED in this session (hardening pass following 2026-07-17 audit closeout).** All 10
Supabase-gated suites (9 in `packages/api`, 1 in `packages/storage`) now route through a
shared `resolveSupabaseGate(suiteLabel)` helper
(`packages/api/tests/helpers/supabase-availability.ts`,
`packages/storage/tests/helpers/supabase-availability.ts`, kept as two independent copies
by design; see that file's own comment). Behavior:

- No `SUPABASE_*` configured: unchanged, skips cleanly, exactly as before.
- `SUPABASE_*` configured but `ALLOW_LIVE_SUPABASE=1` is not set: **hard failure**, not a
  silent run and not a silent skip. The suite throws during test collection, naming the
  missing flag explicitly, so a contributor whose `.env` happens to carry live credentials
  can no longer write real rows to a real project without knowing it.
- `SUPABASE_*` configured and `ALLOW_LIVE_SUPABASE=1` set: runs exactly as it did before
  this change.

Verified directly: with this checkout's own live-credential `.env` present and
`ALLOW_LIVE_SUPABASE` unset, `receipt-negative.integration.test.ts` now fails in ~3s with
`"Receipt Negative Integration: SUPABASE_URL and a Supabase key are configured, but
ALLOW_LIVE_SUPABASE=1 is not set..."` instead of silently running. The guard itself (all
three branches) is covered by unit tests with no live network dependency:
`packages/api/tests/unit/supabase-availability.test.ts` and
`packages/storage/tests/unit/supabase-availability.test.ts` (4 and 3 tests respectively).

**Residual, not addressed by this fix:** once a contributor does opt in with
`ALLOW_LIVE_SUPABASE=1`, no test cleans up after itself:
`workflow-supabase.integration.test.ts` and its siblings still write real
`business_transactions` and `execution_trust_records` rows that are never deleted. That
cleanup gap is a smaller, separate concern from the "silent by default" problem this fix
closes, and was out of this session's scope.

**G-30. `github:pr-fetch`/`github:pr-merge` were wired into production
(`createConnectorRegistry.ts`, commit `38658c0`, 2026-08-19) without a matching entry in
`CANONICAL_CAPABILITY_POLICY_BINDINGS`. Found 2026-08-25, independent of a CLAIMS.md
audit-fix pass that was looking for something else entirely. RESOLVED same-day
(2026-08-25).** `CapabilityPolicyBinder.
findViolation(action, declared)` (`packages/policy/src/CapabilityPolicyBinding.ts`) returns
`undefined` — no violation, by design — for any `action` with no canonical entry in the map;
this is documented, intentional behavior for genuinely out-of-scope actions (test/tutorial
fixtures), but `github:pr-fetch`/`github:pr-merge` are not out of scope — they are real,
production-wired, tested capabilities (`docs/CLAIMS.md` §3.17), reachable through the same
`POST /execute` route as `hubspot:deal-update`. A caller invoking `github:pr-merge` today can
declare _any_ loadable policy reference — `CapabilityPolicyBinder` will not reject the
pairing — exactly the "real capability paired with an unrelated, unprotected policy" attack
shape `docs/CLAIMS.md` §2.22 describes as closed. `github-pr-approval/1.0.0` is the intended
policy (§3.17), but nothing structurally prevents a different, loadable policy from being
declared instead and evaluated in its place.

**Why this was missed twice.** `packages/policy/tests/unit/CapabilityPolicyBinder.test.ts`'s
own `"binds every capability the production connector registry actually registers"` test
does not actually read `createConnectorRegistry.ts`; it asserts a hardcoded
`Set(["hubspot:deal-fetch", "hubspot:deal-update"])`, so it passed both before and after
GitHub was wired in without ever checking the claim its own name makes. The original
`CLAIMS-MD-AUDIT.md` (audited against commit `822d65f`, 2026-08-24 — five days after GitHub
was wired in) and the `docs: fix CLAIMS.md stale references and broken citations` pass that
closed out its findings the same day both re-counted `createConnectorRegistry.ts`'s
connectors and both still reported two (`test-fixture`, `hubspot`), missing the `github`
registration entirely — confirmed independently by re-reading the file directly rather than
trusting either report (it registers three: `test-fixture`, `hubspot`, `github`).

**Severity: blocks-pilot.** This is the same shape of finding as G-24, not G-29: a live,
reproducible gap in the specific structural protection §2.22 claims covers "every capability
the production connector registry actually registers." It requires GitHub App credentials to
be configured to matter in practice (the connector fails closed to unregistered otherwise,
per §3.17), so it is not exploitable against an unconfigured deployment, but it is real for
any deployment that has configured GitHub.

**Fixed same-day: Option A, as originally scoped.** `github:pr-fetch`/`github:pr-merge` added
to `CANONICAL_CAPABILITY_POLICY_BINDINGS`, both pointing at `github-pr-approval/1.0.0` —
exactly the policy `packages/api/tests/integration/github-pr-merge.integration.test.ts`
already declares (line 115-117), so no behavior change for the passing case, only a new
rejection for a caller declaring anything else. `CapabilityPolicyBinder.test.ts`'s "binds
every capability the production connector registry actually registers" test now includes
both in its expected set. **Not fully closed, only reduced:** the coverage test's expected
set is still a hand-maintained literal, not a live read of `createConnectorRegistry.ts` — the
exact mechanism that let this gap stand undetected for six days is unchanged, only the
current snapshot is now correct. A fourth connector added without updating this test's
literal (and without updating `CANONICAL_CAPABILITY_POLICY_BINDINGS` to match) would recur
silently, precisely as this entry recurred once already. Deriving the expected set from
`createConnectorRegistry.ts` or an equivalent single source of truth, rather than a
hand-maintained list, remains open follow-on work — not done in this pass, since it would
require `packages/policy` to depend on `packages/api` (or a new shared capability-registry
package), a dependency-graph decision bigger than this fix's scope.

**Root-cause architecture decision, documented separately (2026-08-26):**
`G-30-RESOLUTION-ARCHITECTURE.md` and `G-30-ARCHITECTURE-OPTIONS.md` (repo root) lay out the
follow-on decision — accept the hand-maintained-list debt (Option A), make the coverage test
read live from `createConnectorRegistry.ts` (Option B, requires the `packages/policy` →
`packages/api` edge above), or extract a shared `@parmana/capability-registry` package
(Option C) — with corrected effort estimates and code samples (the options document flags and
fixes a fabricated `registry.getCapabilityBindings()` API in the prompt it was drafted from;
no such method exists on `ConnectorRegistry`). Recommendation there: Option A now, revisit B/C
later. Awaiting Pavan's decision; nothing beyond this entry's own fix has been implemented.

**Verified:** `packages/policy/tests/unit/CapabilityPolicyBinder.test.ts` (11/11, this file),
`packages/api/tests/integration/github-pr-merge.integration.test.ts` (4/4, confirms the
already-correct policy pairing still passes unchanged). Full repo `npm run build` (rebuilt
`@parmana/policy`'s stale `dist/`) and `npm test`: 1274 passed, 37 skipped, 0 failed —
identical counts to before this fix, since no new `it()` blocks were added, only an existing
assertion's expected set was extended.

**Option C implemented (2026-08-26), per Pavan's decision.**
`CANONICAL_CAPABILITY_POLICY_BINDINGS`/`CapabilityPolicyBinder` moved from
`packages/policy/src/CapabilityPolicyBinding.ts` into a new leaf package,
`packages/capability-registry/src/CapabilityPolicyBinding.ts`, depending only on
`@parmana/shared`. `packages/policy/src/index.ts` re-exports both symbols from the new package
unchanged, so all ~10 existing consumers that import via `@parmana/policy` needed zero changes
(confirmed by grep before and after). The regression test moved with it, to
`packages/capability-registry/tests/unit/CapabilityPolicyBinder.test.ts`.

**Deviation from the original Option C sketch, found and corrected before implementing, not
after:** `G-30-ARCHITECTURE-OPTIONS.md`'s Option C proposed the new package also importing
capability-identifier constants from `@parmana/connector-github`/`@parmana/connector-hubspot`
to remove identifier-string duplication. Checked first: `@parmana/connector-hubspot` already
depends on `@parmana/policy` directly, and `@parmana/connector-github` depends on
`@parmana/connector-sdk`, which also depends on `@parmana/policy` — either import direction
would have created a dependency cycle back through the exact package this extraction exists to
be depended on by. Not done. The four capability-identifier strings remain hand-typed in
`CapabilityPolicyBinding.ts`, exactly as before the move, still separately duplicated in
`GitHubCapabilities.ts`/`HubSpotCapabilities.ts`. **What this move actually closes:** the
`packages/policy` → `packages/api` backwards-dependency edge Option B would have required, and
gives a future consumer (`createConnectorRegistry.ts` itself, if ever restructured to read
canonical bindings) a leaf package to depend on instead of pulling in all of `@parmana/policy`.
**What it does not close:** the coverage test's expected set is still a hand-maintained
literal (see that test's own updated comment) — the exact failure mode that let G-30 itself go
undetected for six days is structurally unchanged, only relocated to a smaller, more clearly
purpose-scoped package.

**Verified (Option C):** `npm install` (linked the new workspace package), `npx tsc -b` (clean,
full workspace including the new project reference in root `tsconfig.json`), `npx eslint
packages/capability-registry packages/policy --ext .ts` (clean), full `npm test`: 1274 passed,
37 skipped, 0 failed — identical counts, since the moved test file's assertions are unchanged.

**G-47. `PolicyGovernanceExecutionVerifier` treats a signature-tamper signal
(`SIGNATURE_INVALID`) identically to an honest process gap (`NO_APPROVAL_RECORD` /
`CONTENT_MISMATCH`) — all three block execution the same way, with no graduated response.**
Found 2026-09-15, the same day as G-45/G-46, while discussing whether execution should stop
on a governance-anchor mismatch at all (`docs/investigations/2026-09-15-evidence-anchor-gap-audit.md`,
GAP-5 addendum). Not a defect in G-45's `PolicyGovernanceAnchorResolver`, which correctly
reports which of the three occurred — the enforcement path,
`PolicyGovernanceExecutionVerifier.verify()`
(`packages/api/src/governance/PolicyGovernanceExecutionVerifier.ts:31-63`), collapses the
distinction: `RuntimeEngine` treats any of the three as an ordinary policy REJECT, no
authorization ever generated (`packages/runtime/src/RuntimeEngine.ts:284-291`).

**Why blocks-pilot, not pre-production:** `POLICY_EXECUTION_VERIFICATION_ENFORCED` is off
today and cannot safely be turned on until the G-1 legacy-policy backfill completes — but the
moment it is turned on, this all-or-nothing behavior becomes live, production-affecting
policy for every execution in the system, decided implicitly by default rather than a
deliberate choice. A security team reviewing this before a pilot would reasonably ask: does a
missing approval record (an honest process gap, possibly mid-rollout) deserve the same hard
stop as a forged signature (active tampering)? Today the codebase has no answer other than
"yes, always," chosen by omission.

**Not fixed. Options, not a fix:**

1. Keep uniform blocking for all three (simplest, most conservative, matches this codebase's
   fail-closed discipline everywhere else — defensible, but should be a stated choice).
2. Graduate the response: hard-block on `SIGNATURE_INVALID` only, while
   `NO_APPROVAL_RECORD`/`CONTENT_MISMATCH` alert (structured log, metric, or a dedicated
   audit event) and continue — useful during a transition period where governance coverage
   is still incomplete, at the cost of a real window where ungoverned policy content
   executes.
3. Make the response configurable per severity, deferring the choice to whoever operates a
   given deployment instead of picking one default for everyone.

No fix attempted this session — this is a decision for whoever turns
`POLICY_EXECUTION_VERIFICATION_ENFORCED` on for the first time, not a code change to make
unilaterally. See `02-REMAINING.md` Tier 0.

**Update (2026-09-20): the severity choice is now made, and it is option 1.** Enforcement is on in
production and blocks uniformly for a missing approval record, an invalid approval signature, and content
that differs from the approved content (gap 58, `docs/CLAIMS.md` 2.36). The gateway applies the same
check at release. A graduated or configurable response (options 2 and 3) is not built.

**Status (2026-10-06): closed by decision.** Option 1 is in effect (uniform blocking); options 2 and 3 are not planned.

**G-48. `createExecutionGateway.ts` passed an unconditional `new FileKeyProvider()` as
`ExecutionGateway`'s `keyProvider`, regardless of `KEY_PROVIDER` — silently verifying every
authorization against a stale local key once `KEY_PROVIDER=aws-kms` was turned on, while
signing correctly used the real KMS key. RESOLVED 2026-09-16, the day after ADR-0009's KMS
migration went live.** Found via real production traffic (a live Pfinite refund attempt),
not a code review: `POST /execute` returned an opaque HTTP 500, and Vercel's runtime logs
showed `Execution Gateway rejected request: failed checks [signatureVerified,
businessTransactionHashMatches, nonceUnseen]`. Initially misdiagnosed the night before
(2026-09-15, ROADMAP.md's "Secrets, Signing-Key Custody" section) as three independent
verification failures needing investigation; they are not independent —
`businessTransactionHashMatches` and `nonceUnseen` both short-circuit to `false` inside
`ExecutionGateway.verify()` whenever `signatureVerified` is `false` (`passed`/
`priorChecksPassed` gating), so this was always one root cause wearing three symptoms.

**Root cause:** `EnvelopeVerifier.resolveKey()` (`packages/envelope-verifier/src/EnvelopeVerifier.ts`)
uses `keyProvider` — when supplied at all — to resolve the verification key for **every**
authorization, not only ones signed under a non-default (tenant-scoped) keyId.
`createExecutionGateway.ts` unconditionally constructed `new FileKeyProvider()` and passed
it as `keyProvider`, a leftover from before ADR-0009's KMS migration that the migration's
own seven-call-site audit (`docs/adr/ADR-0009-...md`) never covered, because
`ExecutionGateway`'s own key-lookup wiring for Gap 2A (tenant-key verification) was outside
that audit's scope. The night before (2026-09-15), this was found and explicitly assessed
as `KNOWN GAP... currently inert under KEY_PROVIDER=aws-kms, not actively broken` — that
assessment was wrong: it is exercised on every request, not only tenant-scoped ones.
Consequence in production: `RuntimeAuthorizationSigner` signed every authorization with the
real KMS key (`SignerBootstrap` → `KmsSigner`), but `ExecutionGateway`'s verification path
resolved the verification key via `FileKeyProvider.getPublicKey("default")`, reading
whatever stale `default.public.pem` happened to still be materialized on
`/tmp` from `PARMANA_KEY_MATERIAL_JSON`'s pre-KMS-migration entry (materialization itself
was fixed to still run under `aws-kms` by a same-night, earlier fix — see ROADMAP.md — but
that fix's own side effect was to keep this stale key present and readable, not to remove
it). Signing key and verifying key silently diverged: every real authorization failed
signature verification, permanently, with no error at startup (`assertKmsSigningKeyReachable()`
only checks that the KMS key itself is reachable, not that every `EnvelopeVerifier`
consumer is configured to use it).

**Fix:** new `SignerKeyProviderAdapter`
(`packages/crypto/src/providers/SignerKeyProviderAdapter.ts`) adapts a `Signer` to
`KeyProvider`'s read-only surface (`getPublicKey`/`getMetadata`/`hasKey`/`listKeys`
delegate; `getPrivateKey()` always throws — a `Signer` never releases private key material
by design, matching `KmsSigner`'s own "throw loudly rather than fail silently" precedent).
`createExecutionGateway.ts` now resolves one `Signer` via `SignerBootstrap.create()` and
shares it between `createGatewayPublicKey(signer)` and `new SignerKeyProviderAdapter(signer)`,
so the static publicKey and the per-authorization keyProvider path are guaranteed to agree
on the same backend — under `KEY_PROVIDER=local` this is `LocalFileSigner` (unchanged
behavior, byte-for-byte the same as before `Signer` existed); under `aws-kms` both now
correctly resolve through the real KMS key.

**Verified:** `packages/crypto/tests/unit/signer-key-provider-adapter.test.ts` (6 new
cases: delegation of each read method, `getPrivateKey()` throwing, `listKeys()` delegating
when supported and throwing when not). Full workspace `npx tsc -b` clean. Full repo suite:
1838 passed, 42 skipped, 0 failed. Verified live against production: a real Pfinite refund
request (`businessTransactionId: b8323ba6-72eb-4509-a724-e7e4ddd5adf3`) now passes every
Gateway check and reaches actual connector execution — confirmed independently by
`parmana-paytm-agent`'s own audit trail (the two repos share one `execution_audit_events`
table) recording `authorization.verified` for that same transaction, something no real
request had achieved since `KEY_PROVIDER=aws-kms` was first turned on. The request's
eventual failure past that point (`Paytm returned non-JSON response (HTTP 503)`) is
external to both repos — no real Paytm merchant credentials are configured yet — and is
not part of this gap.

**G-49. `express-rate-limit` v8's `ERR_ERL_STORE_REUSE` violated the library's documented
Store-sharing contract on every Vercel cold start whenever `DATABASE_URL` was configured.
RESOLVED 2026-09-16.** Found the same night as G-48, via the same live-production
debugging: Vercel runtime logs showed `ValidationError: A Store instance must not be shared
across multiple rate limiters` alongside a request that returned HTTP 500. Pre-existing
bug, unrelated to the KMS migration — surfaced only because Vercel's serverless cold-start
behavior exercises `createApp()`'s construction path far more frequently than the previous,
always-running deployment target did.

**Correction (verified directly against the installed library's own source,
`node_modules/express-rate-limit/dist/index.mjs`, `wrappedValidations`): this validation
does not throw.** Every validation in `express-rate-limit` v8 is wrapped in a try/catch that
catches `ValidationError` and only logs it (`logger.error`, default `console.error`) — it
never re-throws or crashes the process. The original write-up of this entry (and the
troubleshooting guide it was based on) stated this validation "crashed the process" /
"caused every request to 500," inferred from seeing the log line appear next to a real 500
— that causal claim was never actually verified and does not hold up against the library's
real behavior. The 500 observed that night was caused by a separate, genuinely fatal,
still-unfixed bug at the time (G-48's signing/verification key divergence) logged in the
same request. Corrected here, in `Tutorial 115` (`examples/tutorials/115-per-limiter-rate-limit-stores/`,
which reproduces the actual logged-not-thrown behavior directly against the real library),
and in `docs/operations/2026-09-15-kms-migration-troubleshooting-guide.md`.

**Still a real bug worth fixing, independent of the corrected causal claim above:** sharing
one `Store` instance across two limiters violates this library's own documented contract
regardless of whether the current installed version happens to only warn about it — a
future `express-rate-limit` version, or a deployment that sets a stricter `validate` config,
could make this fatal for real. It may also cause subtler, non-crashing correctness issues
in the library's internal per-store bookkeeping that were not investigated once the
crash-causation theory was corrected.

**Root cause:** `createRateLimitStore()` (`packages/api/src/bootstrap/createRateLimitStore.ts`)
returned one `PostgresRateLimitStore` instance, and both `api/index.ts` and `server.ts`
passed that same instance to both `createHealthReadyRateLimiter` and
`createExecuteRateLimiter` (`app.ts`). `express-rate-limit` v8 added a runtime check
refusing to let one `Store` instance back more than one limiter.

**Fix:** `RateLimitOption` (`packages/api/src/app.ts`) now takes two fields,
`executeStore`/`healthStore`, replacing the single `store` field. `createRateLimitStore(prefix)`
takes a required `prefix` argument and must be called once per limiter (`"execute:"` /
`"health:"`); `PostgresRateLimitStore` gained a `prefix` constructor parameter, exposed as a
**public** field named exactly `prefix` (not a private implementation detail) because
`express-rate-limit`'s own `Store` type declares an optional `prefix?: string` specifically
for its double-count/reuse-detection logic — matching that name and visibility is what lets
the library recognize two differently-prefixed stores as legitimately distinct, not a
naming coincidence. `PostgresPoolFactory.create()` underneath is already a process-wide
singleton, so calling `createRateLimitStore()` twice does not open a second database
connection.

**Verified:** `packages/storage/tests/unit/postgres-rate-limit-store.test.ts` (new, 4
cases: prefix prepended on `increment`/`get`/`decrement`/`resetKey`, defaults to no prefix
when omitted). `packages/api/tests/unit/bootstrap/create-rate-limit-store.test.ts` gained a
case asserting two different prefixes produce two distinct `Store` instances. Full repo
suite passing. Verified live against production: 5 consecutive `/health` requests plus
`/keys/default` and `/execute`, no `ERR_ERL_STORE_REUSE` recurrence in Vercel runtime logs.

**G-50. Policy approver authority is not scoped. Any provisioned human checker can approve any
policy.** Found 2026-09-20. `POST /policies/pending-changes/:id/approve`
(`packages/api/src/routes/pending-policy-changes.ts`) enforces a human credential
(`credentialHolderType === USER`, `isHumanCaller.ts`), that the checker is not the proposer, and a valid
single use step up signature. It does not ask whether this checker may approve this particular policy.
`PolicyChangeApprovalService` records `approvedBy` as the API `callerId`, not an `Authority`. Two human
keys with step up keys can therefore approve a change to the refund limit or a payment policy. There is
also no quorum, no separation by policy sensitivity, and no role check. `credentialHolderType` is
operator provisioned configuration, not proof that a business authority approved. This is the reason the
execution claim is stated as "matches what a human checker approved" and not "within business authority
bounds". **Not fixed. Option:** add a per policy `approverPrincipalIds` (or role) check on the approve
route, fail closed when unset, and record the resolved principal in `PolicyChangeApprovalRecord`.

**G-51. Only the HubSpot capability has an independent signal state verifier, so most policy signals are
caller declared.** Found 2026-09-20. `application.ts` wires a `CompositeSignalStateVerifier` containing
only `createHubSpotSignalStateVerifier`. `RuntimeEngine` reads `transaction.signals` straight from the
request. For `customer-refund` (Paytm), `refundAmount` is bound to `parameters.amount` by
`boundSignals` and the gateway content hash, so the amount limit holds. `refundEligible`,
`managerApproved` and `fraudCheckPassed` are listed under `unboundSignalReasons` and nothing checks them
against real state, so a caller can declare them true. The same applies to GitHub and Slack signals.
**Not fixed. Option:** add capability scoped `SignalStateVerifier` implementations, starting with a signed
approval artifact for `managerApproved` (the `SignedApprovalGuard` and `ApprovalIssuerRegistry` machinery
already exists in `packages/approval`). **Addendum (2026-09-27):** G-65 has a step by step plan for
`paytm:refund`. **Narrowed the same day:** for `paytm:refund`, `managerApproved: true` is now verified
against a signed approval (G-65, `approvalSignals` in the policy, `ApprovalSignalVerifier`). `refundEligible` and
`fraudCheckPassed`, and the GitHub and Slack signals, are still caller declared. **Update (2026-09-28):**
the narrowing is in effect in production since `customer-refund` 1.1.0 was approved there on 2026-09-27;
before that the defect was live in production (the Paytm connector is configured there).
**Update (2026-09-28, AI attack review):** narrowed again in the repository: merges (G-73) and LLM tool
calls (G-74) need a signed approval in new policy versions, pending approval in production. The rest of
this gap is tracked there and in G-75 and G-76.

**G-52. The connector can be called before the Execution Trust Record can be signed, so a signing
failure leaves an executed action with no signed trust record.** Found 2026-09-20 in the same live
run as gap 59. The Paytm connector service logged `POST /connector/paytm-refund` at 13:06:48, and
`/execute` then failed with `500` when the record signature could not be produced. The order in the
runtime pipeline is authorize, release through the gateway to the connector, then build, sign and
persist the record, because the record contains the result of the execution. Any failure after the
connector call (a signing outage, a database error, a size or key problem) can therefore leave an
executed action without a signed record. Gateway and connector service audit events
(`execution_audit_events`) are written separately and would still exist, but the durable, signed,
verifiable trust record would not. Gap 59 removes the most likely cause, it does not remove the
ordering. **Not fixed. Options:** (1) verify that the signing key is reachable and can sign a
representative message before releasing to the connector, failing closed if not, which shrinks the
window but cannot close it; (2) persist a signed "execution intent" record before release and
finalize it after, so an executed action always has a signed record even if finalization fails;
(3) both. Option 2 is the complete answer and is a design change to the pipeline.

**Update (2026-09-20): partially mitigated, gap 60, ADR-0011.** Before release the engine now proves
the evidence signing path works, and refuses with `503 SIGNING_UNAVAILABLE` if it does not, so a
persistent signing problem no longer executes an action first. A failure after release is now
`500 EXECUTION_RECORD_INCOMPLETE` with the identifiers and a critical log instead of a generic
`500`. Still open: a transient failure between the check and the real signing, or a database failure
after release, still leaves an executed action with no signed record. Option 2 above, a signed
execution intent persisted before release, is not built.

**Update (2026-09-21): CLOSED for the risk it named, gap 61, ADR-0012.** Option 2 is built. A signed
Execution Intent is stored before release, and release is refused with `503 EXECUTION_INTENT_UNAVAILABLE`
if it cannot be, so an executed action always has signed evidence behind it. The ordering itself is
unchanged on purpose: the connector is still called before the Trust Record is signed, because the
record contains the result. What changed is that signed evidence now exists before that point. Limits
are in G-53, G-54 and G-55.

**G-53. There is no way to rebuild a missing Execution Trust Record for an action that was
released.** Found 2026-09-20 while scoping the G-52 mitigation. When `EXECUTION_RECORD_INCOMPLETE`
is returned, the context needed to build the record (the decision, the authorization and the
execution result) exists only in memory of the failed request and in the connector's response. It is
not persisted before the record is built, so it cannot be finalized later. An operator can reconcile
against the connector and the `execution_audit_events` rows for the `businessTransactionId`, but the
signed record itself cannot be recreated automatically. **Not fixed. Options:** (1) persist the
released context before building the record and expose a finalize operation that rebuilds and signs
the record from it, which still depends on storage being available; (2) the signed execution intent
in G-52 option 2, which is the complete answer. Either is a design change with a schema and
migration story, and needs its own ADR. **Proposed, not decided: `docs/adr/ADR-0012-Signed-Execution-Intent-Before-Release.md`** recommends persisting a signed execution intent before release, with a finalize operation for an intent that was never finalized. It lists the decisions still needed.

**Update (2026-09-21): MITIGATED, with a stated limit, gap 61, ADR-0012.** A missing Trust Record is now
rebuilt with `POST /execution-intents/{businessTransactionId}/finalize`, from the execution context saved
on the intent right after release. It never calls the connector, it is idempotent, and it also verifies
the record and generates the receipt. **The limit:** the context is saved best effort. When that save also
fails, the intent stays `PREPARED`, finalize refuses with `409 EXECUTION_INTENT_RESULT_NOT_RECORDED`, and
the outcome has to be established from the connector and recorded by hand. This is the residual of G-53.
Verified live on 2026-09-21 with a real KMS key and a real Postgres, for the case where the context was
saved. The case where it was not saved is covered by unit tests only, not by live fault injection.

**G-54. There is no operation to close an Execution Intent that was reconciled by hand. CLOSED
2026-09-21, gap 62.** Found 2026-09-21 while documenting the operator procedure for ADR-0012. An
intent in state `PREPARED` or `ERRORED` means the action may or may not have run. An operator
reconciles it at the connector, but nothing marked it resolved and finalize refuses it (`409`, no
result was saved), so `GET /execution-intents/unfinalized` kept listing it and the list could never
become empty. **Closed** by `POST /execution-intents/{businessTransactionId}/resolve`: a verified human
records what they found (`NOT_EXECUTED` or `EXECUTED`) and a required note, and the intent moves to
`RESOLVED` and leaves the list. It never calls a connector, is idempotent, and refuses a `RELEASED`
intent (finalize is the right operation), a `FINALIZED` intent, and any transaction that already has a
signed Trust Record. **Limit, stated plainly:** the resolution is an attributed, timestamped operator
statement in the intent's **unsigned** status. It is not tamper evident and it is not a Trust Record,
so for an action that ran and has no Trust Record, the signed intent, the note and the connector's own
record are the evidence. A signed resolution record would be a further design step, and is not built.

**G-55. The SDKs cannot verify or manage Execution Intents. CLOSED 2026-09-21, gap 63;
PUBLISHED in 1.2.0.** Found 2026-09-21. The TypeScript and Python SDKs had no methods for the `/execution-intents`
routes. **Closed**: both SDKs have `executionIntent`, `verifyExecutionIntent`,
`unfinalizedExecutionIntents`, `finalizeExecutionIntent` and `resolveExecutionIntent` (in Python,
`execution_intent`, `verify_execution_intent`, `unfinalized_execution_intents`,
`finalize_execution_intent` and `resolve_execution_intent`), and Python has
`parmana.crypto.verify_execution_intent_offline`, which needs only the public key. **Limits, stated
plainly:** they are **not in 1.1.6 or earlier**. Both SDKs were published at 1.2.0 on 2026-09-21. The TypeScript SDK has no offline intent verifier,
as it has none for Trust Records either.

### pre-production

**G-4. Hybrid/post-quantum signing was dead configuration in production. PARTIALLY
CLOSED, for two of the several signing surfaces, by the Hybrid Signature Support
milestone (Phase A).** Originally: `CRYPTO_MODE`, `PRIMARY_SIGNATURE_PROVIDER`, and
`SECONDARY_SIGNATURE_PROVIDER` were all read into `config.crypto`
(`packages/shared/src/config/Config.ts`), and `crypto.mode` was parsed but never read
anywhere else in the codebase; every production signing call site hardcoded
`CryptoBootstrap.create()` (single-provider), never `createHybrid()`. A deployer who set
`CRYPTO_MODE=hybrid` expecting defense-in-depth PQ signing got silently ignored config;
the server signed Ed25519 only, regardless. That description is now accurate for most,
but no longer all, of this codebase's signing surfaces.

**What's actually wired now:** `packages/crypto/src/VerificationCrypto.ts` (Execution
Trust Records) and `ReceiptCrypto.ts` (Receipts) both read `crypto.mode` (via
`parseCryptoMode`, `packages/shared/src/config/ConfigValidation.ts` — the previously-unvalidated
raw cast is also fixed) and, when it is `"hybrid"`, additionally sign with
`HybridSignatureProvider` (`packages/crypto/src/HybridSignatureProvider.ts`) using both
`PRIMARY_SIGNATURE_PROVIDER` and `SECONDARY_SIGNATURE_PROVIDER`, via
`CryptoBootstrap.createHybrid()` — the same factory this entry originally found unused.
The result is additive, not a schema replacement: the existing single `signature` field
is signed exactly as before (so old records and `@parmana/sign`'s third-party verifier
stay compatible), and a new `signatures` array plus `schemaVersion` are populated only
when hybrid mode produced them. `VerificationCrypto.verify()`/`verifySignature()` require
every entry in `signatures` to independently verify when present — a missing or malformed
entry rejects the whole record, never a silent downgrade to the legacy field alone.
Verified: `packages/crypto/tests/unit/hybrid-signature-provider.test.ts`,
`packages/runtime/tests/unit/verification-service-hybrid.test.ts`,
`packages/runtime/tests/integration/receipt-hybrid.integration.test.ts`.

**What's still exactly as this entry originally found it:** `RuntimeAuthorizationSigner`
(execution authorization signing), gateway attestation signing
(`createGatewayKeyPair`/`GatewayAuthenticationSigner`), and every connector's own signing
path (`createConnectorRegistry.ts` and its call sites) all still call
`CryptoBootstrap.create()` only — single-provider, `PRIMARY_SIGNATURE_PROVIDER` alone,
completely unaffected by `CRYPTO_MODE`. This was a deliberate scope decision (see the
milestone's own "Explicitly out of scope" list: Refusal Records and audit-event signing
are an explicit fast-follow, not this pass), not an oversight, but it means `CRYPTO_MODE=hybrid`
still does **not** mean "everything this process signs is hybrid-signed" — only Trust
Records and Receipts are. A deployer reading `CRYPTO_MODE=hybrid` as covering the whole
process would still be wrong, just differently wrong than before.

**Now promoted to `docs/CLAIMS.md` (3.13), scoped to exactly what's built.** Hybrid
signing is real, tested, and wired for the two surfaces above; `CRYPTO_MODE=hybrid`
remains opt-in, not the production default (`parmana-api-live.fly.dev` still runs
`PRIMARY_SIGNATURE_PROVIDER=ed25519` alone — 3.13 states this explicitly), and
`@parmana/sign`'s public verifier does not yet recognize the `signatures` envelope shape
(3.13's own "Required caveat" paragraph). The claim is capability-only, not a deployment
claim: it does not say hybrid signing runs in staging or production anywhere, because it
doesn't yet.

**Update (2026-10-03):** `@parmana/sign` 0.2.0 recognizes the `signatures` envelope and
checks every entry, so the "Required caveat" in 3.13 no longer applies to that version and
later (see `docs/CLAIMS.md` 3.12 and 3.13 updates of the same date).

**Decision still required for the remaining surfaces, see below** (D-2's Option A/B choice
was written before this partial closure and should be re-read as applying only to the
signing paths listed as unwired above).

**G-5. `OverrideService` has zero test coverage and no HTTP route.**
`packages/runtime/src/services/override-service.ts` (business rules: transaction must
exist, trust record must exist, one override per transaction) is never imported by any test
anywhere in the repo, and `packages/api/src/app.ts` mounts no `/overrides` route at all. The
only proof that an override can land on a trust record and still verify
(`packages/api/tests/integration/workflow-supabase.integration.test.ts:122-200`) bypasses
`OverrideService` entirely, calling `storage.trustRecords.appendOverride()` directly on the
repository and manually pre-computing the hash/signature to match: a storage-layer proof,
not a proof that the actual application-layer service (with its business rules) works, or
is even reachable by anything. **Decision required, see below.**

**Update (2026-09-20): resolved by removal, on 2026-09-08.** `OverrideService` and `OverrideVerifier` (`packages/runtime/src/services/override-service.ts`, `packages/runtime/src/policy/OverrideVerifier.ts`) were deleted in commit `e6c73f0`, the dead code cleanup that also removed `packages/receipt`. Re-checked on this date: no file named in this entry exists, nothing imports an override service, and `packages/api/src/app.ts` mounts no `/overrides` route. This is D-3 option B, removal. This entry was not updated when the code was removed. What remains is the storage layer: the record model still has an `overrides` list, and the repositories still have `appendOverride`, which only the storage layer integration test named above uses. Nothing in a request path calls it. If an override capability is wanted later, it needs a new design (canonical serialization, a signed approver, a nonce and a TTL), and the standing warning in `02-REMAINING.md` not to wire the old one applies to any design that skips those.

**G-6. `packages/receipt` has zero test files. STALE CLASS NAMES CORRECTED (Phase 3D
follow-up, in response to an external audit report of `docs/CLAIMS.md` 2.5/2.6 that this
entry's own inaccuracy helped mislead — see G-26 for the full account).** `"test": "vitest
run --passWithNoTests"` still means this silently succeeds with nothing asserted — that
part of this entry remains true. But the class names this entry previously cited,
`ExecutionReceiptBuilder`, `ExecutionReceiptVerifier`, and the `ExecutionPermit` model in
`packages/execution-control`, **no longer exist anywhere in this repository** — confirmed
by repo-wide search, zero hits. They were confirmed to have zero live callers and zero test
coverage, and were deliberately deleted during the Hybrid Signature Support milestone
(Phase A); `examples/tutorials/54-execution-receipt/run.ts` and
`55-execution-receipt-verification/run.ts` each carry their own "historical note" explaining
the deletion and what each tutorial demonstrates instead today (the real, live
`ReceiptService`/`application.verify()` path, not the deleted cluster).

**What `packages/receipt` actually contains today:** `ReceiptEngine`
(`packages/receipt/src/ReceiptEngine.ts`) and `ReceiptBuilder`
(`ReceiptBuilder.ts`, a thin factory for it) — a _different, smaller_ pair of classes than
this entry originally named, not a renaming of them. `ReceiptEngine.generate()` hashes its
payload with `crypto.createHash("sha256").update(JSON.stringify(payload))` — a
stringified-JSON hash, not this codebase's `CanonicalSerializer` discipline every other
signed artifact uses (Trust Records, Receipts on the live path, Approval Artifacts,
execution authorizations) — and there is no verifier class in this package at all. Still
confirmed disconnected: zero references to `ReceiptEngine`/`@parmana/receipt` anywhere
outside `packages/receipt/src` itself, matching this entry's original "disconnected from
`packages/runtime` and `packages/api`" finding, still accurate. It remains real, shipped
code with a public export surface and zero automated proof of correctness — that
conclusion holds, just for the correct class names.

**Update (2026-09-08): deleted.** `packages/receipt` has been removed from this
repository entirely (`ReceiptEngine.ts`, `ReceiptBuilder.ts`, its own `package.json`,
and its project references from the root `tsconfig.json` and `packages/api/tsconfig.json`)
as part of a dead-code cleanup pass, re-confirming immediately before deletion that
nothing outside its own directory (and `package-lock.json`, which self-corrects on the
next `npm install`) referenced it. Real receipt generation was, and remains, entirely
unaffected — it is `@parmana/crypto`'s `ReceiptCrypto.createReceipt()`, wired into
`packages/runtime/src/services/receipt-service.ts`, a different class this entry never
described. This gap is now closed by removal rather than by adding tests to dead code.
Full repo `npx tsc -b` and `npx vitest run` clean after the deletion: 1,539 passed, 38
pre-existing skips, 0 failed (down from 1,551 — four now-meaningless test files for
other dead code removed in the same pass, see the runtime/storage/crypto/shared entries
in this same cleanup).

**Not to be confused with the real, live receipt mechanism**, which is fully implemented,
wired, and tested: `ReceiptService.generate()` (`packages/runtime/src/services/
receipt-service.ts`) — called directly by `ExecutionTrustApplication.execute()` on every
successful execution, after verification — loads the Trust Record, requires the latest
Verification to have actually succeeded (fail-closed otherwise, `ReceiptGenerationError`),
computes a hash and signature via `ReceiptCrypto` (`@parmana/crypto`, canonical
serialization, real Ed25519/hybrid signing), and persists the result via
`appendReceipt`. Tested by `packages/runtime/tests/integration/receipt.integration.test.ts`
and `receipt-hybrid.integration.test.ts`. This is what `docs/CLAIMS.md` 2.5's "Signed
Receipts"/`ReceiptCrypto` citation refers to.

**G-26. External audit of `docs/CLAIMS.md` 2.5/2.6 ("Execution Evidence / Receipt") reported
"Execution Evidence: Not yet implemented," citing a `TODO` stub. Independently investigated
and found to be a false positive caused by two genuine, since-fixed sources of confusion in
this repository itself, not by the underlying claim being false. RESOLVED.**

**What the audit found, verified accurate:** `ExecutionEvidenceComponent`
(`packages/runtime/src/components/ExecutionEvidenceComponent.ts`, as it existed before this
entry) contained exactly the `// TODO: Build ExecutionEvidence from enterprise execution
result.` stub the audit quoted, followed by `return context;` with no evidence built,
attached, signed, or verified. That description of that specific file was correct.

**What the audit got wrong, and why:** `ExecutionEvidenceComponent` was never wired into
the runtime pipeline at all — confirmed by repo-wide search: zero references anywhere
outside its own file, not even in `packages/runtime/src/components/index.ts`'s barrel
export. `RuntimeFactory.create()` (`packages/runtime/src/RuntimeFactory.ts`) only ever adds
`TrustChainValidationComponent` and `ExecutionComponent`
(`packages/runtime/src/components/ExecutionComponent.ts`) as pipeline stages. The real,
live execution-evidence path is `ExecutionComponent.execute()`, which builds the approved
request, forwards it to the `ExecutionSystem`, and then calls
`ExecutionEvidenceBuilder.build(response)` (`packages/runtime/src/
ExecutionEvidenceBuilder.ts`) — a complete, non-stub implementation that maps a real
`ExecutionResult` into a real `ExecutionEvidence` (`action`, `target`, `parameters`,
`success`, `executedAt`, `attributes`) — then persists it via
`ExecutionService.attachEvidence()` (`packages/runtime/src/services/
execution-service.ts:86-100`, a real `trustRecords.replaceExecution(...)` write, not a
no-op). This is the same evidence the Phase 3D certification independently confirmed is
embedded, hashed, and signed inside the Execution Trust Record
(`docs/architecture/phase3d-independent-authorization-certification.md` §8), and is
exercised by `razorpay-live.integration.test.ts`, `hubspot-live.integration.test.ts`, and
`hubspot-deal-update.integration.test.ts`. A separate, similarly-named class,
`ReceiptComponent`, has the identical "correctly implemented but not actually wired as a
pipeline stage" shape (live receipt generation happens via
`ExecutionTrustApplication.execute()`'s own direct `this.receipts.generate(...)` call, not
via this component) — not a stub like `ExecutionEvidenceComponent` was, so it did not
itself mislead this particular audit, but the same class of confusion.

Separately, the same audit's receipt-package findings ("no `ExecutionReceiptBuilder`
implementation, no `ReceiptEngine` implementation, no verifier implementation, no tests")
were traced to this document's own **G-6** entry, whose cited class names had gone stale
after those exact classes were deleted in an earlier session (see G-6's corrected text,
above) — an external reader citing this document in good faith would reach the same
mistaken conclusion the audit did.

**Fix, three parts:**

1. `ExecutionEvidenceComponent.ts` — confirmed dead, not exported from the package's public
   surface, zero references anywhere — **deleted outright**, removing the exact stub an
   auditor or a future contributor could otherwise find and mistake for the live path.
2. `ReceiptComponent.ts` — kept (it remains part of `@parmana/runtime`'s public export
   surface, `packages/runtime/src/index.ts`, so removing it is a larger compatibility
   decision than this fix's scope), but given an explicit doc comment stating it is not
   currently wired as a pipeline stage and naming the actual live invocation path.
3. G-6 (above) corrected to name this package's actual current classes
   (`ReceiptEngine`/`ReceiptBuilder`) instead of the deleted ones, and to explicitly
   distinguish it from the real, tested, live receipt mechanism.

**Verified:** `npx tsc -b` clean after the deletion (confirming no hidden caller existed);
full regression suite re-run, unchanged pass/fail/skip counts aside from the removed file
itself.

**G-27. `payments:execute` (vendor-payment) was a gap-in-waiting against the public
positioning claim "only what you authorize should become real" — real, committed code that
would have violated that claim had it ever been made a production capability as it then
existed. RESOLVED by outright removal (below), and the positioning claim itself
subsequently upgraded to YES by an independent fourth validation pass — see this entry's
own "Positioning-claim status" paragraph, below, for the full account. Originally
documented here per the Strategic Positioning source-code validation audit (2026-08-09,
read-only by its own rules, so this entry was originally that audit's required
documentation follow-up, not a restatement of new findings).**

**Not a live defect.** `createVendorPaymentConnector.ts:30-32` gates registration to
`process.env.NODE_ENV === "test"` only; `createConnectorRegistry.ts` skips registering it
otherwise. This is a real, structural exclusion (independently confirmed by reading the
gating condition directly, both in the Phase 3D certification and again in the Strategic
Positioning audit) — `payments:execute` cannot currently be reached through any production
`POST /execute` or `POST /transactions` request. The reason this still belongs in this
document: the mechanism excluding it is an environment variable, not a proof that its
authorization-relevant facts are true — a different, weaker kind of guarantee than every
other in-scope capability has.

**What exists, and why it's blocked, in full**: already investigated exhaustively in this
document's own "Investigation (2026-08-04): `vendor-payment` remains genuinely blocked, not
merely unattempted" entry (above, this same G-24 block) — re-read directly, not
transcribed, for this entry. Summary: `policies/vendor-payment/2.0.0/policy.json`'s
`signalsSchema` has five signals (`vendorVerified`, `invoiceVerified`, `paymentApproved`,
`sufficientFunds`, `riskScore`); only two (`paymentAmount`, `vendorId`) are bound to Intent
via `boundSignals`. The other five remain pure caller-declared attestations, with **no
independent verifier anywhere in this codebase** — confirmed again, fresh, by the Strategic
Positioning audit's own grep sweep. The plausible real-world sources for these facts
(`SapConnector`, `WorkdayConnector`, `OracleConnector`) are each a bare, write-only
`MockConnector` with no fetch capability to verify against; `riskScore` has no candidate
connector at all.

**What would need to be true before this capability could be enabled without contradicting
the positioning claim**: the same closure work Razorpay (TD-23, Phase 3B) and HubSpot
(TD-23, Phase 3C) already received — a `SignalStateVerifier` implementation that
independently re-derives each of the five facts from a real external system and rejects on
any disagreement with the caller's declared value, wired unconditionally into production
the way `RazorpaySignalStateVerifier`/`HubSpotSignalStateVerifier` are. This is **not**
attempted here — it requires building genuine external integrations (a KYB/vendor-
verification service, an AP/invoice-matching system, an approval-workflow system, a
treasury/balance API, a risk-scoring service) that do not exist in this repository in any
form today, a real feature-scoping decision for a future phase, not a documentation task.
**No code was changed for vendor-payment by this entry or the audit that prompted it.**

**Cross-reference audit, confirmed clean:** checked `docs/CLAIMS.md` for any claim that
`payments:execute`/vendor-payment would contradict. None found — 2.23's own text already
scopes the "CLAIM FULLY CERTIFIED" result to `razorpay:refund-create`/`hubspot:deal-update`
explicitly and names vendor-payment as out of scope "for that reason, not because it was
overlooked"; 3.3's scope clause already disclaims "any enterprise-specific connector"; no
claim anywhere states or implies repository-wide signal-verification coverage. No narrowing
edit to `CLAIMS.md` was needed as a result of this entry.

**RESOLVED by removal, not by independent verification.** Decision: `payments:execute`/
vendor-payment was never on the roadmap as a real capability, so building the independent
`SignalStateVerifier` work described above (a real feature-scoping project) was rejected in
favor of removing the capability outright — the gap can't exist if the capability doesn't.
Removed: `packages/connector-sdk/src/connectors/vendor-payment/` (the `VendorPaymentConnector`
class and its metadata — confirmed orphaned, zero live callers, predating even this fix),
`packages/api/src/bootstrap/createVendorPaymentConnector.ts` (the `NODE_ENV === "test"`-gated
factory this entry's own opening paragraph cited), `packages/api/src/bootstrap/
createCredentialProvider.ts` (its dedicated, single-purpose credential provider — confirmed
to have had exactly one caller, the registration block below), the vendor-payment
registration block inside `createConnectorRegistry.ts`, and the now-meaningless
`"vendor-payment"` entry from `createConnectorAuthenticator.ts`'s trusted Gateway-attestation
identity list. `payments:execute` now has no connector to resolve to **in any environment**,
not only outside `NODE_ENV=test` — confirmed by a new regression test asserting exactly
this (`create-connector-registry.test.ts`, "payments:execute has no connector to resolve to
in any environment").

**Deliberately not removed**: `policies/vendor-payment/2.0.0/policy.json` and the shared
test fixtures (`packages/api/tests/fixtures/{business-transaction,policies}.ts`) that use it
as their generic default example — investigation found these are load-bearing shared
infrastructure for 19+ unrelated test files (caller-auth, credential-isolation, receipts,
replay, trust records, verification, and others that have nothing to do with vendor-payment
as a business capability), not vendor-payment-specific testing. The policy file's continued
existence carries no execution risk with zero connector able to back it — a caller
presenting `intent.action: "payments:execute"` still cannot cause any real-world effect,
regardless of policy outcome, because `ConnectorSdkRegistry.resolveCapability` fails closed
with "No connector registered for capability" before any connector dispatch is possible.
Migrating the shared fixtures away from the vendor-payment name entirely was considered and
explicitly declined as disproportionate to the actual risk (none) for this pass — flagged
here, not silently decided.

**Positioning-claim status, confirmed by the fourth validation pass.** "Only authorized
actions become execution" no longer has a capability-shaped exception. This entry
documented the removal but deliberately did not itself re-certify the positioning claim —
that re-certification has since happened: a fourth, independent Strategic Positioning
validation pass, run fresh with no reliance on this entry's own conclusions, re-traced the
production connector registry from source, re-confirmed `payments:execute` has no connector
to resolve to in any environment, independently scrutinized the replacement test-only
connector for new bypass risk (found none), and upgraded the executive verdict from
PARTIALLY SUPPORTED to **SUPPORTED BY IMPLEMENTATION — YES**. Full record, including the
precise honesty constraint on what was and wasn't re-verified in that pass (2 of 10 negative
tests re-run fresh; multi-tenant isolation and the direct-database-write bypass finding left
as "unchanged, not re-traced"): `docs/architecture/strategic-positioning-validation.md` §6
("Final Answer") and "Verdict History"; also cited in `docs/CLAIMS.md` §2.25.

**Verified**: `npx tsc -b --force` clean; full regression suite re-run (see this session's
own record for exact pass/skip counts, unchanged aside from the tests removed/updated for
this capability specifically).

**Update (code-only ground-truth capture pass, follow-up closure): one more miss from this
entry's own removal list, found and fixed.** `packages/policy/src/CapabilityPolicyBinding.ts`'s
`CANONICAL_CAPABILITY_POLICY_BINDINGS` still carried a `"payments:execute" →
{name: "vendor-payment", version: "2.0.0", ...}` entry — not in this entry's "Removed:" list
above, and confirmed genuinely orphaned relative to the current connector registry
(`createConnectorRegistry.ts` registers exactly `test-fixture`, `razorpay`, `hubspot`; no
`payments:execute`-capable connector exists in any environment, as this entry itself already
established). Inert, not dangerous — `CapabilityPolicyBinder.findViolation()` can only ever
reject a request for a bound action, and `payments:execute` has no connector to reach
`RuntimeEngine` for in the first place — but stale relative to `CANONICAL_CAPABILITY_POLICY_BINDINGS`'s
own doc comment, which claims the table covers "every capability actually registered in
production bootstrap." Removed the entry; `packages/policy/tests/unit/CapabilityPolicyBinder.test.ts`'s
`"binds every production-registered capability..."` test (which had been asserting the stale
set, including `payments:execute`, as expected output — itself a second symptom of the same
miss) updated to match the corrected table. Full regression suite re-run clean, unchanged
pass/skip counts aside from this one test's edited assertion. No other reference to this
binder entry found in `CLAIMS.md` or elsewhere in this file that depended on `payments:execute`
being present in the table.

**G-28. `PARMANA_AUTH_DISABLED=true`'s exact scope, precisely documented (previously
undocumented in either `CLAIMS.md` or this file, despite `CLAIMS.md` 2.16/2.17 already
citing the flag by name).** Flagged by the Strategic Positioning source-code validation
audit (2026-08-09) as a real, disclosed bypass path that needed its precise scope stated
somewhere, rather than left implicit — "don't let this get flattened into either
overstating or understating the risk" was that audit's own framing, and it is the right bar
to document against.

**What the flag does, confirmed directly:** `createCallerAuthenticator.ts:31-39`
(`packages/api/src/bootstrap/`) returns `{ disabled: true }` when `config.auth.disabled` is
set, after printing a loud, unmissable startup warning ("WARNING: PARMANA_AUTH_DISABLED=true.
The API is accepting requests with no caller authentication. This must never be set in a
real deployment."). Default behavior remains fail-closed: with no keys configured and this
flag unset, the process refuses to start at all (same file, lines 41-48) — the flag is the
only way around that refusal, and it is opt-in, never a silent fallback.

**What the flag does NOT do, confirmed directly:** `RuntimeEngine`, `PolicyEngine`,
`CapabilityPolicyBinder`, `SignalIntentBinder`, and every `SignalStateVerifier` operate on
the constructed `BusinessTransaction` object only — none of them ever reads the Express
`Request` object, `req.callerId`, or anything caller-auth-middleware-derived (confirmed by
direct grep of `RuntimeEngine.ts`/`PolicyEngine.ts`/`SignalIntentBinder.ts`/
`CapabilityPolicyBinding.ts` for any reference to caller identity: zero hits). The
caller-auth middleware and the action-level authorization pipeline are two structurally
separate mechanisms with no dependency between them. Setting `PARMANA_AUTH_DISABLED=true`
therefore removes **caller identity and accountability** (who submitted this request,
whether they're allowed to assert the `authority.principalId` they declared, per
`isPrincipalAllowed.ts`) — it does **not** remove **action-level authorization**
(`CapabilityPolicyBinder`, `SignalIntentBinder`, `PolicyEngine.evaluate`,
`SignalStateVerifier`, `ExecutionGate.enforce`), which remain fully active and would still
reject an unauthorized `razorpay:refund-create`/`hubspot:deal-update` request exactly as
they do with caller-auth enabled.

**Precise statement for any future doc referencing this flag:** "`PARMANA_AUTH_DISABLED`
disables caller identity/accountability only; it does not disable action-level
authorization." Neither "auth can be fully disabled" nor silent omission of the flag
correctly describes current behavior — both were considered and rejected for this entry.

**G-7. `execution-failure.integration.test.ts` is permanently `describe.skip`ped**, not
env-gated. `RuntimeFactory` always constructs its own `DefaultExecutionSystem` internally,
with no dependency-injection seam for a test to supply a failing `ExecutionSystem`. The
claim it would prove (that an execution-system failure is surfaced as
`execution.status === "FAILED"` with a 500, not silently swallowed) remains unverified.
Unlike every other gap in this document, closing this one requires a `RuntimeFactory`
constructor signature change, which is out of scope for a test-only pass.

**Update (2026-10-06): CLOSED in Phase 2D.** `RuntimeFactory.create()` takes an `ExecutionSystem`, so the test injects a failing one; `packages/api/tests/integration/execution-failure.integration.test.ts` runs, with assertions matching the API's real responses (since G-63, `502 EXECUTION_OUTCOME_UNKNOWN`). This entry was not updated at the time.

**G-8. Several error branches remain untested, all reachable only via direct library use,
not via any HTTP path this server currently exposes:**

- `ExecutionGateway.ts:246-249`: the "executionControl is incomplete" guard. Only reachable
  by direct library misuse; production's bootstrap always supplies a complete options object.
- `SignedTokenConnectorAuthenticator`'s two distinct identity-mismatch branches
  (`gatewayId` mismatch at line 65-67, `publicIdentity` mismatch, separately from the
  signature-verification branch that every existing test actually exercises first);
  every existing test uses one consistent identity, so these specific branches, distinct
  from "signature doesn't verify," are unexercised.
- `SdkConnectorExecutor.ts:47-60`: `expectedVersion` mismatch and `health.status ===
"unavailable"` rejections. Neither is used by `packages/api`'s bootstrap today
  (`createConnectorRegistry.ts` never passes `expectedVersion`), so also unreachable from
  HTTP currently, only from direct library use.
- `SdkConnectorExecutor.ts:62-67`'s own capability check is structurally dead in every
  configuration this repo wires up: `DefaultConnectorPolicy.assertAllowed()` runs the
  identical check earlier in the same call chain and always wins first.

**Update (2026-10-06):** the `SdkConnectorExecutor` branches named above are now tested directly: version mismatch, an unavailable connector, an undeclared capability and a raw credential (`packages/execution-gateway/tests/unit/sdk-connector-executor.exact.test.ts`, from mutation testing, `docs/MUTATION-TESTING.md`).

**G-9. `ExecutionControlService` and `SessionCredentialSecureConnector` each independently
audit-log the same execution** (confirmed directly this pass while writing the new
credential-isolation test; see "Gaps closed" #1 above). Not a security defect: both
records are consistent, and only the connector-level one carries `credentialId`. It is a
duplicate-logging quirk worth a one-line fix (skip the outer log, or document why both
exist) but was out of scope for this pass since it isn't test-only.

**Status (2026-10-06): open, `cosmetic`.** Both records are still written. The connector-level one is the only one carrying `credentialId`, so removing the outer one would lose nothing, and removing the inner one would; no change made.

**G-32. Signing key for Execution Authorizations was shared across every tenant in a
single deployment process — no per-tenant isolation of the signing key itself, even
though per-key _verification_ (resolving a public key by the authorization's own `keyId`,
with expiry/revocation) was already wired into production. Found 2026-09-09 during an
architecture audit comparing Parmana's authorization-proof model against a reference
"boundary-scoped proof generation" checklist. RESOLVED same-day.** `RuntimeAuthorizationSigner`
(`packages/runtime/src/RuntimeAuthorizationSigner.ts`) previously hardcoded every signature to
`DEFAULT_KEY_ID` ("default") regardless of the transaction's `metadata.tenantId` — every
tenant's Execution Authorization was signed with the same private key, in the same process.
This was only half the picture: `ExecutionGateway`/`EnvelopeVerifier`
(`packages/execution-gateway/src/ExecutionGateway.ts`, wired via `createExecutionGateway.ts`'s
own "Gap 2A" comment) already resolve the public key to verify an authorization against by that
authorization's own `keyId` field, through the same `FileKeyProvider` (which already supports
arbitrary keyIds) and a `FileKeyExpiryStore` for revocation — but nothing ever produced an
authorization carrying any `keyId` other than `"default"`, so that verification-side machinery
had no per-tenant keys to actually exercise.

**Fix:** new `TenantKeyResolver` interface and `FileTenantKeyResolver` implementation
(`packages/runtime/src/TenantKeyResolver.ts`). Given a `tenantId`, it looks for a dedicated key
named `tenant.<tenantId>` via the existing `KeyProvider.hasKey()` — no new key storage, the same
`FileKeyProvider` / `keys/<keyId>.private.pem` layout, provisioned exactly like any other key via
`scripts/generate-keypair.ts --key-id tenant.<tenantId>` — falling back to `DEFAULT_KEY_ID` when
no tenantId is present, no dedicated key has been provisioned yet, or the tenantId doesn't form a
valid keyId (`FileKeyProvider`'s `^[A-Za-z0-9._-]+$` check, G-20, throws rather than returning
false for a malformed one; caught here and treated as "no dedicated key"). `RuntimeAuthorizationSigner.sign()`
now resolves the keyId this way instead of a hardcoded static constant, and `RuntimeEngine.execute()`
(`packages/runtime/src/RuntimeEngine.ts`) passes `transaction.metadata?.tenantId` through to it.

**Verified:** `packages/runtime/tests/unit/tenant-key-resolver.test.ts` (new, 5 tests, stub
`KeyProvider`): resolves the default key when no tenantId is supplied; resolves the tenant
keyId when a dedicated key is provisioned; falls back to default when it is not; falls back
to default on an invalid keyId instead of throwing; two tenants with distinct provisioned
keys never resolve to the same keyId. `packages/runtime/tests/unit/execution-authorization-wiring.test.ts`
(2 new tests, real Ed25519 keypairs written into the hermetic per-file `PARMANA_KEY_DIR`): a
transaction with `metadata.tenantId: "acme-corp"` and a provisioned `tenant.acme-corp` key
produces an authorization whose `keyId` is `"tenant.acme-corp"`, verifies successfully under
that tenant's own public key, and — the isolation property itself — fails signature
verification under the shared default deployment's public key; a transaction with no
`tenantId` still signs under `"default"`, unchanged. Full `packages/runtime`, `packages/crypto`,
`packages/execution-gateway` suites: 265 passed, 0 failed (no regressions).

**Not addressed by this fix, left open:** (1) per-tenant keys must still be provisioned
manually, one `generate-keypair` invocation per tenant — there is no automated onboarding,
rotation, or KMS/HSM-backed provider; `FileKeyProvider`'s own doc comment already flags it as
intended for development/self-hosted use, with production expected to swap in a KMS/HSM
implementation of the same `KeyProvider` interface. (2) `PolicyEngine` itself
(`packages/policy/src/PolicyEngine.ts`) remains one shared, stateless, in-process instance
across every tenant in a deployment — unchanged by this fix, and not a gap in the same sense,
since it holds no key material or secrets to isolate; it is a pure rule-evaluation function
over caller-supplied `Policy`/`PolicySignals` values. (3) A tenant whose dedicated key is never
provisioned degrades silently to the shared default key rather than failing closed — deliberate,
so adoption can be incremental per tenant, but it means a misspelled or unprovisioned `tenantId`
produces a valid, unlabeled authorization under the default key with no warning.

**G-33. `boundSignals` coverage on rule-referenced facts was advisory (a `console.warn` at
`PolicyRouter.load()` nobody reviewing a running system would see), not enforced — a fact
with no genuine Intent-side equivalent (the common, legitimate case: independently-attested
booleans/scores like `vendorVerified`, `riskScore`) and a fact that was simply forgotten
were indistinguishable, both silent. Found 2026-09-09 during a production-readiness audit
that ran the real `vendor-payment` policy through `RuntimeEngine` and surfaced the warning
live (Tutorial 105). Checking all 10 real policies in `policies/` at that point showed every
single one had uncovered facts — none had ever been reviewed or documented. RESOLVED
same-day.** `Policy.unboundSignalReasons` (`packages/policy/src/types/Policy.ts`) is a new
optional per-policy field naming, with a reason, every rule-referenced fact deliberately left
out of `boundSignals` — the same "reviewed exemption, not a silent gap" idea as
`@parmana/capability-registry`'s `INTENTIONALLY_UNBOUND_CAPABILITIES` (G-30 above), but
scoped per-policy rather than centralized, since a fact only ever means something in the
context of the one policy that references it.

`PolicyValidator.validate()` now fails closed: any rule-referenced fact neither in
`boundSignals` nor `unboundSignalReasons` throws `PolicyValidationError` naming it, instead
of the old advisory warning. `unboundSignalReasons` is structurally validated the same way
`boundSignals` already was (must be an object, non-empty string keys, non-empty string
reasons), plus a new contradiction check: a fact present in both `boundSignals` and
`unboundSignalReasons` is rejected outright ("a bound fact needs no reason for being
unbound"). `findUncoveredFacts()` now excludes acknowledged facts from its result, so both
existing callers benefit without their own code changing: `PolicyRouter.load()` (removed its
now-redundant `console.warn` block entirely — `validate()` above it already throws for
anything that would have triggered it) and `packages/api/src/routes/pending-policy-changes.ts`'s
`coverageWarnings` (kept, now genuinely empty for any newly-created proposal since `validate()`
already rejects it first, but still meaningful for proposals created before this fix shipped).

**Two real, additional bindings found and fixed in the same pass, not just documented away:**
`connector-capability/1.0.0` and `customer-refund/1.0.0` each had an amount fact
(`paymentAmount`, `refundAmount`) with a genuine Intent-side equivalent
(`parameters.amount`, exactly `vendor-payment`'s own existing pattern) that had simply never
been bound — a real, live scope-drift gap for those two reference policies, not merely an
advisory-vs-enforced framing issue. Both now have a real `boundSignals` entry; `connector-capability`'s
`capability` fact remains acknowledged via `unboundSignalReasons`, not bound, because
`SignalIntentBinder`'s `IntentSnapshot` (`packages/policy/src/SignalIntentBinder.ts`) only
exposes `{ target, parameters }`, never `action` — there is no dot-path for a capability/action
selector to bind to today.

**Every one of the 10 real policies in `policies/` was updated** with either a new
`boundSignals` entry (the two above) or specific, per-fact `unboundSignalReasons` explaining
why that fact has no Intent-side equivalent (independently-attested booleans, computed risk
scores, or — for `hubspot-deal-update`'s four unbound facts — decision facts derived from
already-bound raw facts, not raw Intent fields themselves). None were generic copy-paste:
each reason names the actual mechanism (identity provider attestation, fraud/risk assessment,
maintenance-window clock check, GitHub's own review/status-check state, etc.) that produces
that specific fact.

**Verified:** `packages/policy/tests/unit/PolicyValidator.test.ts` (7 new cases: acknowledged
fact excluded from `findUncoveredFacts`, `validate()` passes when acknowledged, fails closed
naming the fact when neither bound nor acknowledged, passes when bound instead, rejects a
non-object `unboundSignalReasons`, rejects an empty reason string, rejects a
bound-and-acknowledged contradiction). `packages/policy/tests/unit/PolicyRouter-boundSignals-coverage.test.ts`
rewritten from a warn-spy test to a throw/no-throw test (3 cases: loads cleanly when bound,
loads cleanly when acknowledged, fails closed naming the policy and fact when neither).
Every real policy in `policies/` independently confirmed to pass `PolicyValidator.validate()`
directly (all 10, script-verified). Tutorial 105 re-run: the `policy_boundSignals_coverage_incomplete`
warning that originally surfaced this gap no longer appears; `vendor-payment` loads and
executes unchanged. Full repo suite: 1560 passed, 38 skipped, 0 failed — no regressions from
touching all 10 production policy files and the fail-closed validator change.

**Not addressed by this fix, left open:** an `unboundSignalReasons` entry is a documented
claim, not a proof — nothing verifies that a fact really has no Intent-side equivalent beyond
a human (or an AI acting as one) asserting it in the reason text, the same trust model
`INTENTIONALLY_UNBOUND_CAPABILITIES` already has for capabilities. A future new policy with a
genuinely-bindable fact left unbound would now be caught immediately at load/proposal time
(fail-closed, not silent) — but a reviewer must still judge whether the _reason given_ for an
acknowledged fact is actually true.

**Correction, found the same day:** "all 10 real policies were updated" above was scoped to
`policies/` only — it missed two example policies under `examples/` that this fix's own
fail-closed `validate()` also applies to, which broke `npm run examples`. See G-37.

**G-34. `SupabaseClientFactory` (the supabase-js/PostgREST client class) had zero remaining
production call sites, and its stale doc-comment references across 8 other files still
described it as the current path. Found 2026-09-09 during the same production-readiness
audit that produced G-33, cross-checked against Finding 4 of that audit
(`docs/audit/PRODUCTION-READINESS-AUDIT-2026-09-09.md`): 8 of 9 `Supabase*` storage classes
had already migrated to `PostgresPoolFactory` (direct Postgres, bypassing PostgREST), leaving
`SupabaseClientFactory.create()` referenced only in comments describing the _old_ path.
RESOLVED same-day.** Grep-confirmed (the same discipline as the 2026-09-08 dead-code cleanup,
commit `e6c73f0`) before deleting: zero call sites of `SupabaseClientFactory.create()` outside
its own file, no dedicated test file, `SupabaseClient` type unused elsewhere. Deleted, along
with its export from `packages/storage/src/index.ts` and its now-unused `@supabase/supabase-js`
dependency from `packages/storage/package.json` (`npm install` resynced the lockfile).

**A second, related dead file found in the same pass:** `assertSupabaseConfigured.ts`
(`packages/api/src/bootstrap/`) — its own doc comment claimed it was "shared by every
bootstrap factory that requires a durable, Supabase-backed store (createNonceStore.ts,
createCallerAuditSink.ts)," but both of those factories had already moved to
`assertDatabaseUrlConfigured.ts` instead (part of the same PostgREST-removal migration).
Grep-confirmed zero call sites and no test file; deleted.

**Eight stale doc-comment references to `SupabaseClientFactory`** across
`createCallerAuditSink.ts`, `createNonceStore.ts`, `PostgresPoolFactory.ts`,
`StorageFactory.ts`, `SupabaseStorageProvider.ts`, and three integration test files were
rewritten to describe the actual current mechanism (a supabase-js/PostgREST client, generically
— since the class naming it no longer exists) rather than naming a deleted class.
`createCallerAuditSink.ts`'s comment specifically also dropped a stale "TEMPORARY... revert
once SU-437429 is resolved" framing that `docs/CLAIMS.md` §3.11's own update (same date) found
to be inaccurate — see that update for why this is no longer a single revertible workaround.

**Third, unrelated finding from the same audit, also closed here:** `packages/audit.txt`, a
committed, tracked UTF-16 binary dump (a garbled Windows `tree`-style folder listing) — the
same shape of debris `docs/VERIFICATION-GAPS.md`'s own 2026-07-17 audit closeout removed
once already (`trace.txt`, `claim.md`), just not caught by that pass. `git rm`'d.

**Fourth item from the same audit's dead-code section, resolved by investigation rather than
deletion:** `@parmana/replay` (`ReplayEngine.ts`/`ReplayBuilder.ts`/`ReplayExecutor.ts`) was
flagged as needing a follow-up check for a live call site outside its own package. Confirmed:
none exists in any production package (`api`, `runtime`, `execution-gateway`, etc.) — its only
consumer outside its own package is `examples/tutorials/06-replay/run.ts`. Not deleted: this
is the same shape of intentional, tested, documented extension point the 2026-09-08 cleanup
(`e6c73f0`) explicitly excluded `ReceiptComponent.ts` for — 5 test files in
`packages/replay/tests`, a dedicated tutorial demonstrating it, not wired into the default
pipeline by design rather than by oversight.

**Verified:** full workspace `npx tsc -b` clean (confirms zero remaining references anywhere
a type-checker would catch them). Full repo suite: 1559 passed, 38 skipped, 0 failed — the
one-test difference from G-33's own count is environment/collection variance (re-run
confirmed 0 failures both times), not a regression; neither deleted file had a test to lose.

**G-35. `dilithium3` (the internal signature-algorithm identifier) had no way for a new
deployment to configure post-quantum signing using its accurate NIST/FIPS 204 name
("ml-dsa-65") — only the historical internal name was ever an accepted config value. Found
2026-09-09 as the Cryptographic Naming item in the same production-readiness audit as G-33/
G-34. RESOLVED same-day, as an alias rather than a rename.** The audit's own first-pass
conclusion (`docs/audit/PRODUCTION-READINESS-AUDIT-2026-09-09.md`) was that renaming
`dilithium3` itself would be a regression: it would break `PRIMARY_SIGNATURE_PROVIDER=dilithium3`
for every existing deployment, for zero externally-visible benefit, since `docs/CLAIMS.md` and
`docs/site/cryptography/overview.mdx` already disclose the naming history to readers. Asked to
fix the finding anyway, the corrected, non-breaking version is an **alias**, not a rename:
`parseSignatureAlgorithm` (`packages/shared/src/config/ConfigValidation.ts`) now resolves
`"ml-dsa-65"` to the canonical `SignatureAlgorithms.DILITHIUM3` ("dilithium3") value before
validation, so `PRIMARY_SIGNATURE_PROVIDER`/`SECONDARY_SIGNATURE_PROVIDER=ml-dsa-65` and
`=dilithium3` are now fully equivalent — an existing `dilithium3`-configured deployment is
completely unaffected, since the canonical identifier itself was never touched. Both
`generate-keypair.ts` CLIs (`scripts/generate-keypair.ts --algorithm`,
`packages/crypto/scripts/generate-keypair.ts --algorithm`) accept the same alias, normalizing
to `dilithium3` before generating a key, for the identical reason and by the same mechanism.

**Verified:** `packages/shared/tests/unit/config-validation.test.ts` (4 new cases: defaults to
`ed25519` when unset, accepts the canonical `dilithium3` unchanged, accepts `ml-dsa-65` resolving
to `dilithium3`, throws naming the value for an unrecognized algorithm). Both CLI scripts
smoke-tested directly with `--algorithm ml-dsa-65` against a scratch key directory: both
generate a real ML-DSA-65 keypair and log it under the canonical `dilithium3` name. Full
workspace `npx tsc -b` clean; full repo suite: 1563 passed, 38 skipped, 0 failed.

**Not addressed by this fix, and not needed:** the internal identifier `dilithium3` is
unchanged everywhere downstream (`SignatureRegistry`, `Ed25519SignatureProvider`'s sibling
`Dilithium3SignatureProvider`, key-file naming, log output) — this was a config-input
alias only, exactly the scope the audit's own non-breaking-improvement framing called for.

**G-36. `@supabase/supabase-js` follow-on dependency-hygiene pass (flagged, not required, by
the same 2026-09-09 audit that produced G-33/G-34/G-35) removed the dependency from 5
package.json files that had no real usage (`api`, `crypto`, `policy`, `runtime`, `shared`) --
but the pass's own verification method (grep across `packages/*/src` and `packages/*/tests`
only) missed two real, legitimate usages outside that scope. RESOLVED same-day, by the same
session that introduced the regression, before either was committed.** Full workspace `npx
tsc -b` and the full `vitest run` suite both stayed green throughout, because neither covers
a standalone script invoked only via its own `npm run <script>` entry
(`tsx path/to/script.ts`) with no dedicated test file — exactly the blind spot this entry
documents. `packages/storage/scripts/migrate.ts` (the `npm run migrate` script,
`createClient(url, key)` for `client.rpc("exec_sql", ...)`) and `scripts/verify-policy-changes-approved.ts`
(a fail-closed CI/deploy gate, `createClient` again) both import `@supabase/supabase-js`
directly. The first broke because `packages/storage/package.json`'s `@supabase/supabase-js` line was
already removed in G-34 (deleting `SupabaseClientFactory` there looked, at the time, like it
made the dependency fully unused in that package -- `migrate.ts` lives in `packages/storage/scripts/`,
outside the `src`/`tests` grep G-34's own verification covered, so it was missed). The second
broke because it was never declared anywhere at all -- a phantom dependency that only ever
worked because some workspace package's declaration hoisted a copy into the shared root
`node_modules`, with nothing in `scripts/verify-policy-changes-approved.ts`'s own package.json
(there is none; it is a root-level script) recording that it needed one.

**Caught by:** running the full test suite one more time after `npm install` resynced the
lockfile -- `scripts/tests/verify-policy-changes-approved.test.ts` failed immediately with
`Cannot find package '@supabase/supabase-js'`, not a subtler runtime error. `migrate.ts` has
no test at all; caught only by directly invoking it (`npx tsx packages/storage/scripts/migrate.ts`)
to confirm the import itself resolves.

**A genuine, disclosed side effect of that direct invocation:** this repository's own `.env`
carries live Supabase credentials (see this document's own "Environment note," above), and
`migrate.ts` reads them unconditionally with no dry-run flag. Running it attempted a real
`client.rpc("exec_sql", ...)` call against a live project. It failed immediately with
`PGRST202` ("Could not find the function public.exec_sql(sql) in the schema cache") --
that live project has no `exec_sql` Postgres function defined, so no SQL from any of the 8
found migration files ever executed and nothing was changed. Disclosed here for the same
reason `INC-1`/`INC-2`-style entries exist in this document's history: a script that touches
live infrastructure was run without first checking what it would do, and the honest
resolution is "here is exactly what happened and why it was safe," not silence.

**Fix:** `@supabase/supabase-js` restored to `packages/storage/package.json` (`dependencies`,
matching its pre-existing category) and newly added to the root `package.json`
(`devDependencies`, matching `dotenv`'s own category there for the same class of
root-level tooling script) -- not re-added to any of the 5 packages actually confirmed unused.

**Verified:** `npm install` (net delta: -4 packages across the 6 package.json files touched by
this whole pass, not -6, since 2 were restored). Full workspace `npx tsc -b` clean; full repo
suite: 1564 passed, 38 skipped, 0 failed, `verify-policy-changes-approved.test.ts` included and
passing. `migrate.ts` re-invoked once more (see disclosure above) to confirm the import
resolves; not re-run beyond that.

**Lesson for the next such pass, not yet built:** "grep `packages/*/src` and
`packages/*/tests`" is not "grep the repo" -- `scripts/`, `packages/*/scripts/`, and any other
standalone-tool location need the same check, and neither `tsc -b` nor `vitest run` cover a
script with no dedicated test that isn't part of any package's compiled `tsconfig` sources.

**G-37. G-33's fail-closed `boundSignals` change (`PolicyValidator.validate()` now throws for
an uncovered, unacknowledged fact) broke `npm run examples` at Tutorial 14 -- a second,
distinct instance of the exact blind spot G-36 just documented: `npm test` does not run
`npm run examples`, so a real, user-facing entry point went unverified by the full-suite runs
that accompanied G-33's own commit. RESOLVED same-day, before either regression was
committed.** `examples/tutorials/14-custom-policy/policies/high-value-payment/1.0.0/policy.json`
(a standalone example policy, not one of the 10 real ones under `policies/`, that G-33's own
audit never enumerated) referenced 7 facts with neither a `boundSignals` nor an
`unboundSignalReasons` entry. `examples/shared/policies/default-policy.json` (the minimal
demo policy shared across many tutorials) had the same shape of gap for its one fact,
`approved` -- not yet hit by `npm run examples` at the time this was found, but latent and
certain to surface. Both fixed the same way as G-33's own fix: `high-value-payment` gained a
real `boundSignals` entry for its genuinely bindable `paymentAmount` fact (mirroring
`vendor-payment`'s own pattern) and `unboundSignalReasons` for the rest;
`default-policy.json` gained a single `unboundSignalReasons` entry for `approved`, explicitly
noting it is deliberately the simplest possible demo signal, not meant to demonstrate
`boundSignals` coverage.

**A separate, smaller gap found and fixed in the same pass, unrelated to G-33:**
`scripts/run-examples.ts`'s hardcoded list never included `examples/tutorials/105-tenant-key-isolation/run.ts`
(added the same day this Tutorial itself was, in the same broader audit session) -- the
tutorial existed and worked standalone, but `npm run examples` silently never exercised it.
Added to the list, immediately after Tutorial 104.

**Verified:** full repo-wide search for every `policy.json` (and any other `.json` file
containing a `"rules"` array) under `examples/` confirmed only these two needed a fix — the
others either reference no facts at all (`always`-only conditions, or route to an
already-covered policy) or are exercised only via direct `PolicyEngine.evaluate()` calls that
never pass through `PolicyRouter.load()`/`validate()` at all
(`examples/tutorials/02-policy-evaluation/policy.json`), and `examples/audit/AS-001-approved-vendor-payment/policy.json`
is not executed by `npm run examples` or any test at all (no `run.ts` references it). `npm
run examples` re-run twice after the fix: 98/98 tutorials completed, exit code 0, zero
`PolicyValidationError`s or any other error, both times. (One earlier re-run hit an unrelated,
non-reproducible `Cannot find module '@parmana/policy'` transient failure at Tutorial 03,
isolated and confirmed to be Windows filesystem-race flakiness from spawning 90+ sequential
`tsx` child processes, not a real regression — the same tutorial ran cleanly standalone and on
every other full run.) Full `vitest run` suite re-confirmed unaffected: 1564 passed, 38
skipped, 0 failed.

**G-38. `PolicyOutcome`/`PolicyAction` carried a third value, `REQUIRE_OVERRIDE`, that no real
policy in this repository ever used, and that `DecisionBuilder.toDecisionOutcome()`
(`packages/runtime/src/DecisionBuilder.ts`) collapsed straight to `DecisionOutcome.REJECTED`
in any case — functionally indistinguishable from an ordinary `REJECT` at the point execution
is actually gated. Found 2026-09-09 in a policy approval/rejection audit. RESOLVED same-day,
after an explicit trade-off decision — see the correction below.** Removed from both enums
(`packages/policy/src/types/PolicyAction.ts`, `packages/policy/src/types/PolicyOutcome.ts`)
and their one real switch-statement branch each (`PolicyEngine.ts`'s `toOutcome()`,
`DecisionBuilder.ts`'s `toDecisionOutcome()`); both already had an unconditional `default:
REJECT`/`REJECTED` branch, so removing the explicit case is a no-op for behavior.

**Correction, found during this same investigation, before deleting anything:** the initial
characterization of `REQUIRE_OVERRIDE` as simple forgotten dead code was itself incomplete.
Two real tests — `packages/connector-sdk/tests/unit/reference-policy.test.ts` and
`packages/connector-hubspot/tests/unit/hubspot-deal-update-policy.test.ts` — explicitly
asserted "never produces a `require_override` outcome," and the former's own comment read
_"Phase 1's PolicyAction enum (locked) has no approval-workflow outcome, and this policy does
not use require_override"_ — language that reads as a deliberately reserved extension point
for a future per-transaction approval-workflow feature, not an oversight, with these two tests
existing specifically to catch a policy author using it before that mechanism is built. Three
other docs (`POLICY-DATASTRUCTURE.md`, `PARMANA-EXP-ACTUAL-EXECUTION-FLOW.md`,
`docs/site/reference/policy.mdx`) all listed it as ordinary current state, none flagging it as
deprecated. This was surfaced and the trade-off made explicit before proceeding: keep it
(document the reservation) vs. delete it (lose the reserved extension point and force
reinventing it later if that feature is ever built) — **delete was the explicit choice made**,
accepting that trade-off. The two guard tests' `require_override`-specific assertions were
removed (rather than reworked to reference a value that no longer type-checks); their
surrounding test files' leading comments were updated to match. If a real per-transaction
approval-workflow state is ever built, it starts from zero design memory of this decision —
that is the concrete cost of the choice made here, not a residual bug.

**Verified:** repo-wide grep for `REQUIRE_OVERRIDE`/`require_override` confirmed exactly 3 real
code sites (the two enums, the two switch statements) before deleting, plus the two guard
tests and 6 documentation files (2 historical audit-log snapshots left untouched, matching
this document's own "don't silently rewrite history" discipline; 4 current-state docs updated:
`docs/site/reference/policy.mdx`, `POLICY-DATASTRUCTURE.md`,
`PARMANA-EXP-ACTUAL-EXECUTION-FLOW.md`, `docs/CONNECTOR-BUILD-GUIDE.md`). Full workspace `npx
tsc -b` clean. Full repo suite: 1562 passed (2 fewer than before, exactly the two removed
guard-test assertions — not a coverage loss, since the invariant they checked is now enforced
by the type system itself for any code respecting `PolicyAction`'s type), 0 failed.

**G-39. No detection existed for two policy rules whose conditions could both be true for the
same input — first-match-wins means the earlier one always decides silently, with nothing
surfacing that the later rule is partly or wholly unreachable. Found 2026-09-09 in the same
audit as G-38. RESOLVED same-day.** New `PolicyValidator.findRuleConflicts(policy)`
(`packages/policy/src/PolicyValidator.ts`), returning a `RuleConflictWarning[]` — deliberately
**advisory, never wired into `validate()`'s fail-closed throw** (see the method's own doc
comment): unlike a missing `boundSignals` entry, which has one unambiguous fix, a flagged
overlap is a heuristic judgment that might be a real bug or might be an intentional priority
ordering, and this method does not claim to be bug-free for every condition shape it's asked
to compare. Wired as advisory `console.warn`s from `PolicyRouter.load()` (event
`policy_rule_conflict_detected`) and surfaced alongside the existing `coverageWarnings` in
`packages/api/src/routes/pending-policy-changes.ts`'s proposal-creation and listing endpoints,
as a new `ruleConflicts` field.

**A materially different, corrected implementation, not the naive version originally
proposed:** an initial design (checking only exact-equal-threshold pairs like `lte 20` vs
`gt 20`, and treating any `always: true` condition as unconditionally overlapping with
everything else) had two real bugs, caught before shipping by running it against every real
policy in this repo:

1. **It would have flagged the ordinary trailing `always: true` catch-all as "conflicting"
   with every other rule in every single policy** — that pattern exists in all 10 real
   policies by design (the idiomatic fail-closed default), so this would have produced 100%
   false-positive noise, defeating the feature. Fixed: an `always: true` condition is only
   ever flagged if it is NOT the last rule (which does mean something real — every rule after
   it is unreachable); the expected trailing catch-all is never compared against anything.
2. **It got asymmetric numeric thresholds wrong** — `lte 10` vs `gt 20` (genuinely disjoint:
   nothing is both ≤10 and >20) would have been incorrectly flagged as `DEFINITE_OVERLAP` by a
   heuristic that only checked whether two range operators' values were exactly equal. Fixed
   with real ray-interval overlap math (`raysOverlap`): two same-direction rays (`lt`/`lte` vs
   `lt`/`lte`, or `gt`/`gte` vs `gt`/`gte`) always overlap; opposite-direction rays overlap
   only when the upper bound exceeds the lower bound (or is equal with both sides inclusive).
3. **A third gap, found (not in the original proposal) while verifying against real
   policies:** every real policy's `approve` rule is a nested `all` conjunction, while its
   `reject-*` rules are simple single-fact leaves — the naive design would return
   `NEEDS_REVIEW` for literally every approve/reject pair in every real policy (not a false
   positive, but still 100% noise). Fixed with a sound generalization: a nested `all` is
   provably `NO_OVERLAP` with a leaf (or with another `all`) if any one of its conjuncts is
   itself provably disjoint from the other side — one false conjunct makes the whole
   conjunction false regardless of the rest, so this never claims `DEFINITE_OVERLAP` for a
   composite condition (only `NO_OVERLAP`, proven, or `NEEDS_REVIEW`, honestly undetermined).

**Verified against every real and example policy in the repository** (a scratch script, not
committed): **zero `WARNING`-level results** across all 10 policies in `policies/` and every
policy under `examples/`. Exactly one `INFO`-level "needs review" result remains
(`hubspot-deal-update`, between `reject-stage-transition-not-allowed` and
`reject-amount-exceeds-threshold-without-preauth`) — confirmed to be a genuine, deliberate
first-match-wins priority ordering between two independent violation reasons that really can
co-occur, not a bug. `packages/policy/tests/unit/PolicyValidator.test.ts` (11 new cases:
single-rule no-op, trailing catch-all not flagged, non-trailing `always` flagged as `WARNING`,
different facts not flagged, exact-threshold disjoint ranges not flagged, asymmetric-threshold
disjoint ranges not flagged, same-direction overlapping ranges flagged `WARNING`, nested `all`
vs leaf resolved via a disjoint conjunct, nested `all` vs `all` resolved via a cross-pair
disjoint conjunct, independent facts correctly reported `INFO` rather than guessed, and
confirmed `validate()` never throws on a detected conflict). Full workspace `npx tsc -b`
clean. Full repo suite: 1573 passed, 38 skipped, 0 failed. `npm run examples`: 98/98, exit 0.

**Not addressed by this fix, left open:** this is not a general rule-subsumption or
boolean-satisfiability solver — it reasons soundly about single-fact leaves, `always`
placement, and `all` conjunctions where at least one conjunct is comparable, and honestly
reports `NEEDS_REVIEW` for everything else (any `any` condition, an `all` vs `all` pair with
no disjoint conjunct across them, or an operator pairing it doesn't model — `between`, `in`,
`not_in`, `contains*`, `matches`, `exists`, `is_null`, `length_*`, `type_is`). A genuinely
overlapping pair using only those operators would go unflagged, not misreported — but also not
caught.

**G-42. `ExecutionAuditSink` was in-memory only (`MemoryExecutionAuditSink`) in production,
not only in tests — the same class of gap G-13 closed for `NonceStore`/`CallerAuditSink`,
left open for the Execution Gateway's own `session.created`/`execution.completed`/
`execution.rejected` events. Found by an independent audit (`GAPS.md`, GAP-1, 2026-09-14).
RESOLVED same session.** New `SupabaseExecutionAuditSink`
(`packages/storage/src/supabase/SupabaseExecutionAuditSink.ts`), same discipline as
`SupabaseCallerAuditSink` (§2.16, `docs/CLAIMS.md`): signed at write time (`AuditEventCrypto`),
chained per `authorizationId` via a Postgres advisory-transaction lock, written through
`PostgresPoolFactory` (not supabase-js/PostgREST). Wired via
`packages/api/src/bootstrap/createExecutionAuditSink.ts`, mirroring
`createCallerAuditSink.ts`'s own production/test split exactly:
`NODE_ENV=test` still gets `MemoryExecutionAuditSink`; every other environment fails closed
at startup if `DATABASE_URL` is unset. New migration
`supabase/migrations/20260914120000_add_execution_audit_events.sql` (table, indexes on
`occurred_at`/`authorization_id`/`connector_id`, RLS enabled with zero policies — readable
only by the app's own privileged connection, same posture as `caller_audit_events`).

Also adds a capability `CallerAuditSink` never had: `query(filter)`
(`ExecutionAuditQueryFilter` — by `authorizationId`, `businessTransactionId`, `connectorId`,
`type`, or date range), because this gap's own motivating question — "can a regulator ask
'show me everything that happened for this authorization/refund'" — needs a read path, not
only a durable write path. `CallerAuditSink`'s own durability fix (G-13) never added one; this
one does, from the start.

Verified: `packages/storage/tests/unit/supabase-execution-audit-sink.test.ts` (12 cases —
mapping every field including `null`-ing absent optionals, chaining and independent-chain
isolation, tamper detection via `AuditEventCrypto.verify()` on a hand-modified field,
`query()`'s five filter dimensions); `packages/api/tests/unit/bootstrap/
create-execution-audit-sink.test.ts` (4 cases, the same fail-closed assertions
`create-caller-audit-sink.test.ts` already makes for its own sink); `packages/api/tests/
integration/supabase-execution-audit-sink.integration.test.ts` (live-DB, `ALLOW_LIVE_SUPABASE=1`
gated, proving a fresh pool/process reads back what a different instance wrote, and that
`query({ authorizationId })` retrieves one authorization's complete, correctly-ordered chain —
the literal "Execute -> Query audit -> Retrieve complete chain" the originating audit asked
for). Full monorepo suite from repository root: 592 passed, 42 gated skips, 0 failed.

**G-43. `parmana-paytm-agent` (a separate repository this codebase forwards Paytm refund
requests to, `PAYTM_CONNECTOR_URL`) recorded nothing at all for either a successful or
rejected refund on its side of the trust boundary — not even a console log — despite
already correctly verifying the Ed25519 authorization signature (ADR-0009 Phase 2B,
`docs/CLAIMS.md` §3.22) before ever calling Paytm. A rejection there (invalid signature,
expired authorization, tampered amount, Paytm decline) left literally no trace anywhere.
Found by the same independent audit as G-42 (`GAPS.md`, GAP-3). RESOLVED same session,
directly in that repository, with the user's explicit authorization — `docs/CLAIMS.md`
§3.22 previously, and accurately at the time, described that repository as out of this
codebase's scope to build or verify; see that section's own 2026-09-14 correction.**

New `src/parmana/audit.ts` in `parmana-paytm-agent` — that repository's first-ever runtime
dependency (`pg`), since it was previously, deliberately, dependency-free. Records
`authorization.verified` immediately after `verifyPaytmAuthorizationSignature` succeeds
(never on failure — a rejected signature is recorded as `execution.rejected` with the
verification error as `reason`, and `authorization.verified` is skipped, so the two event
types alone tell you which branch a rejection took), then `execution.completed` or
`execution.rejected` after the Paytm call resolves. Two rows, not one, so a crash between
verification and execution — the exact failure mode an audit trail exists to catch — remains
visible instead of silently unrecorded by a single combined write.

Writes into the _same_ `execution_audit_events` table G-42 introduced, not a second table:
a new migration (`supabase/migrations/20260914130000_add_business_transaction_correlation_to_
execution_audit_events.sql`) added a nullable `business_transaction_id` column — the
correlation key this repository's own `ExecutionControlService` now also stamps on every
event it writes — because `authorizationId`, this table's original chaining key, is Parmana's
own internal authorization identity and is never forwarded across the wire to
`parmana-paytm-agent` (see `GatewayPaytmAdapter`'s wire contract, `docs/CLAIMS.md` §3.22):
that service only ever sees `businessTransactionId`, `orderId`, `txnId`, and its own re-signed
authorization envelope. `query({ businessTransactionId })` retrieves one refund's complete
story across both services; `query({ authorizationId })` retrieves only this repository's own
signed, chained half. A second new migration
(`20260914140000_add_authorization_verified_to_execution_audit_events.sql`) widened the
table's `type` CHECK constraint to allow `authorization.verified`, the one event type only
`parmana-paytm-agent` ever writes.

Deliberately unsigned and unchained: `parmana-paytm-agent`'s rows carry `NULL`
`signature_json`/`chain_hash`/`chain_position` (both columns relaxed to nullable in the same
migration that added `business_transaction_id`) — that service holds Parmana's public key
only, to verify, never a private key to sign with, and has no Ed25519 keypair of its own.
Judged an acceptable, deliberate trust-boundary asymmetry rather than a residual gap: a
compromised instance of that service could already forge real Paytm calls using the
merchant credentials it legitimately holds, so cryptographic non-repudiation of its own log
entries would not raise the actual trust bar — durability and cross-service correlation are
what this fix adds, not proof of authorship.

Verified: `parmana-paytm-agent`'s own `tests/unit/execute-authorized-connector-request.test.ts`,
3 new cases — the success path (`authorization.verified` then `execution.completed`, in
order, with `businessTransactionId`/`action` on the recorded event), the signature-verification-
failure path (only `execution.rejected` fires, with the verification error as `reason`;
`authorization.verified` never fires), and the Paytm-decline path (`authorization.verified`
then `execution.rejected`, with Paytm's `resultStatus`/`resultCode` folded into `reason`). The
audit writer is dependency-injected into `executeAuthorizedConnectorRequest` (a third,
optional parameter defaulting to the real writer, mirroring how the Paytm connector itself was
already injected) specifically so these unit tests never open a real Postgres connection.
Full suite there: 40 passed, 0 failed, after adding `DATABASE_URL` to the test file's
existing `REQUIRED_ENV` fixture (loadConfig() now fails closed on it at module load, matching
every other required setting that file already sets before importing the module under test).

**G-13. `MemoryNonceStore` and `InMemoryCallerAuditSink` both lose all state on process
restart. RESOLVED in the durable-replay-protection hardening session that followed the
2026-07-17 audit closeout and its own G-3 fix.** Both now have durable, Supabase-backed
replacements, wired in as the production default:

- `packages/storage/src/supabase/SupabaseNonceStore.ts`: implements `NonceStore`
  (`@parmana/envelope-verifier`) with the exact same interface and call-site semantics as
  `MemoryNonceStore`: a nonce is still consumed as the last step of verification, strictly
  before execution (`packages/execution-gateway/src/ExecutionGateway.ts`, unchanged by this
  session; only the storage backing changed). Backed by a new `consumed_nonces` table
  (`supabase/migrations/20260718090000_add_nonce_and_caller_audit_tables.sql`) whose
  `PRIMARY KEY` on `nonce` is the entire atomicity mechanism: two concurrent `INSERT`s of
  the same nonce race at the database, not in application code; exactly one succeeds, the
  other fails with a `23505` unique_violation, mapped to "already consumed" by a new
  `isUniqueViolation` helper (`packages/storage/src/errors/PostgresErrorCodes.ts`; no such
  Postgres-error-code mapping existed anywhere in this codebase before this session; see
  D-1 below, which needs the same kind of mapping for G-1, still open and unrelated).
- `packages/api/src/auth/SupabaseCallerAuditSink.ts`: implements `CallerAuditSink`
  unchanged, backed by a new `caller_audit_events` table in the same migration.

Production wiring (`packages/api/src/bootstrap/createNonceStore.ts`,
`createCallerAuditSink.ts`) fails closed: test wiring (`NODE_ENV=test`) still gets
`MemoryNonceStore`/`InMemoryCallerAuditSink`, mirroring the production/test split
`createCredentialProvider.ts` already established for the vendor-payment connector
credential, but outside test wiring, an unconfigured Supabase backing throws a named,
actionable error at startup (`assertSupabaseConfigured`) rather than silently falling back
to an in-memory store. `SupabaseNonceStore.checkAndRecord` also fails closed on any error
other than a unique-violation: the error propagates rather than being swallowed, so a
request whose nonce check hit an unreachable database is rejected, never silently treated
as accepted.

Verified: 22 unit tests against mocked storage (atomic-consumption mapping, the fail-closed
storage-error path, and the fail-closed production-wiring checks):
`packages/storage/tests/unit/supabase-nonce-store.test.ts`,
`packages/storage/tests/unit/postgres-error-codes.test.ts`,
`packages/api/tests/unit/supabase-caller-audit-sink.test.ts`,
`packages/api/tests/unit/bootstrap/create-nonce-store.test.ts`,
`packages/api/tests/unit/bootstrap/create-caller-audit-sink.test.ts`, plus 5 Supabase-gated
integration tests against a real project, routed through the same `resolveSupabaseGate` the
G-3 fix established (skip cleanly with no credentials, hard-fail without
`ALLOW_LIVE_SUPABASE=1`): `packages/storage/tests/integration/
supabase-nonce-store.integration.test.ts` (atomic consumption, a real concurrent-`INSERT`
race with exactly one winner, and, the test that actually proves this gap closed, a nonce
consumed through one store instance is still consumed by a second, independently
constructed instance against the same backing, which `MemoryNonceStore` cannot pass at all)
and `packages/api/tests/integration/supabase-caller-audit-sink.integration.test.ts` (a
written event is read back through a second, independent client).

**Residual, explicitly not addressed by this session:**

- **Unbounded growth.** `consumed_nonces` is append-only by design (no application code
  updates or deletes a row), and nothing purges expired rows yet. The table carries
  `expires_at` for exactly this purpose; a future session should add a retention job (e.g. a
  scheduled delete of rows well past their `expires_at`), sized past the maximum TTL rather
  than tied to it. `caller_audit_events` has the same open shape and the same unmade
  retention decision.
- **`CallerAuditSink.record()`'s failure semantics are unchanged, not hardened.**
  `middleware/caller-auth.ts` still `await`s `record()` with no `try`/`catch`, exactly as
  before this session (re-confirmed by re-reading the call site). This session was
  instructed to preserve that behavior, change only durability, and does. Whether a failed
  audit write should be allowed to fail the caller-auth request path at all remains an open
  design question, not decided here. _(Update from a later session: this question has since
  been decided and implemented: fail-closed. See "Decision record: audit-sink fail-closed"
  immediately below.)_

**G-14. The test that proves G-13 closed could silently not run at all, with a green
summary line. RESOLVED in the session that followed G-13.** `resolveSupabaseGate`
(`packages/api/tests/helpers/supabase-availability.ts`,
`packages/storage/tests/helpers/supabase-availability.ts`) decides whether a Supabase-gated
suite runs by reading `process.env.SUPABASE_URL` at module-collection time. That variable
only reached a given test file's `process.env` if something in _that file's own import
graph_ happened to transitively import `packages/shared/src/config/Config.ts`, whose
module-scope `dotenv.config()` call was, until this session, the only place `.env` ever got
loaded. Vitest runs each test file's collection in a worker thread, and worker threads each
get an independent snapshot of `process.env`, so whether a file "saw" `SUPABASE_URL` came
down to which worker it landed in and which sibling files shared that worker, not a real gate
decision. `packages/storage/tests/integration/supabase-nonce-store.integration.test.ts`
(no import path to `Config.ts`; it only imports `SupabaseClientFactory` and
`SupabaseNonceStore`, both dependency-free of `@parmana/shared`'s config module) lost that
coin flip in every run observed across two separate sessions, including the one that first
wrote G-13's "RESOLVED, verified" claim above: the restart-simulation test that is the
_specific_ proof `MemoryNonceStore` could not pass ("a nonce consumed through one store
instance is still consumed by a fresh instance against the same backing") was silently
`describe.skipIf`-skipped, not run, every time, with nothing in the `npm test` summary
distinguishing it from a clean pass.

Fix, three parts:

1. **Deterministic env loading.** `vitest.setup.ts` (already registered as the sole
   `setupFiles` entry in `vitest.config.ts`, so every worker always runs it first) now calls
   `dotenv.config({ path: <repo-root>/.env, override: false })` directly, before any test
   file's own imports execute. Every worker now gets an identical, complete env snapshot
   regardless of which test files happen to share it. `Config.ts`'s own `dotenv.config()` call
   is untouched: `override: false` on both sides means neither load can clobber the other or
   an already-set shell variable; it is now simply a no-op the first time a file imports it.
2. **Ambient-env coupling in unit tests: investigated, none found requiring a code change.**
   The working hypothesis going into this fix was that several unit tests (`verification-api`,
   `execute-api`, `receipt-get-api`, `transactions-api`, and peers) implicitly depend on
   `SUPABASE_*` being _absent_ to stay on their in-memory storage path, and would need
   `vi.stubEnv`/explicit deletion in `beforeEach`/`afterEach` to stay green once env loading
   became deterministic. Reproducing this directly (full suite runs with `SUPABASE_URL` and
   a key present under the corrected deterministic loading, both with `ALLOW_LIVE_SUPABASE`
   unset (fail-closed gate throws for the 13 gated suites, everything else green) and set (all
   13 gated suites plus every unit test green)) found no such coupling. Reading
   `packages/api/src/bootstrap/createNonceStore.ts` and `createCallerAuditSink.ts` confirms
   why: both branch on `NODE_ENV === "test"` first, unconditionally returning the in-memory
   implementation in test wiring regardless of `SUPABASE_URL`'s presence; the coupling the
   hypothesis assumed does not exist in the production bootstrap code. (A prior, separate
   session had reproduced 13 unit-test failures resembling this hypothesis, but by shelling
   out `set -a; . ./.env; set +a` before `npm test` rather than letting `dotenv` load it;
   that method's real effect was exporting `ALLOW_LIVE_SUPABASE=1`, which happened to still
   be present in `.env` at that point in that session, globally as well, driving every gated
   suite live and concurrent alongside the unit tests, not "`SUPABASE_URL` merely present."
   That confound does not reproduce under `dotenv`-based loading; see verification below.)
3. **Closed the fail-open hole in the gate itself.** `resolveSupabaseGate` previously had only
   three branches: opt-in + configured → run; configured without opt-in → throw; unconfigured
   → skip cleanly. A fourth case was unhandled: opt-in **set** but `SUPABASE_URL`/a key **not
   visible**, which fell through to the "unconfigured" branch and skipped cleanly: exactly
   the silent-skip failure mode this gap describes, just with an explicit opt-in present.
   Both helper copies now throw a dedicated error naming this exact condition ("a live run was
   explicitly requested... but Supabase env is not visible to this worker; env loading is
   broken") instead of degrading to a skip. Explicit intent must never quietly become a green
   skip.

Verified: unit coverage for all four `resolveSupabaseGate` branches in both packages
(`packages/api/tests/unit/supabase-availability.test.ts`,
`packages/storage/tests/unit/supabase-availability.test.ts`, 5 and 4 tests respectively; the
new case in each is "(case d, G-14) throws naming broken env loading when
ALLOW_LIVE_SUPABASE=1 is set but SUPABASE_* is not visible"). With `ALLOW_LIVE_SUPABASE=1`
temporarily appended to this checkout's live-credential `.env`, `npm test` was run three
consecutive times specifically because the original bug was scheduling-dependent and one
green run proves nothing: all three reported an identical `107 passed | 1 skipped (108)`
test files and `478 passed | 1 skipped (479)` tests, zero failures, with the
restart-simulation test confirmed executing and passing (not skipped) via a verbose-reporter
run interleaved between them. (The one remaining skip in every run is the pre-existing,
unrelated `describe.skip` in `execution-failure.integration.test.ts`, not Supabase-gated.)
Before this fix, the same live-opt-in configuration produced `475 passed | 4 skipped (479)`,
the nonce-store suite's 3 tests silently missing, non-deterministically, from run to run.
`ALLOW_LIVE_SUPABASE=1` was removed from `.env` again immediately after verification; `npm
run lint` and `npm run build` both pass clean on the resulting tree.

**Residual, not addressed by this fix:** the two `resolveSupabaseGate` copies remain
independent, hand-maintained duplicates (by design, per each file's own comment; see G-3);
a future divergence between them would not be caught by anything short of manually diffing
the two files or the shared unit-test coverage happening to be kept in lockstep, as it was
this session.

**G-15. A default `npm test` on a machine with live Supabase credentials configured either
threw (pre-G-14 fix) or, independently, could crash test collection outright with a generic
supabase-js error. RESOLVED in the session that followed G-14, in two parts.**

_Part 1: `resolveSupabaseGate` branch 2 semantics changed, deliberately, from G-3's
original design._ The "configured, no opt-in" branch used to throw (G-3's own fix, made
consistent by G-14). It now skips cleanly instead, logging one line naming why
(`"<suiteLabel>: Supabase credentials configured but ALLOW_LIVE_SUPABASE=1 not set —
skipping live suite. Set ALLOW_LIVE_SUPABASE=1 to run it."`). **Trade-off, accepted
deliberately:** the previous throw existed specifically so a contributor with live
credentials in `.env` could not accidentally run live suites without realizing it. Turning
that into a skip means a default `npm test` on such a machine (the common daily-development
case) now stays green and side-effect-free without anyone touching `.env`, at the cost of
reintroducing exactly the silent-by-default posture G-3 was written to close. The other
three branches are unchanged: opted-in + configured still runs live; unconfigured still
skips cleanly; opted-in + **not** visible still throws (G-14's fix stays a hard failure;
explicit intent must never quietly degrade). Both helper copies
(`packages/api/tests/helpers/supabase-availability.ts`,
`packages/storage/tests/helpers/supabase-availability.ts`) and both packages' 4-branch unit
tests were updated in lockstep.

_Part 2: the storage bootstrap crashed test collection independent of the gate._
`StorageFactory.createFromEnvironment()` (`packages/storage/src/StorageFactory.ts`) built
whatever `PARMANA_STORAGE` named (including a live `SupabaseClient` via
`SupabaseClientFactory.create()`), with no test-mode awareness at all, unlike
`createNonceStore.ts`/`createCallerAuditSink.ts`'s NODE_ENV-gated split (G-13). Worse,
`packages/api/src/repositories.ts` called it as a **module-scope side effect**, so merely
_importing_ `repositories.ts` (which every `packages/api` test file does transitively via
`../src/application.js`) constructed live storage, crashing the entire suite with
supabase-js's generic `"supabaseUrl is required."` the moment `SUPABASE_URL` was absent
while `PARMANA_STORAGE=supabase` was still set (as it is in this checkout's `.env`),
confirmed directly: 22 files failed this way when `.env`'s Supabase lines were commented out
without also changing `PARMANA_STORAGE`. Fixed two ways:

- `createFromEnvironment()` now returns `MemoryStorageProvider` unconditionally when
  `NODE_ENV === "test"`, **regardless of `PARMANA_STORAGE`**, mirroring
  `createNonceStore`/`createCallerAuditSink` exactly. Outside test mode, behavior is
  unchanged except that `PARMANA_STORAGE=supabase` with no visible credentials now throws a
  Parmana-worded error naming both knobs (`PARMANA_STORAGE=supabase requires SUPABASE_URL
and a Supabase key...`) before `SupabaseClientFactory.create()` would otherwise fail with
  its generic message.
- `repositories.ts` no longer constructs storage at module scope. The exported
  `businessTransactionRepository`/`executionTrustRecordRepository` bindings are now Proxies
  that defer the real `StorageFactory.createFromEnvironment()` call to first property
  access. The interface at every call site (`application.ts`, both integration tests that
  import these directly) is unchanged; only the timing of construction moved.

**Trade-off, accepted deliberately (same shape as Part 1's):** because the in-memory
override is unconditional under `NODE_ENV=test`, tests that set `PARMANA_STORAGE=supabase`
in their own `beforeAll` specifically to exercise real persistence through the shared
`packages/api/tests/test-app.ts` app singleton can no longer reach a live backend through
that singleton, full stop. `ALLOW_LIVE_SUPABASE=1` does not change this, since it is a
`resolveSupabaseGate` concern, not a `StorageFactory` one. Two concrete casualties,
confirmed directly:

- `packages/api/tests/unit/transactions-api.test.ts`'s three `it.skipIf(!supabaseConfigured)`
  persistence-shape cases still pass under a live opt-in run, but now silently exercise the
  in-memory path rather than real Supabase persistence; their gating on live credentials is,
  after this fix, no longer meaningful. Not changed this session; flagged here since nothing
  in the test output signals the silent downgrade.
- `packages/api/tests/integration/workflow-supabase.integration.test.ts`'s "round-trips an
  override through the Supabase repository and still verifies" case failed outright (not
  silently) under a live opt-in run, because it writes an override through its own
  directly-constructed `SupabaseStorageProvider` and then verified by calling
  `request(app).post("/verify")`, and `app`'s repositories, unlike the directly-constructed
  one, are now always in-memory under test, so the record it just wrote to real Supabase was
  never visible to that HTTP call → 404. Fixed in this session by verifying against the same
  directly-constructed `storage.trustRecords` instead, via a directly-instantiated
  `VerificationService` (`@parmana/runtime`), the exact class the real `/verify` route
  delegates to (`ExecutionTrustApplication.verify`), so this still exercises real production
  verification logic against the real repository; it no longer additionally proves the HTTP
  endpoint wires to it, which the file's first test ("executes a Business Transaction",
  unaffected, still routes end-to-end through `app`) already covers.

Verified:

- Unit: `packages/storage/tests/unit/storage-factory.test.ts` (5 tests: NODE_ENV=test forces
  in-memory regardless of `PARMANA_STORAGE`, with and without credentials present; the named
  misconfiguration error outside test mode; unaffected `supabase`/`memory` behavior outside
  test mode) and `packages/api/tests/unit/repositories.test.ts` (2 tests, using
  `vi.doMock`/`vi.resetModules`: importing the module performs zero calls to
  `StorageFactory.createFromEnvironment`; the first repository property access constructs
  exactly once, memoized across both exported repositories).
- (a) `npm test` with this checkout's live-credential `.env` as-is, no opt-in: 0 failed
  files, all 13 previously-gate-throwing suites now skip cleanly logging the new branch-2
  message (confirmed by grep: 13 occurrences, 0 remaining `"Refusing to run"` throws), plus
  the 1 pre-existing unrelated `execution-failure.integration.test.ts` skip, everything else
  green (`97 passed | 13 skipped (110)` files, `455 passed | 33 skipped (488)` tests).
- (b) `ALLOW_LIVE_SUPABASE=1` set for a single process invocation only (never written to
  `.env`), run twice consecutively: both runs identical, `109 passed | 1 skipped (110)`
  files, `487 passed | 1 skipped (488)` tests, 0 failures, restart-simulation test confirmed
  passing (not skipped) via an interleaved verbose run.
- (c) A single invocation with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`
  set to empty strings for the process only (unsetting them outright doesn't work: `.env`'s
  real values would just backfill via `dotenv`'s `override:false`; an explicit empty string
  is what `override:false` actually respects), simulating a fresh clone without editing
  `.env`: all 13 gated suites skip via the unconfigured branch (verified via grep: their
  `[SKIP] ... not set` messages, not the branch-2 message), 0 failed files, nothing crashes
  at collection despite `.env`'s `PARMANA_STORAGE=supabase` still being set underneath;
  this is the direct proof Part 2 closes the collection-crash bug.
- `npm run lint` and `npm run build` both clean throughout.

**G-19. `POST /execute` returns HTTP 500 for an expected policy rejection, and neither the
rejection nor the approval response surfaces the policy's plain-language `reason`.** Found
2026-07-21 while building a parmanasystems.com live-proof widget route
(`packages/api/src/routes/public-demo.ts`, since removed 2026-07-21 along with the widget
it backed; see the frontend's own history for why) that worked around both issues by
calling `PolicyEngine.evaluate()` directly rather than relying on `/execute`'s response.
That workaround route is gone; this gap is not: it is a property of `/execute` and the
shared `runtime`/`shared` packages, entirely independent of the now-deleted route, and was
never fixed. Two distinct issues on the real, existing `/execute` route:

1. **Status code.** `ExecutionGate.enforce()` (`packages/runtime/src/ExecutionGate.ts:31-44`)
   throws a bare `RuntimeError` for a rejected `Decision`, which defaults to `status: 500`
   (`packages/runtime/src/errors/RuntimeError.ts:6-20`); every policy rejection currently
   reaches the caller looking identical to a server crash, even though
   `DecisionOutcome.REJECTED` is an ordinary, expected outcome of policy evaluation, not a
   fault.
2. **Missing reason field.** `Decision.reason` (`packages/shared/src/domain/decision.ts:52`)
   already carries the exact plain-language string from the matched policy rule
   (`policies/<name>/<version>/policy.json`'s `outcome.reason`) all the way through
   `DecisionBuilder.build()` (`packages/runtime/src/DecisionBuilder.ts:57-67`), and
   `ExecutionGate.enforce` does interpolate it into its thrown message
   (`packages/runtime/src/ExecutionGate.ts:38-42`), but `ExecutionTrustRecord`
   (`packages/shared/src/domain/execution-trust-record.ts`) has no `decision` field at all,
   so on the APPROVED path the reason is dropped entirely, and on the REJECTED path a caller
   only gets it as an unstructured substring of `error` inside the generic `RuntimeError`
   message (`"Execution rejected: <reason>"`), never a dedicated field.

Neither issue touches this codebase's core CLAIMS.md claims: fail-closed still holds,
nothing here weakens the signature or verification chain. But any real API consumer today
has no clean way to distinguish "policy said no" from "the server broke," and no structured
access to why. **Not fixed this pass**, flagged only, per explicit instruction to keep the
live-proof-widget work scoped and avoid touching the shared runtime/API packages.

**Update (2026-10-06): CLOSED by CLAIMS 2.21.** A policy rejection is `403` with code `POLICY_DENIED` and the policy's reason, distinct from a server error; see `docs/site/api-reference/error-handling.mdx`.

---

### Decision record: audit-sink fail-closed

**Decided and implemented** in the audit-sink/G-1 hardening session that followed G-13
(directly resolves the open question G-13 left above): if a `CallerAuditSink.record()` write
fails, the request now fails closed. An action that executes without an audit record
contradicts Parmana's core claim of independently verifiable execution, so the availability
cost of rejecting the request is accepted, consistent with the `NonceStore`'s own
fail-closed wiring (G-13). This was a deliberate design decision, not a bug fix; it is
recorded here so the decision itself is discoverable in the gap tracker, not only in session
history.

Implementation: `packages/api/src/middleware/caller-auth.ts`'s `recordOrFailClosed` helper
wraps both `auditSink.record()` call sites (the `caller.rejected` path and the
`caller.authenticated` path). On failure, it logs a structured entry
(`{ event: "caller_audit_write_failed", route, error }`, distinguishable from other
failures) and passes a new `AuditUnavailableError`
(`packages/api/src/auth/AuditUnavailableError.ts`, extends `RuntimeError`: 503,
`AUDIT_UNAVAILABLE`) to `next()`, which `error-handler.ts`'s existing generic
`instanceof RuntimeError` branch maps with no changes to that file. The success path is
byte-for-byte unchanged. Deliberately no retry, buffering, or queueing: that would convert
fail-closed into eventually-audited, a materially different (and rejected) design; see
"Decisions left for the owner" in this session's closing report if a retry layer is ever
reconsidered.

Verified: 6 unit tests directly against the middleware
(`packages/api/tests/unit/middleware/caller-auth.test.ts`): both success paths unchanged
(valid credential reaches `next()` with no error, missing credential still gets its 401),
both failure paths reject with `AuditUnavailableError` (status 503, code
`AUDIT_UNAVAILABLE`) rather than a 401 or a silent pass-through, the structured log entry's
exact shape, and that the sink is called exactly once (no retry). Plus the pre-existing
`packages/api/tests/unit/supabase-caller-audit-sink.test.ts` (G-13 session), which already
proves `SupabaseCallerAuditSink` propagates storage errors rather than swallowing them,
required for this guard to be reachable at all in production wiring.

**G-29. Structural/admission-time rejections — malformed input, missing required fields,
and duplicate `businessTransactionId` — produce no audit record of any kind. RESOLVED
same-day (2026-08-24).** Found during a 2026-08-24 review of this repository's five
architectural trust-record gaps
(scoped alongside RFC-0021 Refusal Records, RFC-0022 signal-state verification, caller-to-
capability scoping, and the principal-denied audit trail — G-29 is the one of the five
that was genuinely still open). Two signed, durable audit mechanisms exist in this
codebase today: `RefusalRecord` (RFC-0021, `docs/CLAIMS.md` §3.11) for a policy `REJECT`,
and `CallerAuditSink` (`docs/CLAIMS.md` §2.16/§2.19/new §3.19) for a caller-identity
denial. Both fire only _after_ a request has already passed structural validation and
reached `RuntimeEngine`/policy evaluation. A request that fails before that point is
invisible to both:

- **Duplicate `businessTransactionId`.** `BusinessTransactionService.accept()`
  (`packages/runtime/src/services/business-transaction-service.ts:36-44`) throws
  `DuplicateBusinessTransactionError`, mapped to `409` by
  `packages/api/src/middleware/error-handler.ts:106-114` (2.20's own atomicity guarantee).
  No `.record()` call, no `CallerAuditSink`, no `RefusalRecordRepository` write happens
  anywhere between the `throw` and the `409` response.
- **Field-level validation.** `BusinessTransactionValidator.validate()`
  (`packages/runtime/src/validators/BusinessTransactionValidator.ts:5-63`) throws
  `BusinessTransactionValidationError` for the trust-chain-consistency and
  required-field checks it performs (cross-field mismatches; missing `policy.name`,
  `policy.version`, `intent.action`), mapped to `400`
  (`error-handler.ts:80-90`). Same absence of any write.
- **Malformed / oversized request body.** Caught generically by `error-handler.ts:29-49`
  (`entity.parse.failed` → `400`, `entity.too.large` → `413`), before any route handler —
  and therefore before any audit sink — is ever reached.
- **`businessTransactionId` format check.** The UUID-shape regex in `execute.ts:20-29` /
  `transactions.ts:24-33` runs first of all, directly in the route handler, before the
  request body is even mapped into a `BusinessTransaction`; a `400` is returned
  (`execute.ts:57-62`) with no audit call.

No pre-`RuntimeEngine` audit layer exists to catch any of these: a repo-wide grep for a
generic structural/admission-time audit pattern returns zero hits, and
`packages/api/tests/unit/concurrent-duplicate-id-investigation.test.ts` — an existing test
that empirically proves the _correctness_ of the 409-under-concurrency behavior 2.20/G-1
already established — asserts only on HTTP status codes and stored transaction content,
because there is no audit trail to assert on.

**Severity: pre-production, not blocks-pilot.** Unlike G-24, this is not an authorization
bypass — every one of these paths correctly rejects the request with the right HTTP
status, before any policy evaluation or execution occurs. What is missing is purely
forensic: an operator investigating a wave of malformed requests, ID-collision attempts,
or probing traffic against `/execute`/`/transactions` has no durable, queryable record of
them today, only whatever a caller's own logs or a reverse proxy's access log happened to
capture.

**RESOLVED, same-day (2026-08-24).** Closed exactly the way this entry's own original
"not yet fixed" note anticipated: a new `caller.structural_rejected` `CallerAuditEvent`
variant (`packages/api/src/auth/CallerAuditSink.ts`), reusing `CallerAuditSink` at all
four points, split into two disciplines matching where each rejection actually happens in
the pipeline (full detail and evidence in `docs/CLAIMS.md` §3.20, the promoted claim this
resolution backs):

- The UUID-format check and the two `application.execute()` errors
  (`BusinessTransactionValidationError`, `DuplicateBusinessTransactionError`) all run
  inside a route handler mounted _after_ caller-auth middleware, so a caller identity is
  already known there (when caller-auth is enabled) — these reuse
  `recordCallerAuditEvent`'s existing **fail-closed** discipline (2.19) exactly, the same
  one `caller.capability_denied`/`caller.principal_denied` already use.
- Malformed/oversized body is rejected by `express.json()` itself, _before_ caller-auth
  middleware — or any route handler — ever runs; there is no caller identity to protect
  the accountability of at that point. This one path is deliberately **fail-open**
  instead, mirroring `RefusalRecord`'s own reasoning (§3.11's first scope caveat) rather
  than 2.19's — the request is already correctly rejected either way, and a storage hiccup
  should not turn a correct `400`/`413` into an opaque `500` for a case with no caller
  identity to protect in the first place. `createErrorHandler(auditSink?)` (replacing the
  former plain `errorHandler` export) threads the sink into `error-handler.ts` for this
  one branch only.

**Verified:** `packages/api/tests/integration/structural-validation-audit.integration.test.ts`
(new, 9 tests, real HTTP requests against the production `createApp` composition): all
four rejection points audited with the correct `reason`/`businessTransactionId`/`callerId`
shape (absent fields verified absent, not merely unchecked); the valid path records
nothing; caller-auth disabled still returns the correct status with no audit sink to write
to. `packages/api/tests/unit/supabase-caller-audit-sink.test.ts` extended (2 new cases) for
the new `business_transaction_id` column. Full repo `npx tsc -b`, `npx eslint . --ext .ts`,
and `npm test` all clean: 1243 passed (was 1234 before this session), 37 pre-existing
skips (unchanged), 0 failed — the pre-existing 8 failing tests observed at the start of
this session (`PARMANA_POLICY_DIR` in this checkout's local `.env` pointing at a
non-existent directory, an environment misconfiguration unrelated to this fix) were also
corrected as a prerequisite to getting a clean baseline, not silently left failing.

**G-31. Runtime signals were verified once, before authorization, but never re-checked at
the execution boundary. CLOSED same session it was designed (2026-09-05).**
`SignedExecutionAuthorization` (`packages/shared/src/domain/execution-authorization.ts`)
already carried a `policyContentHash`, and `ExecutionGateway.verify()`
(`packages/execution-gateway/src/ExecutionGateway.ts`) already recomputed the _current_
policy content hash at the execution boundary and rejected execution if the policy that
produced the decision had since changed (`policyStillCurrent`, Gap 1B). Nothing analogous
existed for the runtime _signals_ a decision actually rested on (vendor KYC status, risk
exposure, market conditions — whatever a policy's `boundSignals`/`SignalStateVerifier`
cares about): `SignalIntentBinder` and the optional `SignalStateVerifier` port
(`@parmana/policy`) both run once, inside `RuntimeEngine.execute()`, strictly before
`RuntimeAuthorizationSigner.sign()` — and `SignedExecutionAuthorization` is explicitly
documented as a portable artifact ("Enterprise systems should execute only requests
carrying a valid, verified SignedExecutionAuthorization"), independently verifiable by a
receiving system up to `authorizationTtlSeconds`/`maxTtlSeconds` later. Nothing prevented
an authorization whose declared vendor status, risk exposure, etc. had since drifted from
still executing, as long as its signature, expiry, TTL, content hash, and policy content
all still checked out.

**Found and closed proactively, not from an incident.** An external prompt (addressed
directly in the session transcript, not reproduced here) asked for a large parallel
"condition-bound execution proof" system — a new `ProofSigner`/`ProofVerifier`,
`ExecutionAuthorityProof` type, Razorpay connector, and voice-AI gateway — built against
files and classes (`packages/api/src/policy/PolicyEngine.ts`, `RazorpayConnector.ts`, a
`PolicyEngine.authorize()` returning a bare boolean) that do not exist in this codebase.
Investigation instead found this repo already had the mature, disciplined version of the
same idea (`policyStillCurrent` above) with exactly one real, precisely-scoped hole: signal
freshness. Razorpay was deliberately removed from this codebase previously (commits
`b228772`, `cca3231`, `e5e0b1c`) and was not reintroduced; the closure below is generic and
demonstrated against the one live connector, HubSpot.

**Closed by adding a `signalsStillCurrent` check to `ExecutionGateway`, the direct sibling
of `policyStillCurrent`.** `ExecutionAuthorizationPayload` gained an optional
`signalsHash` (canonical hash of the `PolicySignals` `RuntimeEngine.execute()` evaluated,
computed by the same `TrustRecordHasher` idiom as `policyContentHash`, and included in the
signed payload exactly like it). `ExecutionRequest` gained an optional `signals` field, and
`ExecutionRequestBuilder` now forwards `transaction.signals` onto it — both purely
additive. `ExecutionGateway` gained an optional `signalStateVerifier`
(`@parmana/policy`'s existing port, reused not reinvented): when configured and both
`signalsHash`/`request.signals` are present, it recomputes the signals hash
(tamper/mismatch check, `signalsHashMismatch`, mirrors `businessTransactionHash`) and, on a
match, independently re-verifies the declared signals against real-world state via the
same `SignalStateVerifier.findViolations` call `RuntimeEngine` already makes
pre-authorization — surfacing any drift as `signalDivergence` and rejecting execution
exactly like a `policyContentMismatch` does. Every new field/dependency is optional and
additive; no pre-existing call site required changes. In production, the circular
dependency between the Gateway (needs a `SignalStateVerifier` at construction) and
`createHubSpotSignalStateVerifier(executionSystem)` (needs the already-constructed Gateway)
is broken by a small late-binding singleton,
`packages/api/src/bootstrap/executionGatewaySignalStateVerifier.ts` — the Gateway is wired
against it at construction, and `application.ts`'s `createApplication()` binds the real
composite verifier into it once built, mirroring the existing
`mintGatewayAuthentication` late-binding pattern already used in `createExecutionGateway.ts`.

**What this does not close.** The check only runs when a capability has a
`SignalStateVerifier` configured (today, only `hubspot-deal-update`, via
`createHubSpotSignalStateVerifier`) — same scoping caveat `SignalStateVerifier` itself
already documents for pre-authorization verification. It also only has effect when a real
decision-to-execution time gap exists: this codebase's own `RuntimeEngine`/`ExecutionGateway`
wiring runs decision and execution synchronously in one call stack today (`ExecutionGateway`'s
own class doc: "Stateless and deterministic: there is no pause/resume state"), so in the
current default deployment shape the signals a `SignalStateVerifier` would re-check are, in
practice, the same instant already checked moments earlier by `RuntimeEngine`. The real
exposure this closes is a `SignedExecutionAuthorization` handed to a decoupled downstream
receiver (e.g. an `HttpExecutionSystem`-based deployment) that verifies and executes it
independently, potentially much later, up to `maxTtlSeconds` — exactly the scenario the
authorization's own "receiving systems" doc comment describes as supported.

**Claimed:** `docs/CLAIMS.md` §2.29 ("Signal-Freshness Enforcement at Execution Time
(G-31)"), filed alongside the existing §2.27 ("Policy-Freshness Enforcement at Execution
Time") this closure directly parallels.

**Verified:** new `packages/execution-gateway/tests/unit/signal-freshness.test.ts` (8
tests, mirrors `policy-freshness.test.ts`'s structure exactly): signals unchanged and
verifier reports no drift → `true`; verifier reports drift → `false` +
`signalDivergence`, and `execute()` throws naming it; request signals no longer hash-match
the authorization → `false` + `signalsHashMismatch`; no `signalStateVerifier` wired, no
`signalsHash` on the authorization, or no `signals` on the request → skipped
(`undefined`, not failed) in each case; nonce-replay-only failures still correctly
classified when this check was skipped. `packages/crypto/tests/unit/authorization-envelope.test.ts`
extended (3 new cases) for `signalsHash` passthrough/omission/tamper-detection.
`packages/runtime/tests/unit/execution-authorization-wiring.test.ts` extended (1 new case,
through the real `RuntimeBuilder`/`RuntimeEngine`/`ExecutionComponent` wiring, no test
doubles for the crypto or hashing) confirming the produced authorization's `signalsHash`
matches an independently recomputed hash of the transaction's signals, and the
`ExecutionRequest` reaching the execution system carries those same signals. Full repo
`npx tsc -b` (clean) and `npm test`: 1291 passed, 37 skipped, 0 failed — 1279 passed
immediately before this change (execution-gateway 93→101, crypto 68→71, runtime 60→61, api
unchanged at 264 passed/31 skipped), so all 12 new tests pass and nothing regressed.

**Tutorial added:** `examples/tutorials/98-signal-freshness-enforcement`, run directly
(`npx tsx examples/tutorials/98-signal-freshness-enforcement/run.ts`) and added to
`scripts/run-examples.ts`/`examples/README.md`'s authoritative list. Authorizes one real
payment through `RuntimeBuilder`, then plays two independent receiving systems against the
identical authorization and declared signals: one whose live re-check finds nothing
changed (executes normally), one that finds the vendor has since been blocked (rejected,
`signalsStillCurrent: false`, `signalDivergence` naming the mismatch, connector never
invoked) — confirmed by an actual run of the script, not merely read for plausibility.

**G-44. `PolicyEngine.evaluate()`'s structured rule-match trace was computed, then discarded
before anything durable was written. Found by an independent read-only audit
(`docs/investigations/2026-09-15-evidence-anchor-gap-audit.md`, GAP-2, 2026-09-15). RESOLVED
same day.** `packages/policy/src/PolicyEngine.ts:35-55` returns `matchedRuleId`,
`evaluatedRules` (a count), and `matchedPath` (the full ordered rule-id trace) as part of its
`PolicyDecision` — but `DecisionBuilder.build()`
(`packages/runtime/src/DecisionBuilder.ts:32-51`), the very next step, built the `Decision`
that actually gets persisted and signed from only `outcome` and `reason` (a free-text
string); all three structured trace fields were dropped in that one call. Every signed
`ExecutionTrustRecord` and `RefusalRecord` therefore carried prose explaining a decision, not
the structured, independently re-checkable rule citation that already existed one function
call earlier.

**Fix:** `Decision` (`packages/shared/src/domain/decision.ts`) gained three new optional
fields — `matchedRuleId`, `evaluatedRules`, `matchedPath` — same optionality pattern as
`PolicyReference.contentHash` (G-24): caller-unsettable, absent only on a `Decision` built
before this field existed, never a breaking change to anything constructing one without them.
`DecisionBuilder.build()` now copies all three verbatim from `PolicyDecision`. Mirrored into
the hand-authored TypeScript SDK model (`typescript/src/models/execution.ts`), the JSON
schema (`schemas/common/decision.schema.json`, including an updated example), and the
generated Python SDK model (`python/parmana/models/execution.py`, regenerated via `npm run
generate:python-models`, not hand-edited).

**Verified:** `packages/runtime/tests/unit/DecisionBuilder.test.ts` (3 new cases: trace
carried through on APPROVE, trace carried through on REJECT — not only the approved path,
existing fields unchanged). Full workspace `npx tsc -b` clean. Full repo suite: 1809 passed
(3 more than before, exactly the three new cases), 42 skipped, 0 failed. Python suite: 79
passed. Also confirmed live: a real transaction submitted to a locally-running instance
(`test:fixture-execute` against `vendor-payment@2.0.0`, the same real policy and connector
`docs/site/quickstart.mdx` uses) returned a real `ExecutionTrustRecord` whose
`executions[0].decision` carried `matchedRuleId: "approve-payment"`, `evaluatedRules: 1`,
`matchedPath: ["approve-payment"]` — not merely unit-tested in isolation.

**G-45. The policy-governance evidence-anchor chain (G-24 / §2.27 /
`PolicyGovernanceExecutionVerifier`) is real and tested, but a passing check left no
artifact of its own, and none of it references connector-execution evidence.** Found by an
independent audit (`docs/investigations/2026-09-15-evidence-anchor-gap-audit.md`, GAP-4,
2026-09-15) — and the audit's own first pass got this wrong before finding
G-24/§2.27/§2.26 in `docs/CLAIMS.md` and correcting itself; see that document's §4 for the
full account, kept rather than silently rewritten. The positive-pass-artifact half of this
gap was **RESOLVED the same day**; the connector-evidence half remains open.

**Fix (positive-pass artifact):** new `PolicyGovernanceAnchorResolver`
(`packages/api/src/governance/PolicyGovernanceAnchorResolver.ts`) performs the identical three
checks `PolicyGovernanceExecutionVerifier` does — approval record exists, its signature
verifies, its `contentHashAfter` matches the live content — but always returns a status
(`VERIFIED` | `NO_APPROVAL_RECORD` | `SIGNATURE_INVALID` | `CONTENT_MISMATCH`) instead of
throw-shaped pass/fail, and never blocks execution: a resolver error is caught and logged,
never allowed to affect the real authorization outcome (see
`RuntimeEngine.execute()`'s try/catch around the resolve call). Unlike
`PolicyGovernanceExecutionVerifier`, wired **unconditionally**
(`createPolicyGovernanceAnchorResolver.ts`, no `POLICY_EXECUTION_VERIFICATION_ENFORCED`
gate) — there is no outage risk, since a resolution never rejects anything. `PolicyReference`
(`packages/shared/src/domain/policy-reference.ts`) gained a `governanceAnchor` field, merged
onto the trust-record-bound copy of `transaction.policy` alongside `contentHash` (G-24), so an
`ExecutionTrustRecord` now honestly records `NO_APPROVAL_RECORD` for every one of this
deployment's current policies rather than being silent about the question.

**Verified:** `packages/api/tests/unit/PolicyGovernanceAnchorResolver.test.ts` (5 cases,
mirrors `PolicyGovernanceExecutionVerifier.test.ts`'s own fixtures exactly: all four status
outcomes, plus a case confirming it never throws). `packages/runtime/tests/e2e/runtime.e2e.test.ts`
(2 new cases: the resolver's result is stamped onto the real trust record with the real
policy name/version/content-hash it was called with, and a resolver that throws never blocks
or alters a real APPROVED outcome). Full workspace `npx tsc -b` clean. Full repo suite: 1819
passed (10 more than G-44's post-fix baseline of 1809 — the 5 above, 2 more from
G-46 below, and 2 more from a schema/SDK gap found and fixed in the same pass, see below), 42
skipped, 0 failed. Python suite: 79 passed. Verified live against a locally-running instance:
`policyGovernanceAnchorResolverConfigured: true` at startup (vs.
`policyExecutionVerifierConfigured: false`, confirming the two are independently gated as
designed), and a real executed transaction's `transaction.policy.governanceAnchor` came back
`{"status": "NO_APPROVAL_RECORD"}` — the honest, expected answer given G-1's still-open
backfill.

**Also found and fixed in the same pass, unrelated to G-45 itself:** `PolicyReference.contentHash`
(G-24, shipped 2026-08-19) had never actually been added to `schemas/common/policy.schema.json`
or the TypeScript SDK's hand-authored `PolicyReference` model
(`typescript/src/models/policy.ts`) — `additionalProperties: true` meant the schema never
rejected it, but SDK consumers had no typed way to read a field the server had been sending
for weeks. Fixed alongside `governanceAnchor` in both places, since leaving one documented and
the other not would have been more confusing than either state alone. Separately,
`python/scripts/generate_models.ts` had no support for a plain `export type X = "A" | "B"`
string-literal union type alias (only real TS `enum` declarations) — needed for
`PolicyGovernanceAnchorStatus`, since a real cross-package `enum` would have required an
explicit boundary-mapping function like `DecisionBuilder.toDecisionOutcome()` for no benefit
here. Added `tryParseStringUnionTypeAlias()`, a small, generically reusable addition to the
generator (not special-cased to this one field), verified via `npm run check:python-models`
producing a correct Python `Enum` and the regenerated `python/parmana/models/policy.py`
passing the full Python suite.

**Connector-evidence half, RESOLVED 2026-09-15, same day as the rest of G-45.** New
`EvidenceAnchor` domain type (`packages/shared/src/domain/evidence-anchor.ts`), a new field
on `ExecutionTrustRecord` itself, built by `BusinessTrustRecordBuilder.buildEvidenceAnchor()`
(`packages/runtime/src/BusinessTrustRecordBuilder.ts`) purely within `packages/runtime` — no
cross-package interface changes, since `RuntimeContext` already carries both
`transaction.policy.contentHash`/`governanceAnchor` and
`execution.evidence.attributes.connector.connectorEvidenceHash` by the time the trust record
gets assembled (confirmed by reading `RuntimeEngine.execute()`'s own ordering before
building this: the governance anchor is resolved and merged before `this.pipeline.execute()`
runs). Not a new cryptographic guarantee on its own — all three were already covered by
`trustRecordHash`/`signature`, since they already sit inside the one object that gets hashed
— but a single, explicitly-named, independently-computed pointer (`anchorHash`, over
`{policyContentHash, governanceAnchorStatus, connectorEvidenceHash}`) an auditor can check
without already knowing to reconstruct the binding themselves from `transaction.policy` and
`executions[].evidence.attributes.connector` separately. Absent only when there is nothing to
anchor at all (no policy content hash, no governance anchor, no connector evidence — should
not occur for any real record, since G-24 always stamps `policyContentHash`).

**Verified:** `packages/runtime/tests/unit/BusinessTrustRecordBuilder.test.ts` (4 cases: all
three inputs present and `anchorHash` independently recomputed and matched; a partial anchor
when no connector executed, e.g. no connector registered for the capability; entirely absent
when there's nothing to anchor; a different `governanceAnchorStatus` produces a different
`anchorHash` and a different overall `trustRecordHash` for otherwise-identical inputs). Full
workspace `npx tsc -b` clean. Full repo suite: 1823 passed, 42 skipped, 0 failed. Verified
live against a locally-running instance: a real executed `test:fixture-execute` transaction's
`evidenceAnchor` came back
`{policyContentHash, governanceAnchorStatus: "NO_APPROVAL_RECORD", connectorEvidenceHash,
anchorHash}`, all four populated from real values, not placeholders.

**Superseded 2026-09-20 (gap 58):** `POLICY_EXECUTION_VERIFICATION_ENFORCED` no longer decides
production behavior, enforcement is on unless `NODE_ENV` is `test` or `development`. The text that
follows describes the state when this fix was written: (the
enforcement gate, distinct from the anchor resolver) remained off by default and could not safely
be turned on until G-1's legacy-policy backfill completes — see `docs/CLAIMS.md` §2.26's
"Legacy-policy backfill" entry. G-47's enforcement-severity design question is also
unaffected: this fix makes the _evidence_ more complete, it does not change what enforcement
does with a mismatch.

**G-46. No evidence recorded whether a connector's response included an independent,
vendor-originated cryptographic confirmation, as opposed to only what Parmana's own HTTP call
observed.** Found by the same audit (GAP-3, 2026-09-15). RESOLVED same day.
`ConnectorEvidence` (`packages/execution-gateway/src/connector-execution/ConnectorEvidence.ts`)
gained `vendorConfirmationVerified: boolean`, defaulting to `false` and folded into
`connectorEvidenceHash` like every other field. Confirmed by grep before adding this field:
zero of the four connectors in this codebase (`GatewayHubSpotAdapter`, `GatewayGitHubAdapter`,
`GatewaySlackAdapter`, `GatewayPaytmAdapter`) verify a vendor-response signature — for Paytm
specifically, that verification lives entirely in a separate out-of-process repository
(`parmana-paytm-agent`), already documented in `docs/CLAIMS.md` §3.22. This field makes that
architectural limitation visible in the evidence itself, in every trust record, rather than
only in prose documentation an auditor would need to already know to go read — and gives a
future connector that does add real vendor-signature verification somewhere to record it
(`BuildConnectorEvidenceOptions.vendorConfirmationVerified`, an explicit opt-in, not inferred).

**Verified:** `packages/execution-gateway/tests/unit/evidence-hashing.test.ts` (2 new cases:
defaults to `false` when not passed, and an explicit `true` changes `connectorEvidenceHash`).
Confirmed live against the same local run as G-45 above: a real executed
`test:fixture-execute` transaction's `executions[0].evidence.attributes.connector.vendorConfirmationVerified`
came back `false`.

### cosmetic

**G-10. CLAIMS.md citations that are vague or indirect** rather than pointing at a specific
test:

- **2.7 Replay Support** cites only "Replay package" and "G-08", no test file named, even
  though `packages/replay/tests/unit/replay-engine.test.ts` and
  `packages/replay/tests/replay.integration.test.ts` (6 files, 9 tests total) are real and
  always-run.
- **2.9 Independent Envelope Verification** cites `packages/envelope-verifier/README.md`
  ("Claims" section), a documentation file, not a test.
- **3.2 Fleet-Wide Single-Use** cites the same README pattern.
- **2.1, 2.2, 2.3, 2.4** cite class names only (`BusinessTransactionValidator`,
  `PolicyRouter`, `PolicyValidator`) with no test file named, and, checked directly this
  pass, **`BusinessTransactionValidator` and `PolicyRouter` have no dedicated test file
  anywhere in the repo**, only indirect coverage through other tests
  (`ReferencePolicies.test.ts`, `ReferencePoliciesEvaluation.test.ts` for
  `PolicyValidator`; nothing dedicated for the other two).

None of these claims are false; the underlying capability is real, verified by tests
elsewhere in the suite. But a reader following CLAIMS.md's own citation cannot find the
proof without independently searching for it, which is the exact failure mode CLAIMS.md's
discipline exists to prevent.

**Update (2026-10-06):** `BusinessTransactionValidator` and `PolicyRouter` now have dedicated tests (`packages/runtime/tests/unit/BusinessTransactionValidator.test.ts`, `packages/policy/tests/unit/policy-stores.exact.test.ts`), and `PolicyValidator` has `PolicyValidator.exact.test.ts`.

**G-11. PARTIALLY CLOSED in the 2026-07-17 session.** `EXECUTION_AUTHORIZATION_TTL_SECONDS`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `CRYPTO_MODE`,
`RECEIPT_VERSION`, and `DATABASE_URL` are read by `packages/shared/src/config/Config.ts`.
The new root `.env.example` now documents every environment variable confirmed (by grep)
to be read anywhere in `packages/*/src`, including all of these, with `CRYPTO_MODE`
annotated as dead per G-4. What remains open: the public docs site
(`guides/deploy-patterns.mdx`, `deployment/local.mdx`, `cryptography/overview.mdx`) still
does not mention them. `.env.example` is a better source of truth than doc prose (it
can't drift as invisibly), but the site itself was not updated this session.

**CLOSED (checked 2026-10-06).** `docs/site/deployment/environment-variables.mdx` now lists every
variable the server reads, `CRYPTO_MODE`, `EXECUTION_AUTHORIZATION_TTL_SECONDS` and
`RECEIPT_VERSION` included, and states that the server does not read `SUPABASE_URL`,
`SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.

---

## Decision required (options, not fixes)

### D-1. Duplicate Business Transaction race (G-1)

**Option A: fix the race.** Add a real uniqueness guard to
`MemoryBusinessTransactionRepository.create()` (e.g. `Map.has` check inside the same
synchronous tick as `Map.set`, throwing `DuplicateBusinessTransactionError` itself instead
of relying on the service-layer check) and add an explicit "insert if absent" contract to
the `BusinessTransactionRepository` interface so `SupabaseBusinessTransactionRepository`
can be reviewed against the same contract (its own version is protected today only by the
Postgres `PRIMARY KEY` constraint, which would currently surface as a raw, unstructured
Postgres error rather than the clean 409 the sequential path gives, a related but distinct
inconsistency worth fixing in the same pass). _Estimated size: small, a few hours,
`MemoryBusinessTransactionRepository.create()` is nine lines; the Supabase-side error
mapping needs a `catch` for the Postgres unique-violation error code and a rethrow as
`DuplicateBusinessTransactionError`. Test: the exact `Promise.all` scenario already used
to confirm the bug, now asserting one success and one clean rejection._

**Option B: document the limitation.** State plainly on `reference/storage.mdx` and
`guides/deploy-patterns.mdx` that `memory` storage is not safe under concurrent duplicate
submissions of the same `businessTransactionId` and is not intended for anything beyond
local development, matching its existing framing everywhere else on the site. _Estimated
size: trivial, a docs paragraph, no code change. Leaves the underlying bug in place for
anyone who does run `memory` storage under real concurrent load, including any pilot that
starts on `memory` before migrating to Supabase._

I lean toward Option A being cheap enough that Option B alone under-serves anyone actually
running a pilot on `memory` storage under load, but this is a real design/priority call.

**Status: RESOLVED. Option A implemented as written above**, in the audit-sink/G-1
hardening session that followed the G-13 session. See G-1's own entry above for what
changed and how it's verified. One point the estimate above didn't anticipate:
`DuplicateBusinessTransactionError` had to move from `@parmana/runtime` to `@parmana/shared`
to avoid a circular package dependency; also documented in G-1's entry.

### D-2. Hybrid/PQ dead configuration (G-4)

**Status: PARTIALLY RESOLVED, Option A implemented for two of the three originally-listed
call sites.** See G-4's own entry above for what changed. `VerificationCrypto` (Trust
Records) and `ReceiptCrypto` (Receipts) now branch on `config.crypto.mode` and call
`CryptoBootstrap.createHybrid()`; the additive `signatures`/`schemaVersion` schema change
D-2 originally flagged as "the real complexity, not the `CryptoBootstrap` call itself" is
built (`SignatureEntry`, `packages/shared/src/domain/signature-entry.ts`), with the
existing single `Signature` field left untouched rather than replaced, closing exactly the
schema-design question this entry called out as unresolved. The Supabase schema question
this entry raised does not apply to these two surfaces: neither `execution_trust_records`
nor `receipts` needed a new column, since `signatures`/`schemaVersion` ride inside the
existing JSON-shaped record/receipt columns.

**What Option A has not touched, and D-1's original estimate did not have to consider
piecemeal:** `RuntimeAuthorizationSigner`, gateway attestation signing, and
`createConnectorRegistry.ts`'s connector-signing call sites remain exactly as this entry
originally found them — single-provider, `CryptoBootstrap.create()` only. Extending Option
A to these is a separate decision, deliberately deferred (see the Hybrid Signature Support
milestone's own scope: "Refusal Records and audit-event signing get hybrid signing in a
fast-follow milestone, not this one"), not a rejection of Option A for them. **Option B
(remove `CRYPTO_MODE` entirely, document as single-provider by design) is no longer live**
for the codebase as a whole — the config is not dead anymore, just narrower in scope than
"everything this process signs" — though it would still be a coherent choice to describe
the _remaining_ unwired surfaces as single-provider-by-design rather than extend Option A
to them.

**CLAIMS.md status:** now updated (3.13), capability-scoped only — it does not claim
hybrid-in-production, since it isn't (opt-in, not default; `@parmana/sign` doesn't cover
the new envelope shape yet, both stated explicitly in 3.13's own text). D-2's original note
that Option A "needs its own design decision" and touches CLAIMS.md is now fully resolved:
the design decision was made and implemented, and the claim was written scoped to exactly
that.

### D-3. `OverrideService` unreachable and untested (G-5)

**Resolved 2026-09-08 by option B, removal; recorded 2026-09-20.** See the update on G-5. The options are kept below as the historical record.

**Option A: wire it in.** Add a `POST /overrides` (or similar) route calling
`OverrideService`, and a test suite proving its actual business rules (duplicate-override
rejection, missing-transaction/missing-trust-record errors), replacing the storage-layer
bypass test with a real one. _Estimated size: small-to-medium, the service already exists
and is presumably complete; this is mostly route wiring plus tests, roughly a day._

**Option B: remove it, or explicitly mark it `[FUTURE]`.** If overrides aren't meant to be
externally triggerable yet, delete the unused service (it's dead code by the same
definition applied elsewhere in this audit) or add a CLAIMS.md `[FUTURE]` entry and a
`reference/runtime.mdx` note that override application is a domain concept modeled in code
but not yet exposed. _Estimated size: trivial either way._

---

### D-4. HubSpot approval issuer provisioning (NF-005, Sep 7, 2026)

`TRUSTED_APPROVAL_ISSUERS` (`packages/api/src/bootstrap/createApprovalIssuerRegistry.ts`) is
an empty array by design — the file's own comment already documents this as "the correct
fail-closed starting state," not a bug: every `preAuthorizedForAmountChange` claim
`HubSpotSignalStateVerifier` checks currently fails closed since no real approver key has
been provisioned.

**Option A: provision a real issuer.** Generate a real approver keypair out-of-band, add an
entry to `TRUSTED_APPROVAL_ISSUERS`, provision the matching public key file under
`PARMANA_KEY_DIR/approval-issuers/`, following the exact pattern already established for
trusted connector identities (`createConnectorAuthenticator.ts`). _Requires an actual
business approver (risk team, compliance) to hold the private key; not something to
provision speculatively._

**Option B: a `NODE_ENV`-gated ephemeral dev/test issuer.** Generate a keypair fresh at
test-run time (the same way `vitest.setup.ts` already does for the gateway/default signing
keys — ephemeral, per-run, never committed) and register it only under `NODE_ENV=test`, so
demos and integration tests can exercise the `preAuthorizedForAmountChange` path without
waiting on Option A.

**Option C: leave empty, do nothing.** The current state is intentional and fail-closed;
nothing is broken by leaving it as-is until a real business need for high-value HubSpot
preauthorization exists.

**A prior version of this session's plan proposed a fourth option — a hardcoded dev private
key committed to source, used by the real `ApprovalVerifier` path — and it was rejected
during review**, not implemented: even `NODE_ENV`-gated, a committed private key trusted by
real verification logic is inconsistent with this repo's own established convention
(ephemeral, never-committed test keys) and is the kind of thing this document exists to
flag, not introduce. **Status: undecided.** No option above has been implemented; this is an
open decision, not a closed one.

### D-5. Upstream authorization verification (NF-001, Sep 7, 2026)

Not a bug: `BusinessTransactionValidator.validate()`
(`packages/runtime/src/validators/BusinessTransactionValidator.ts`) checks only ID-linkage
between `authority`/`authorization`/`intent`, never an independent signature/issuer/expiry
on `Authority`/`Authorization` themselves — by design, since the real authorization boundary
today is caller identity (API key → `callerId`) plus `isPrincipalAllowed`/
`isCapabilityAllowed` scoping, not a second credential on the domain objects. This becomes a
real gap only for a delegation scenario: multi-party approval, an external authorization
source (OAuth/SAML/risk service), or a regulatory requirement for independent proof of
approval.

**Full design spec, decision gates, and a reference implementation sketch:**
`NF-001-UPSTREAM-AUTHORIZATION-VERIFICATION.md` (repo root). **Status: future scope, not
implemented, no work started.** Triggered by a real customer request or architectural
decision, not before — see that document's "Decision Gates" section for what would need to
be true first.

---

### D-6. CI's `verify-policy-approvals` gate is advisory only, not a required branch-protection check (2026-09-10; resolved 2026-09-28)

Not a code gap: `.github/workflows/ci.yml` already runs the maker-checker verification job
on every push/PR, and its own inline comment already states plainly that it is advisory
only today. The fail-closed guarantee this job provides only holds if a human notices a red
X on the PR. Nothing in this repository's committed configuration currently forces GitHub
to block a merge when it fails.

**Attempted directly, not assumed to be a simple checkbox:** `gh api
repos/{owner}/{repo}/branches/main/protection` against this actual repository (a private
repo on GitHub's free plan) returned a live 403: _"Upgrade to GitHub Pro or make this
repository public to enable this feature."_ Required-status-check branch protection is a
real, external platform/billing constraint on this account today, not a configuration
change a code session can make.

**Status: blocked, not resolved.** Two options, both requiring the repository owner's
decision (billing or visibility, neither a call this document or a code change can make):

- **Option A: upgrade to GitHub Pro** (or an org plan that includes branch protection on
  private repos), then enable a required status check for `verify-policy-approvals` on
  `main` in GitHub's own branch-protection settings, a five-minute action once the plan
  supports it.
- **Option B: make the repository public.** Branch protection is available on public repos
  regardless of plan. Has implications well beyond this one CI gate (source visibility,
  the exposed-key incident already documented above); not a decision to make solely to
  unblock this gate.
- **Option C: leave advisory-only.** The gate still runs and still reports on every PR;
  the residual risk is a human merging past a red X, not a gate that fails silently or
  doesn't run at all.

**Update (2026-09-28):** the repository is public now (`gh api repos/pavancharak/AgentLabsBuildathon`
reports `visibility: public`), so the blocker above no longer applies, and `main` has no branch
protection (`Branch not protected`). Until 2026-09-28 the gate could not check anything anyway (G-79).
**RESOLVED 2026-09-28:** `verify-policy-approvals` is a required status check on `main`, enforced for
administrators too (branch protection set through the GitHub API, checked with a read back).

---

## Top 5 to close first, if a bank's security team were reviewing next week

1. **G-1, duplicate-transaction race: RESOLVED.** Option A implemented as written: atomic
   `Map.has`/`Map.set` in the same tick for the in-memory repository, `23505` mapping for
   the Supabase repository, both throwing the same `DuplicateBusinessTransactionError`
   (relocated to `@parmana/shared` to avoid a circular dependency; see G-1's own entry).
2. **G-3, live credentials used silently by default: RESOLVED.** The "silently" half is
   fixed: an `ALLOW_LIVE_SUPABASE=1` opt-in is now required, hard-failing with a named
   error otherwise. The cleanup half remains: no test deletes the real rows it writes once
   opted in. _Remaining work: a cleanup step (or a dedicated, disposable test project) so
   an opted-in `npm test` stops leaving permanent rows in a real database, a day, mostly
   cleanup-hook work across 10 test files._
3. **G-2, no CI: CLOSED 2026-07-17.** `.github/workflows/ci.yml` now runs the full suite
   on every push and PR. Supabase-gated tests are excluded there (no project secrets
   configured in CI) and rely on local runs; the decision this note flagged as worth
   making explicitly was made explicitly: local-only for now, revisit if fleet-wide
   Supabase coverage in CI becomes a priority.
4. **G-4, hybrid/PQ dead config: PARTIALLY RESOLVED.** Option A is now implemented for
   Trust Records and Receipts (Hybrid Signature Support, Phase A) — the config is no
   longer dead, just narrower in scope than every signing surface. Remaining: execution
   authorization signing, gateway attestation, and connector signing are still
   single-provider-only, unaffected by `CRYPTO_MODE`. _Extending Option A to those, if
   wanted, is the remaining project; not urgent, since nothing currently misleads a
   deployer into thinking they're covered by hybrid mode when they aren't (G-4's own
   "still exactly as originally found" paragraph names them explicitly)._
5. **G-5, OverrideService unreachable: RESOLVED by removal (2026-09-08, recorded 2026-09-20).** Originally: (Option A or B, either closes the ambiguity): right
   now it's neither a documented `[FUTURE]` capability nor a tested, reachable one, which is
   the actual gap, not the specific choice between exposing or removing it. _A day for either
   option._

---

## How to reproduce this audit

```bash
npm test                    # baseline: 345 passed, 1 skipped
npm run coverage             # per-file coverage, v8
grep -rn "\.skip(\|\.skipIf(\|\.todo(" packages/*/tests packages/*/test --include="*.test.ts"
```

Every finding above traces to a specific `file:line` cited inline; none are inferred from
summaries or file names alone.

---

## Legacy documentation tree terminology sweep, closed 2026-07-17

Previously deferred (see prior revision of this document): `docs/00-introduction`,
`docs/rfcs`, `GOVERNANCE.md`, `docs/01-concepts` through `docs/03-api`, `docs/adr`, and
`typescript/docs/06_autonomous_vehicle.md` through `typescript/docs/09_multi_agent.md`
predate the Mintlify site (`docs/site`) and were left untouched during an earlier
terminology sweep that updated `docs/site`, `README.md`, `packages/connector-sdk/
package.json`, and the affected tutorial READMEs.

The 2026-07-17 audit closeout session swept the remainder: `GOVERNANCE.md`,
`docs/00-introduction/PROBLEM.md`, `docs/rfcs/RFC-0012-Phase-1-Architecture-Completion.md`,
`typescript/docs/06_autonomous_vehicle.md` through `09_multi_agent.md`,
`docs/architecture/EXECUTION-FLOW-AUDIT.md`, `docs/architecture/KEY-MANAGEMENT.md`, and
`docs/specifications/reference-policies.md`. A fresh repo-wide grep confirms
`docs/01-concepts` through `docs/03-api` and `docs/adr` never actually contained the
retired term (zero matches); nothing to sweep there. See "Gaps closed in the 2026-07-17
audit closeout session" above (item 19) for the two files intentionally left unswept (an
external citation that is itself correctly named "Execution Governance") and the CI guard
now in place against regression.

**G-95. The Policy Governance integrity check at startup could not stop a server from starting on a mismatch.** `verifyPolicyGovernanceIntegrityAtStartup()` ran after `app.listen()` without being awaited, and returned `{ checked: 0, mismatches: [] }` when the approval records could not be listed. So a live policy file edited outside the pending-change API, or a database outage at boot, left the server serving under a policy nobody could show was approved. Decision (2026-10-15, agreed by the maintainer): block startup in both cases. Fix: `assertPolicyGovernanceIntegrityAtStartup()` throws on a mismatch or an unrunnable check, and `server.ts` awaits it before `app.listen()`; the process exits with status 1 and logs `policy_governance_integrity_startup_refused`. The periodic re-run stays fail-open. Tests: `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts` (three new startup cases). Status: fixed on branch `claude/startup-integrity-block`, pending merge. Known cost: a database outage at boot now stops the server until the database is reachable.

**G-96. The full policy approval scan could report success having checked nothing.** `findAllPolicyFiles()` in `scripts/verify-policy-changes-approved.ts` turned a failed `readdir` into an empty list, and the scan then returned `ok: true` with `checked: 0`. In CI this gate is the one that stops an unapproved policy change from reaching `main`, so an unreadable or empty policies directory let the gate pass. Fix: read errors propagate, and a full scan with zero policy files exits 1. Tests: `scripts/tests/verify-policy-full-scan.test.ts`. Status: fixed on local branch `fix/policy-scan-and-governance-url` (commit `a8ac2961`), not yet pushed or merged. Residual: the scan only sees files it can list; a policy that exists but is not in the approval record is still caught by the content-hash check.

**G-97. The governance UI would send its API key in clear text to any configured base URL.** `loadGovernanceUiConfig()` in `packages/governance-ui/src/config.ts` accepted any `PARMANA_API_BASE_URL` and `apiClient.ts` sent the key as a bearer token to it. Fix: `assertSafeApiBaseUrl()` requires `https://`, allows `http://` only for loopback outside production, and refuses URLs with embedded credentials. Tests: `packages/governance-ui/tests/unit/config.test.ts`. Status: fixed on local branch `fix/policy-scan-and-governance-url` (commit `a8ac2961`), not yet pushed or merged. Residual: the check validates the URL's form, not which host it names.

**G-98. The Vercel serverless entry did not refuse startup on a Policy Governance integrity mismatch, and skipped the Paytm connector guard.** `api/index.ts` called `runPolicyGovernanceIntegrityCheckAtStartup()` without awaiting it and without refusing, so a live policy with no matching approval record could be served. The entry also never ran `assertPaytmConnectorConfigured()`, so `PAYTM_CONNECTOR_URL=http://...` could run with the shared secret in plaintext. Its import pointed at a `dist` module that has no source. Fix: the entry awaits `assertPolicyGovernanceIntegrityAtStartup()` inside `buildApp()`, so a mismatch fails every request, and runs the Paytm guard at module load. Status: fixed on branch `fix/policy-scan-and-governance-url`, not yet merged. Residual: no process exit in serverless, so refusal is per request, not per process. Tests: the entry is not covered by an automated test; the change was checked by typecheck and by the `packages/api` suite.

**G-99. `POST /transactions` did not check `metadata.tenantId` against the caller's allowed tenants.** `POST /execute` refused a tenant id its key did not list. `POST /transactions` did not, so a caller could name another tenant and have the authorization signed under that tenant's key (`tenant.<id>`). Fix: the same check, with the same `TENANT_NOT_ALLOWED` response. Test: `packages/api/tests/integration/caller-capability-scoping.integration.test.ts`. Status: fixed on branch `fix/policy-scan-and-governance-url`, not yet merged. Residual: the impact depends on `tenant.*` signing keys being provisioned.

**G-100. Connector credentials could be sent to an unchecked base URL, and a 2xx non-JSON merge or update counted as success.** `HUBSPOT_BASE_URL`, `GITHUB_BASE_URL` and `SLACK_BASE_URL` reached the production connectors with no scheme or host check, so `http://` sent the token in clear text. The GitHub and HubSpot adapters also parsed a non-JSON 2xx body as `{}` and recorded success. Fix: `readConnectorBaseUrl()` enforces https (or loopback http) and refuses embedded credentials; the adapters fail when the body is not JSON. Tests: connector and gateway suites pass. Status: fixed on branch `fix/policy-scan-and-governance-url`, not yet merged. Residual: the connector check cannot tell whether a loopback address is a real mock or a local proxy.

**G-101. The TypeScript SDK accepted any endpoint and printed its API key, and the SDKs trusted a non-boolean `valid` and an unencoded path id.** The Python SDK refused plain http to remote hosts; the TypeScript SDK did not. `console.log(client)` and `JSON.stringify(client)` exposed the key. Path ids were not encoded, so `../` could re-route a request. `valid` was returned as-is, so a string `"false"` read as true. Fix: `assertSafeEndpoint()`, an inspect/`toJSON` that omit the key, `encodeURIComponent` and `quote` on path ids, and a strict `=== true` check. Tests: `typescript/test/EndpointGuard.test.ts`; Python SDK suite passes. Status: fixed on branch `fix/policy-scan-and-governance-url`, not yet merged. Residual: eight TypeScript SDK test files do not load in this environment, with or without these changes.

**G-102. Smaller leaks and gaps found by the audit.** The public `/ready` route returned database error text. The Python connector SDK `CredentialHandle` printed its token in `repr`. The governance UI had no timeout on its API calls. The policy gate read `NODE_ENV` to decide whether to run, so a committed `.env` line could switch it off; the gate walked neither symlinked policy directories nor the directory `PARMANA_POLICY_DIR` named. `rotate-caller-key` wrote to a path built from an unchecked caller id, and `generate-fly-secrets` regenerated signing keys on every run. The `rate_limit_counters` table had no row level security, so the Data API's anon role could reach it. The Razorpay example reported a post-POST failure as a misconfiguration. Fix: each item corrected as described in CLAIMS 3.26. Status: fixed on branch `fix/policy-scan-and-governance-url`, not yet merged. Residual: the RLS migration has not been applied to the live Supabase project, so the live grants are still unverified.

**G-103. A signed authorization released for a denied decision.** The gateway verified the signature, expiry, content hash, policy hash and signals, but never read the decision outcome, and the signed payload held only the decision id. A holder of the signing key, or any code outside the runtime gate, could obtain a valid authorization for a denied decision and have it released. The proof audit reproduced the release. Fix: the runtime signs `decisionOutcome: "APPROVED"` into the authorization after `ExecutionGate.enforce`, and the gateway refuses any authorization without that value (`decisionApproved` check). A control with an identical payload signed as APPROVED still releases. Status: fixed on branch `ccr-6f1b8d3b-o5pqwj` (commit ddb6009), not yet merged. Residual: the HubSpot helper that signs its own fetch asserts `APPROVED` itself (G-111).

**G-104. The in-process release service trusted the caller's verification flags.** `ExecutionControlService.execute` released to a connector on the caller's `verifiedTransaction` booleans, and did not re-verify the authorization. Anyone holding the gateway attestation key, which lives in the same process, could release an unsigned authorization. Fix: the service takes a required `verifyRelease` check (`packages/api/src/bootstrap/createReleaseVerifier.ts`) that re-verifies the signature, expiry, outcome and content hash, and resolves keys through the gateway's own key provider. The nonce is now consumed at that same single release point, on the same store the gateway uses, so a replay through the in-process path is refused (the proof audit reproduces it). Status: fixed on branch `ccr-6f1b8d3b-o5pqwj`, not yet merged to main. Residual: the attestation key itself still lives in the process that can call the control (G-118).

**G-105. Test and development environments skipped policy governance by default.** The approval-record check was relaxed whenever `NODE_ENV` was `test` or `development`. A deployment that set either one ran policies with no approval record. Fix: relaxation needs an explicit `PARMANA_ALLOW_UNGOVERNED_POLICY=true` in those two environments, and `POLICY_EXECUTION_VERIFICATION_ENFORCED=true` still forces enforcement (`packages/api/src/bootstrap/policyGovernanceRelaxed.ts`). The policy hash is always required. Status: fixed on branch `ccr-6f1b8d3b-o5pqwj` (commit ddb6009), not yet merged. Residual: the test suite sets the opt-in in `vitest.setup.ts`, so tests still run relaxed. That is intentional, but it means the tests do not exercise the enforced path by default.

**G-106. A published policy version could be overwritten in place.** `FilePolicyRepository.save` replaced whatever was stored at `(name, version)`, and the governance approval wrote to the version the proposal named. A proof that cited the old content then failed at release, but nothing stopped the write. Fix: `save` refuses different content for an existing version with `PolicyVersionImmutableError`, and the approval service refuses before writing an approval record. The API maps this to `409`. Identical re-saves are allowed. Status: fixed on branch `ccr-6f1b8d3b-o5pqwj` (commit ddb6009), not yet merged. Residual: the startup governance integrity check was not exercised by the audit (G-116).

**G-107. The HubSpot verification fetch carried no policy hash.** The HubSpot signal-state verifier signs its own `hubspot:deal-fetch` authorization and sends it through the gateway. The gateway requires a policy content hash, so in production that fetch was refused and the deal-update signal check failed closed. Test mode had hidden this because it relaxed the requirement. Fix: the fetch authorization binds to the content hash of `hubspot-deal-update@1.0.0`, resolved through the same policy repository the gateway checks. Status: fixed on branch `ccr-6f1b8d3b-o5pqwj` (commit ddb6009), not yet merged. Residual: the fetch still self-asserts its outcome (G-111).

**G-108. The caller audit chain cannot detect deleting its newest row.** The chain links each row to its predecessor, so deleting a middle or first row breaks verification, but deleting the newest row leaves a shorter, consistent chain. The proof audit reproduced this. Fix: `CallerAuditChainVerifier.verifyChain` accepts an anchor (the last `chainPosition` and `chainHash`) recorded outside the database, and fails a chain that does not end at it. Other edits, reorders and middle or first deletions are detected without an anchor. Status: narrowed, not closed, on branch `ccr-6f1b8d3b-o5pqwj` (commit ddb6009), not yet merged to main. Detection of tail truncation needs the head published to a store the database cannot rewrite, which is an operator step (REMAINING-WORK section M).

**G-109. Caller authentication could be disabled and the demo approver enabled in production.** `PARMANA_AUTH_DISABLED=true` only warned, and `PARMANA_SANDBOX=true` mounted the demo approver that signs approvals with a server-held key. Fix: both are refused at startup when `NODE_ENV=production` (`createCallerAuthenticator.ts`, `createSandboxOptions.ts`). Status: fixed on branch `ccr-6f1b8d3b-o5pqwj` (commit ddb6009), not yet merged. Residual: outside production, both still work as documented.

**G-110. There is no revocation of a single authorization.** Revocation is per signing key (`key-expiry.json`) and per authority grant (RFC-0023). Nothing revokes one authorization, so an authorization stays releasable until its TTL ends. Fix: the gateway checks each release's `authorizationId` against `<PARMANA_KEY_DIR>/revoked-authorizations.json` (`packages/api/src/bootstrap/createAuthorizationRevocationList.ts`), read on every check, so a change needs no restart. A malformed or unreadable file refuses the release. Status: fixed on branch `ccr-6f1b8d3b-o5pqwj`, not yet merged to main. Residual: the file is maintained by hand; there is no revocation endpoint yet.

**G-111. The HubSpot verification helper approves its own fetch.** `executeHubSpotCapability` builds an authorization with a random decision id and `decisionOutcome: "APPROVED"`, and signs it. There is no runtime decision behind it. Fix (containment, not removal): the fetch is signed with a dedicated verifier key (`PARMANA_VERIFIER_KEY_ID`, default `signal-verifier`), and the gateway accepts that key only for `hubspot:deal-fetch` (`verificationOnlyKeys`). A compromised verifier key can therefore read a deal but cannot release a write; the audit reproduces the refusal. Status: partly fixed on branch `ccr-6f1b8d3b-o5pqwj`, not yet merged to main. Contained, not removed. Residual: the helper still asserts `APPROVED` for its own read. Removing that needs the verification to go through a runtime decision.

**G-112. The offline verifier loads the repository `.env`.** The verification package imports `@parmana/shared`, whose configuration module calls `dotenv.config()` when it loads, so a third party's verifier process reads a `.env` file in the working tree. It loads no key material and uses none of the values, but the verifier is not isolated from the filesystem. Fix: `dotenv` now runs once, from the first `loadConfig()` call, not when `@parmana/shared` is imported. Importing the verifier reads no file. Dotenv's banner is silenced so it does not write to the console. Status: fixed on branch `ccr-6f1b8d3b-o5pqwj`, not yet merged to main. Residual: none for the verifier; server processes still read `.env` when they load configuration.

**G-113. The execution-boundary signal check fails open during bootstrap.** `LateBoundSignalStateVerifier.findViolations` returns no violations until `bind()` is called. The hash check still runs; only the real-world divergence check is skipped in that window. `createApplication` binds it during startup. Fix: `LateBoundSignalStateVerifier.findViolations` throws until `bind()` runs, so an execution that reaches the check during bootstrap is refused, not released unchecked. Status: fixed on branch `ccr-6f1b8d3b-o5pqwj`, not yet merged to main.

**G-114. The `legacyInsecure` connector option skips the session credential and audit requirement.** `GatewayConnectorRegistry` accepts `legacyInsecure: true`, which runs a connector without a single-use session credential or an audit sink. No production bootstrap sets it, and only tests do. Fix: `buildSecureConnector` refuses `legacyInsecure: true` unless `NODE_ENV` is `test`. Status: fixed on branch `ccr-6f1b8d3b-o5pqwj`, not yet merged to main. Residual: the option still exists for tests.

**G-115. End-to-end proof audit covered only the Paytm refund path.** Fix: the same gate conditions (no proof, forged signature, changed parameter, revoked, expired, replay, and a valid control) now run for Slack post-message (`proof-audit/tests/test7-slack.test.ts`), GitHub PR merge (`test8-github.test.ts`) and HubSpot deal-update (`test9-hubspot.test.ts`), each against its recording mock. External connectors are covered at the control level by `external-connector-release.integration.test.ts` (no registration, out-of-scope parameter, revoked registration). The generic HTTP adapter has no production caller and is not wired. Status: partly fixed on branch `ccr-6f1b8d3b-o5pqwj`, not yet merged to main. Residual: the audit does not yet cover a live external connector endpoint.

**G-116. The startup governance integrity check was not exercised by the proof audit.** Fix: Test 4 now signs a real approval record for the stored 1.2.0, confirms the check passes against the matching file, then edits the file outside governance and confirms the check reports a mismatch. Status: fixed in the proof audit on branch `ccr-6f1b8d3b-o5pqwj`, not yet merged to main. Residual: this is the audit harness; the operator should still run the check against the live policy directory.

**G-117. The production stores and signing backends were not exercised by the proof audit.** Fix: the Postgres nonce store (`SupabaseNonceStore`) runs its own SQL on PostgreSQL semantics (PGlite): first use, replay, 20 concurrent attempts with exactly one winner, replay after restart, and a missing table as an error (`test6-postgres-nonce.test.ts`). The Postgres execution audit sink runs its own migrations and writes on the same semantics, and its chain is verified, including an anchored tail (`test10-execution-audit.test.ts`). Status: partly fixed on branch `ccr-6f1b8d3b-o5pqwj`, not yet merged to main. Residual: KMS signing was not run. It needs an AWS key, and this audit made no AWS calls.

**G-118. The attestation key that authorizes the in-process release path lives in the process that calls it.** `createGatewayKeyPair` loads the gateway's attestation key from `PARMANA_KEY_DIR` into the API process. Anyone who can run code in that process can mint an attestation and call `ExecutionControl.execute` directly. The release check (G-104) and the single nonce point stop an unsigned or replayed authorization, but not a holder of valid signed authorizations who skips the gateway. Status: open, structural. Engineering: move the control behind a separate process or a hardware-backed signer, so the attestation cannot be minted by application code.
