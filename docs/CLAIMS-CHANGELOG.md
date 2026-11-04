# Parmana technical claims: changelog

This file keeps the dated updates that were recorded inside `CLAIMS.md`, so that the claims themselves can describe their current state. Each entry is copied word for word from the claims file as it was on `main`, with the claim it belongs to and its line number there. Nothing here has been edited.

The current state of each claim is in `CLAIMS.md`. Read the entries here to see how a claim changed over time.

## 2.14 Configurable Post-Quantum Signing (ML-DSA-65)

_Originally at line 311 of `CLAIMS.md`._

**Update (2026-09-09):** `SIGNATURE_PROVIDER`/`PRIMARY_SIGNATURE_PROVIDER`/`SECONDARY_SIGNATURE_PROVIDER` now also accept `ml-dsa-65` as an input alias for `dilithium3` (`parseSignatureAlgorithm`, `packages/shared/src/config/ConfigValidation.ts`), resolved to the same canonical `dilithium3` identifier before validation. Additive only: an existing `dilithium3`-configured deployment is completely unaffected — the internal identifier is not renamed, only a second accepted spelling was added, so a new deployment can use the accurate NIST/FIPS 204 name without anyone reverting or migrating anything. The two `scripts/generate-keypair.ts` CLIs (`--algorithm`) accept the same alias, normalized to `dilithium3` before generating a key, for the identical reason. A production-readiness audit on 2026-09-09 had concluded a literal rename would be a regression (breaking existing `dilithium3`-configured deployments for no externally-visible benefit, since the docs already disclose the naming history) — this alias is the corrected, non-breaking version of that request.

## 2.14 Configurable Post-Quantum Signing (ML-DSA-65)

_Originally at line 329 of `CLAIMS.md`._

**Update (2026-09-11, PQC production-readiness audit remediation):** a same-day audit scoped specifically to whether this cryptographic evidence is independently verifiable by third parties (regulators, auditors) found and closed four real gaps, none of which change anything described above -- this claim's own content is unaffected. Summarized here; full detail in `docs/VERIFICATION-GAPS.md`'s "Gaps closed in the 2026-09-11 PQC production-readiness audit remediation" table (gaps 51-54): (1) no standalone offline verifier existed anywhere in this repository -- new `packages/crypto/src/OfflineVerifier.ts` and a Python counterpart, cross-language determinism proven by spawning the real TypeScript signer and verifying its output independently in Python; (2) no public-key discovery endpoint existed -- new `GET /keys/:keyId` and `GET /.well-known/jwks.json`; (3) `VerificationCrypto`/`RefusalCrypto`/`AuditEventCrypto` had no way to rotate their signing keyId without breaking every previously-issued signature -- new `PARMANA_VERIFICATION_KEY_ID`/`PARMANA_VERIFICATION_SECONDARY_KEY_ID`, mirroring the existing `PARMANA_GATEWAY_KEY_ID` precedent; (4) a genuinely hybrid-signed record's ML-DSA-65 signature could be silently stripped with no detection -- new opt-in `HYBRID_SIGNATURE_REQUIRED` policy flag. All four fixes are additive; not one already-issued signature is affected by any of them.

## 2.14 Configurable Post-Quantum Signing (ML-DSA-65)

_Originally at line 333 of `CLAIMS.md`._

**Update (2026-10-20): not live in production.** Production runs `CRYPTO_MODE=single`, so its records carry only the Ed25519 signature. No deployment runs hybrid signing: the test project once configured for it was removed on 2026-10-23, and no live hybrid record was ever verified through an API. Enabling it in production is an operator decision with a key-material prerequisite. See G-119 in `docs/VERIFICATION-GAPS.md`. Until then, the statements in this section describe what is built and tested, not what runs in production.

## 2.16 Caller Authentication at the API Boundary

_Originally at line 357 of `CLAIMS.md`._

**Update (2026-09-10):** `.env.example` shipped `PARMANA_AUTH_DISABLED=true` uncommented, so a first-time operator copying it to `.env` without reading every line would deploy with caller authentication off, discoverable only via the startup `console.warn`, easy to miss in a log-aggregation tool after the fact. The example file's line is now commented out (the code's own default remains `"false"`, unchanged). `GET /ready`'s JSON response now also carries `authDisabled: true` (plus a `warning` string) whenever this flag is set, alongside the existing log line. This gives an operator's own monitoring/synthetic checks, already polling this endpoint every 30s per `fly.toml`, a field to assert and alert on directly. See `docs/VERIFICATION-GAPS.md` G-43.

## 2.18 Key Provider Input Validation

_Originally at line 414 of `CLAIMS.md`._

**Update (2026-09-10):** a separate, previously-unclosed gap in the same area: `KEY_PROVIDER` accepted `aws-kms`, `azure-key-vault`, `gcp-kms`, and `hsm` as valid config values (`packages/shared/src/config/KeyProviders.ts`), each parsed and validated cleanly, but `KeyBootstrap.create()` (`packages/crypto/src/KeyBootstrap.ts`) always constructed `FileKeyProvider` regardless of the configured value -- an operator setting `KEY_PROVIDER=aws-kms`, expecting real KMS custody, got private-key-on-disk instead, with no error at any point. `docs/VERIFICATION-GAPS.md` G-40 closed this: `KeyBootstrap.create()` now throws at startup for any value other than `"local"`, naming the configured value and stating plainly that only `FileKeyProvider` is implemented -- turning the misconfiguration from a silent, false sense of custody into an immediate, actionable startup error. No real cloud KMS/HSM provider exists yet; this closes the silent-fallback failure mode, not the absence of those providers themselves.

## 2.18 Key Provider Input Validation

_Originally at line 416 of `CLAIMS.md`._

**Update (2026-09-15):** the "no real cloud KMS/HSM provider exists yet" statement above is now out of date for AWS KMS specifically. `SignerBootstrap.create()` (`packages/crypto/src/SignerBootstrap.ts`, a sibling composition root to the still-unchanged `KeyBootstrap.create()` this entry describes) now resolves a real `KmsSigner` (`packages/crypto/src/providers/signer/KmsSigner.ts`, ADR-0009) for `KEY_PROVIDER=aws-kms`, and all seven signing call sites plus `packages/api/src/routes/keys.ts` already resolve through it. Fixed the same day: `KmsSigner` was passing Parmana's logical keyId (e.g. `DEFAULT_KEY_ID = "default"`) straight through as AWS KMS's `KeyId` parameter, which KMS rejects outright — it must be a real key ID, key ARN, or an `alias/`-prefixed name. `KmsSigner` now maps `keyId` → `alias/<keyId>` (mirroring `FileKeyProvider`'s own `keyId` → `<keyId>.private.pem` convention), passing an already-qualified alias, ARN, or raw key ID through unchanged. Verified end-to-end against a real AWS KMS key (`ECC_NIST_EDWARDS25519`/`ED25519_SHA_512`, account <aws-account-id>, ap-south-1) under a least-privilege IAM identity scoped to that one key: `hasKey`, `getPublicKey`, `sign`, and Node's own `crypto.verify` against the returned signature, and `getMetadata`, all passed. Unit test coverage added (`packages/crypto/tests/unit/kms-signer.test.ts`) for the keyId-mapping behavior itself. Azure Key Vault, GCP KMS, and on-prem HSM remain unimplemented, and `KeyBootstrap.create()` (the older, unused-in-production composition root this entry originally described) is unchanged and still throws for any non-local provider. Not yet done: the Vercel→AWS OIDC IAM role (`AWS_ROLE_ARN`) ADR-0009 specifies for production credential-free authentication — only a local-admin IAM user (`parmana-kms-operator`) was provisioned so far, deliberately scoped to local/CLI key administration, not runtime signing.

## 2.21 Distinguishable HTTP Status for Policy Denial and Replay

_Originally at line 493 of `CLAIMS.md`._

**Update (2026-08-24 documentation-currency pass):** this section previously also cited `packages/api/tests/integration/razorpay-refund.integration.test.ts`/`razorpay-live.integration.test.ts` as evidence of the same `403`/`POLICY_DENIED` assertion "through the real production bootstrap chain." Both files were deleted along with the rest of the Razorpay connector on 2026-08-12 (see §3.16's own update); that specific production path no longer exists. The claim itself — that a policy `REJECTED` decision surfaces as `403`/`POLICY_DENIED` — remains fully current and is unaffected, demonstrated by the `caller-auth.integration.test.ts` citation immediately above, which exercises the same generic mechanism against `test:fixture-execute` rather than a Razorpay-specific transaction.

## 2.22 Canonical Capability-to-Policy Binding (TD-22)

_Originally at line 515 of `CLAIMS.md`._

**Update (code-only ground-truth capture pass, follow-up closure):** this section's "covering every capability the production connector registry actually registers" was, until this pass, not quite true — `CANONICAL_CAPABILITY_POLICY_BINDINGS` also carried a stale `payments:execute` entry left behind by G-27's vendor-payment removal (`docs/VERIFICATION-GAPS.md` G-27's own update). Removed; the table now matches the claim exactly. See that G-27 update for the full trace.

## 2.22 Canonical Capability-to-Policy Binding (TD-22)

_Originally at line 517 of `CLAIMS.md`._

**Update (2026-08-25 audit-fix pass, RESOLVED same-day):** "covering every capability the production connector registry actually registers" was, briefly, not true. `createConnectorRegistry.ts` conditionally registers `github:pr-fetch`/`github:pr-merge` (3.17) when GitHub App credentials are configured, wired in on 2026-08-19 — five days _before_ the code-only ground-truth pass above — but neither capability had been added to `CANONICAL_CAPABILITY_POLICY_BINDINGS`. Fixed same day: both now map to `github-pr-approval/1.0.0` (the policy §3.17's own connector already evaluates), mirroring HubSpot's own two-capabilities-one-policy shape exactly. `CapabilityPolicyBinder.test.ts`'s "binds every capability the production connector registry actually registers" test — which asserts a hardcoded set rather than reading the registry live, which is why the gap went uncaught for six days — now includes both. Full trace in `docs/VERIFICATION-GAPS.md` G-30 (RESOLVED).

## 2.22 Canonical Capability-to-Policy Binding (TD-22)

_Originally at line 519 of `CLAIMS.md`._

**Update (2026-08-26, G-30 architecture follow-up, Option C implemented):** `CANONICAL_CAPABILITY_POLICY_BINDINGS` and `CapabilityPolicyBinder` moved out of `@parmana/policy` into a new leaf package, `@parmana/capability-registry`, depending only on `@parmana/shared`. `@parmana/policy`'s own public API is unaffected — `packages/policy/src/index.ts` re-exports both symbols from the new package unchanged, so every existing consumer importing from `@parmana/policy` needed no changes; confirmed by grep across the ~10 files that do (`RuntimeEngine.ts`, `RuntimeBuilder.ts`, `execute.ts`, and others). **Deviation from the original Option C sketch, corrected before implementing:** the original Option C plan proposed also importing capability-identifier constants from `@parmana/connector-github`/`@parmana/connector-hubspot` into the new package to remove identifier-string duplication. Checked before doing it: `@parmana/connector-hubspot` already depends on `@parmana/policy` directly, and `@parmana/connector-github` depends on `@parmana/connector-sdk`, which also depends on `@parmana/policy` — either import would have created a direct dependency cycle back through the package this extraction was built to be depended on by. Not done; the four capability-identifier strings remain hand-typed in `CapabilityPolicyBinding.ts`, same as before the move, still duplicated against `GitHubCapabilities.ts`/`HubSpotCapabilities.ts`'s own separate constants. What this move does close: the `packages/policy` → `packages/api` backwards-dependency edge Option B would have required. Full detail in `docs/VERIFICATION-GAPS.md` G-30. Verified: full rebuild (`npx tsc -b`, clean) and full suite unchanged at 1274 passed, 37 skipped, 0 failed.

## 2.22 Canonical Capability-to-Policy Binding (TD-22)

_Originally at line 521 of `CLAIMS.md`._

**Update (2026-09-27, G-66, merged to `main` and deployed to production on 2026-09-27 (PR #46, merge `4eebd5f`)):** the binding pins the policy **name**; where policy governance is enforced, the **version** is the one most recently approved for that name, not the one written in the table. See 2.43.

## 2.22 Canonical Capability-to-Policy Binding (TD-22)

_Originally at line 523 of `CLAIMS.md`._

**Update (2026-09-28, G-73):** `github:pr-fetch` is bound to a new policy name, `github-pr-read`, so reads need no merge approval, and the table names `github-pr-approval` 1.1.0 for `github:pr-merge`. The name change takes effect on deploy; in production a read is then refused until `github-pr-read` 1.0.0 is approved (2.44).

## 2.46 An Approver Is Notified When a Request Waits Only for Their Approval (Scoped, 2026-09-29)

_Originally at line 539 of `CLAIMS.md`._

**Update (2026-09-29, email):** `APPROVAL_EMAIL_TO` sends the same event by email through Resend (`createEmailApprovalNeededNotifier.ts`), with one idempotency key per refusal (`approval-needed/<decisionId>`), alongside or instead of the webhook. Tests: `approval-email.integration.test.ts` through `POST /execute` with the Resend SDK replaced, and unit tests.

## 2.51 A Public Sandbox Runs the Same Governance With a Published Demo Key (Scoped, 2026-10-02)

_Originally at line 685 of `CLAIMS.md`._

**Update (2026-10-23): rebuilt and checked again.** The 2026-10-02 database and the Vercel project were removed, and the sandbox was rebuilt from `pavancharak/parmana-core` with `deploy/sandbox/setup-sandbox.ps1`. The evidence above is for the first build; the rebuild's is:

## 2.53 An Agent's Proposed Fact Is Not a Business Fact: Sourced Signals and Separate Authority, Validity and Execution Statuses (Scoped, 2026-10-10)

_Originally at line 741 of `CLAIMS.md`._

**Update (2026-10-11):** the first scope bullet is superseded by 2.54: business systems can now be registered as sources through maker checker, and a source registered with a key must sign its answers, which Parmana verifies (`sourceProofVerified`). The fourth bullet holds only for sources registered without a key. The second bullet is superseded by 2.55 for a policy with `requireAuthorityGrant`: authority then also needs the caller's grant, and `AUTHORITY_EXPIRED` is produced.

## 2.23 Independently Certified Authorization (Phase 3D)

_Originally at line 933 of `CLAIMS.md`._

**Update (2026-08-24 documentation-currency pass):** this certification was performed, and the "CLAIM FULLY CERTIFIED for both capabilities" verdict above was written, while the Razorpay connector still existed. The Razorpay connector — including `razorpay:refund-create`, the `RazorpayTypes.ts` redaction this section previously cited, and the daily-refund-cap ledger integration test previously cited here — was deliberately removed in its entirety on 2026-08-12 (see §3.16's own update, and this document's historical §3.8/§3.9). `razorpay:refund-create` is therefore no longer a production-reachable capability, and this certification's Razorpay-specific findings are historical: an accurate record of what was independently verified about that connector _while it existed_, not a description of current production reachability. The `hubspot:deal-update` findings are unaffected by the removal and remain current — as of this update, `hubspot:deal-update` is the only capability the "CLAIM FULLY CERTIFIED" verdict above actually describes in present-tense production terms.

## 2.23 Independently Certified Authorization (Phase 3D)

_Originally at line 935 of `CLAIMS.md`._

**Update (2026-08-25 audit-fix pass):** `github:pr-merge` (and `github:pr-fetch`) also became production-reachable on 2026-08-19 (§3.17), ten days before the update above was written, but was missed by it. Precisely: Phase 3D's certification document is dated 2026-08-09 and contains zero mentions of GitHub — it predates the connector entirely and never assessed it. `github:pr-merge` is therefore **not covered by the "CLAIM FULLY CERTIFIED" verdict above**, in either direction; nothing here should be read as either certifying or doubting its authorization strength. §3.17's own test suite (22 hermetic unit tests, 4 integration tests through the real `POST /execute` bootstrap chain) independently demonstrates policy-denial-makes-zero-calls and credential isolation for GitHub specifically, but that is §3.17's claim, not a Phase-3D-style adversarial certification. Separately, and more directly relevant to this claim's "no exceptions" wording: `docs/VERIFICATION-GAPS.md` G-30 found, and same-day resolved, that `github:pr-merge` had no entry in `CANONICAL_CAPABILITY_POLICY_BINDINGS`, meaning the structural capability-to-policy binding 2.22 describes briefly did not extend to it. That specific gap is now closed (2.22's own update); it does not retroactively make Phase 3D's certification cover GitHub — `hubspot:deal-update` remains the only capability this section's "CLAIM FULLY CERTIFIED" verdict describes.

## 2.25 Strategic Positioning — Independently Validated, YES (Pass 4)

_Originally at line 971 of `CLAIMS.md`._

**Update (2026-08-24 documentation-currency pass):** the connector count above ("exactly three... test-fixture, razorpay, hubspot") described `createConnectorRegistry.ts` as it stood at pass 4's time, before the Razorpay connector was deliberately removed on 2026-08-12 (see §3.16's own update). `createConnectorRegistry.ts` now registers exactly **two** connectors — `test-fixture`, `hubspot` — with zero references to `razorpay` anywhere in the file, confirmed by direct reading and by `create-connector-registry.test.ts`'s own current content, which is entirely HubSpot-scoped. This does not change the YES verdict above (the removal only shrinks the set of registered connectors further; `payments:execute` still has no connector to resolve to, and no new capability was added that would need re-validating) — it corrects a count that is now one connector out of date.

## 2.25 Strategic Positioning — Independently Validated, YES (Pass 4)

_Originally at line 973 of `CLAIMS.md`._

**Update (2026-08-25 audit-fix pass):** the "exactly two" count directly above was itself already wrong the day it was written. `createConnectorRegistry.ts` conditionally registers a third connector, `github` (`createGitHubConnector`, `github:pr-fetch`/`github:pr-merge`, §3.17), wired in on 2026-08-19 — five days before the 2026-08-24 pass re-counted the file and still reported two. Confirmed directly by re-reading `createConnectorRegistry.ts` itself, which conditionally registers `test-fixture`, `hubspot`, and `github`. This does not change the YES verdict — GitHub's authorization mechanism is the same caller-agnostic pipeline, and `payments:execute` still has no connector — but it is the second time in this section's history a connector count was asserted without actually re-deriving it from the file, and the miscount stood for a full day of otherwise-careful documentation-currency work. `docs/VERIFICATION-GAPS.md` G-30 has the fuller account of what else this same miscount caused to be missed (§2.22's binding-coverage claim).

## 2.25 Strategic Positioning — Independently Validated, YES (Pass 4)

_Originally at line 991 of `CLAIMS.md`._

**Update (2026-10-03):** "independently" in this section means each pass was run fresh, without relying on the earlier passes' conclusions. All four passes were internal reviews within Parmana's own development process, not an audit by a third party.

## 2.26 Policy Governance (Maker-Checker)

_Originally at line 1009 of `CLAIMS.md`._

**Update (2026-10-15): the startup call now blocks.** The one-time check at startup is no longer fire-and-forget. `server.ts` awaits `assertPolicyGovernanceIntegrityAtStartup()` (`packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts`) before `app.listen()`. The server does not start if an approved policy's live file does not match its approval record (`missing`, `content-mismatch`, `signature-invalid` or `chain-broken`), or if the approval records cannot be listed, so the check cannot run. The process exits with status 1 and logs `policy_governance_integrity_startup_refused`. A database with no approval records still starts. The periodic re-run (`schedulePolicyGovernanceIntegrityCheck`) stays fail-open, so drift found during uptime is logged, not fatal. The one-time startup runner and its test were removed. Tests: `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts` adds three startup cases (clean, missing file, repository unavailable). Scope: this gates the check's result at boot only. A database outage at boot now stops the server until the database is reachable. Status: on branch `claude/startup-integrity-block`, pending merge.

## 2.26 Policy Governance (Maker-Checker)

_Originally at line 1013 of `CLAIMS.md`._

**Update (2026-09-10):** this package was outside the original scope of the audits that produced the claims above, which focused on `packages/api`. A follow-up review covered it directly and found one real gap: `POST /login`, this tool's only unauthenticated route, and the only place in this entire codebase that validates a submitted credential against the real API in a "try a key and see" pattern (the API itself has no equivalent endpoint), had no rate limiting at all. Now rate-limited (`express-rate-limit`, 10 attempts/minute, IP-keyed, constructed per app instance). Everything else reviewed in the same pass (session-fixation hardening, cookie flags, XSS-safe rendering) was already correct, as described above. See `docs/VERIFICATION-GAPS.md` G-47.

## 2.26 Policy Governance (Maker-Checker)

_Originally at line 1076 of `CLAIMS.md`._

**Update (2026-09-28, G-79, D-6):** the check now runs with its secrets, checks every policy file on every push and pull request (`--full-scan`), and is a required status check on `main` (branch protection enabled once the repository was public). A pull request that adds a policy version can merge only after that version is approved in production. Pull requests from forks get no secrets, so they fail the check.

## 2.26 Policy Governance (Maker-Checker)

_Originally at line 1137 of `CLAIMS.md`._

**Update (2026-10-03, follow up):** two approvals of the same pending change at the same moment could both pass the `PENDING_APPROVAL` check and both apply the change. `policy_change_approval_records` now has a unique index on `pending_policy_change_id` (`20261003120000_unique_policy_change_approval_per_pending_change.sql`). The approval record is written before the live policy file, so the second approval's insert fails, the repository answers `409 CONFLICT`, and that approval stops before it touches the policy. The in-memory repository enforces the same rule. Evidence: `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` (two concurrent approvals: one `200`, one `409`, one record), `packages/storage/tests/unit/policy-change-approval-record-one-per-change.test.ts` (3). The index has not been run against a real Postgres in this change.

## 2.26 Policy Governance (Maker-Checker)

_Originally at line 1139 of `CLAIMS.md`._

**Update (2026-10-03, second follow up):** the index above would have trapped a legitimate retry. If an approval wrote its record and then failed (the file write, or marking the change approved), the change stayed `PENDING_APPROVAL` and a retry got `409` forever. Production has one such pair from before this change: pending change `662c9ade…` (`access-control` 1.0.0, 2026-09-16), two records by the same approver with the same content hash, the second chained to the first. `PolicyChangeApprovalService` now reuses the existing record when the same approver retries with the same content, finishes the file write, and returns it; another approver gets `409`. The unique index covers records approved from 2026-10-03 18:18:37 UTC, so the 2026-09-16 pair is kept as signed evidence and the migration applies. Evidence: `packages/api/tests/unit/PolicyChangeApprovalService.test.ts` (2 new: the same approver completes a retry with one record; another approver is refused and nothing is written), `packages/storage/tests/unit/policy-change-approval-record-one-per-change.test.ts` (2 new).

## 2.26 Policy Governance (Maker-Checker)

_Originally at line 1141 of `CLAIMS.md`._

**Update (2026-10-16, proof audit, G-106):** a published policy version is immutable. `FilePolicyRepository.save`
refuses different content for an existing `(name, version)` with `PolicyVersionImmutableError`, and the approval
service refuses it before writing an approval record, so the API returns `409`. Re-saving identical content (an
approved rollback) is allowed. Before this, governance could replace the rules a proof already cited in place.

## 2.27 Policy-Freshness Enforcement at Execution Time

_Originally at line 1152 of `CLAIMS.md`._

**Update (2026-09-20): this check is no longer opt in.** It fails closed by default (see 2.36). `ExecutionGateway` now requires a `PolicyRepository` and a policy approval verifier at construction, and an authorization that carries no `policyContentHash` is rejected with `policyStillCurrent: false` instead of being skipped. The only way to get the earlier "absent means skipped" behavior is the explicit, loudly named `allowUnverifiedPolicy: true` option, which production bootstrap does not set. The replay detection logic (`isSoleFailureNonceReplay`) still treats an undefined check as passing, which is safe because in the default mode every policy check is present and must be true for `valid` to be true.

## 2.28 KeyId-Aware Key Resolution with Expiry/Revocation Checking

_Originally at line 1188 of `CLAIMS.md`._

**Update (2026-09-09):** the verification-side machinery above (`keyProvider`, resolved by `authorization.keyId`) had, until this date, never been exercised by anything but the single shared `"default"` keyId — nothing on the signing side ever produced an authorization carrying a different one. `docs/VERIFICATION-GAPS.md` G-32 found and same-day-closed that gap: `RuntimeAuthorizationSigner` (`packages/runtime/src/RuntimeAuthorizationSigner.ts`) now resolves the signing keyId per-transaction via a new `TenantKeyResolver` (`packages/runtime/src/TenantKeyResolver.ts`), signing under a dedicated `tenant.<tenantId>` key when `transaction.metadata.tenantId` is set and that key has been provisioned (same `FileKeyProvider` layout, `scripts/generate-keypair.ts --key-id tenant.<tenantId>`), and falling back to the shared `"default"` key otherwise. This is opt-in per tenant, not a change to the default (single-key) path: a deployment with no tenant-specific keys provisioned behaves exactly as before. See G-32 for the full fix and its own explicitly-stated residual gaps (manual provisioning only, no KMS/HSM/rotation automation, silent fallback on an unprovisioned tenantId).

## 2.28 KeyId-Aware Key Resolution with Expiry/Revocation Checking

_Originally at line 1190 of `CLAIMS.md`._

**Update (2026-10-03, audit):** the tenant id came from the request body (`metadata.tenantId`) with nothing tying it to the caller, so any authenticated caller could have its authorization signed with another tenant's `tenant.<id>` key. `POST /execute` now refuses a `tenantId` that is not in the API key's new `allowedTenantIds` list (`403 TENANT_NOT_ALLOWED`; unset means none). A request with no tenant id is unaffected. Separately, per tenant keys cannot work under `KEY_PROVIDER=aws-kms`: KMS alias names cannot contain the dot in `alias/tenant.<id>`, so the resolver falls back to `default`. Evidence: `packages/api/tests/integration/caller-capability-scoping.integration.test.ts` (3 new), `packages/shared/tests/unit/config-validation.test.ts` (2 new).

## 2.28 KeyId-Aware Key Resolution with Expiry/Revocation Checking

_Originally at line 1192 of `CLAIMS.md`._

**Update (2026-10-03, follow up):** per tenant keys now resolve to a valid KMS alias. `resolveKmsKeyId` replaces each `.` in a logical key id with `/`, so `tenant.acme` is `alias/tenant/acme`; a logical key id never contains `/`, so two ids cannot map to the same alias. An id that would land under AWS's reserved `alias/aws/` prefix is refused. Not verified against real AWS: the evidence is unit tests and tutorial 113. Evidence: `packages/crypto/tests/unit/kms-signer.test.ts` (2 new), `examples/tutorials/113-kms-key-id-resolution`.

## 2.29 Signal-Freshness Enforcement at Execution Time (G-31)

_Originally at line 1234 of `CLAIMS.md`._

**Update (2026-10-03, follow up):** a request with no `signals` used to skip this check even when the authorization carried a `signalsHash`. It is now checked as `{}`, the value `RuntimeEngine` hashes for a transaction with no signals, so omitting signals passes only against an authorization signed over no signals, and is then still re-verified by the `SignalStateVerifier`. Evidence: `signal-freshness.test.ts` (the two new cases above).

## 2.30 Policy-Authoring and Deployment Observability Warnings

_Originally at line 1256 of `CLAIMS.md`._

**Update (2026-09-09):** the "deliberately warn-only" design above traded false-positive noise for a real cost: running the real `vendor-payment` policy live (Tutorial 105) surfaced the warning, and checking all 10 real policies in `policies/` found every single one had uncovered facts, none reviewed or documented — a warning nobody reviewing a running system would see, indistinguishable from a genuinely forgotten binding. `docs/VERIFICATION-GAPS.md` G-33 found and same-day-closed this: a new `Policy.unboundSignalReasons` field lets a policy author acknowledge, with a specific reason, exactly which facts have no genuine Intent-side equivalent (mirroring `INTENTIONALLY_UNBOUND_CAPABILITIES`'s "reviewed exemption, not silence" pattern, scoped per-policy instead of centralized). `PolicyValidator.validate()` now fails closed — throws for any rule-referenced fact neither bound nor acknowledged — and `PolicyRouter.load()`'s warning is gone, replaced by that throw. All 10 real policies were updated: 8 got per-fact `unboundSignalReasons`, and 2 (`connector-capability`, `customer-refund`) turned out to have a genuinely bindable amount fact that had simply never been bound (`parameters.amount`, the same pattern `vendor-payment` already used) — a real scope-drift gap fixed, not merely documented around. See G-33 for full evidence and the residual (a reason is a documented claim, not a proof that the fact is truly unbindable).

## 2.31 Signed Caller-Capability Claim, Checked at the Connector Layer

_Originally at line 1270 of `CLAIMS.md`._

**Update (Sep 7, 2026, NF-004):** the guarantee this claim describes previously held only for `POST /execute`. `POST /transactions` — a second, independent entry point into the identical `application.execute()` pipeline — performed the same caller-capability admission check (`isCapabilityAllowed()`) but never carried the confirmed capability into `transaction.metadata.grantedCapability`, and only audited denials, never grants. A transaction submitted via `/transactions` therefore signed an authorization missing `grantedCapability` that the equivalent `/execute` submission would have carried. `packages/api/src/routes/transactions.ts` now performs the identical `caller.capability_granted` audit write and `metadata.grantedCapability` assignment `execute.ts` already did, by direct duplication of the existing logic (the surrounding capability-check/audit block was already duplicated between the two routes before this change; a new shared abstraction was deliberately not introduced for a fix this small). New test: `packages/api/tests/integration/caller-auth.integration.test.ts`, `"POST /transactions parity with POST /execute (NF-004)"` — both routes, given the same caller, now produce a response whose `authorization.payload.grantedCapability` equals the executed action, and both emit exactly one `caller.capability_granted` event. Commit `7da8f0d`.

## 2.31 Signed Caller-Capability Claim, Checked at the Connector Layer

_Originally at line 1272 of `CLAIMS.md`._

**Update (2026-09-11, docs/VERIFICATION-GAPS.md gap 50):** the `caller.capability_granted` write NF-004 above describes was, itself, silently impossible against a real Postgres-backed audit sink. `caller_audit_events`'s `type` CHECK constraint — last widened by `20260824090000_add_structural_rejected_to_caller_audit_events.sql` — was never widened again to include `'caller.capability_granted'`, even though both `execute.ts` and `transactions.ts` have written that exact event type unconditionally on every successful, authenticated capability check since before NF-004. Combined with 2.19's fail-closed guarantee (an audit write failure fails the request), this meant **every successful, authenticated `POST /execute` or `POST /transactions` call, in any real deployment with caller-auth enabled and a Postgres-backed `CallerAuditSink`, failed closed with `503 AUDIT_UNAVAILABLE` before Policy Engine evaluation ever ran** — the capability-granted path this section documents was, in that configuration, entirely unreachable. Invisible in the existing test suite because Supabase-backed integration tests are opt-in (`ALLOW_LIVE_SUPABASE=1`); `InMemoryCallerAuditSink` (2.16) has no such constraint to violate. Found and closed by deploying the real API to a real environment (Vercel, real `parmana-sandbox` Supabase project, `PARMANA_AUTH_DISABLED=false`) for the first time and observing the failure live, not by code review. Closed by a new migration, `supabase/migrations/20260911090000_add_capability_granted_to_caller_audit_events.sql`, widening the constraint the same way each of its four prior widenings did. Applied directly to `parmana-sandbox`. Commit `1eb8881` — see `docs/VERIFICATION-GAPS.md`'s new "Gaps closed in the 2026-09-11 real-deployment verification session" table for the full reproduction and fix detail.

## 2.32 Per-Caller Tamper-Evident Chaining on the Caller-Authentication Audit Trail

_Originally at line 1311 of `CLAIMS.md`._

**Update (2026-10-16, proof audit, G-108):** the chain does not detect deleting the newest row for a caller, because
nothing remains after it to break. `CallerAuditChainVerifier.verifyChain(rows, anchor)` now accepts a chain head
recorded outside the database. With that anchor, a chain that no longer ends at the head fails verification. Without
an anchor the limit stands. Publishing the head to an external store is an operator step, not yet done.

## 2.35 Execution-Time Policy Governance Verification (Prevention, Always On Outside Test and Development)

_Originally at line 1384 of `CLAIMS.md`._

**Update (2026-09-16): the precondition above no longer holds, the flag itself is unchanged.** 2.26's "Legacy-policy backfill" entry now shows all 14 real production policies with a genuine, distinct-checker `PolicyChangeApprovalRecord`. The reason the flag was off (zero approval records, an unconditional gate would refuse everything) is gone. `POLICY_EXECUTION_VERIFICATION_ENFORCED` has not been changed and remains `false` in `.env` — turning it on is still a separate, deliberate decision the runbook explicitly reserves for a later, dedicated step (Part 5 of the policy approval runbook, in git history: "Do this only once every policy this deployment actually executes against has been resolved"), not something this pass did as a side effect of closing the backfill.

## 2.35 Execution-Time Policy Governance Verification (Prevention, Always On Outside Test and Development)

_Originally at line 1386 of `CLAIMS.md`._

**Update (2026-09-20): the flag no longer decides production behavior.** `createPolicyExecutionVerifier()` now returns a real verifier everywhere except when `NODE_ENV` is exactly `test` or `development`. In production, or with `NODE_ENV` unset or set to any other value, `POLICY_EXECUTION_VERIFICATION_ENFORCED` is ignored and enforcement is on. The earlier gap, where a production deployment could run with the verifier unconfigured (`policyExecutionVerifierConfigured: false` was observed in the live startup log on 2026-09-20), is closed by removing the opt in. The tradeoff recorded above still applies in one direction: any deployment must have a genuine, signed approval record for every policy it executes against before it goes live, or executions under that policy are refused.

## 2.35 Execution-Time Policy Governance Verification (Prevention, Always On Outside Test and Development)

_Originally at line 1402 of `CLAIMS.md`._

**Update (2026-10-16, proof audit, G-105 and G-103):** governance relaxation (`NODE_ENV` of `test` or `development`)
now also needs an explicit `PARMANA_ALLOW_UNGOVERNED_POLICY=true`. `NODE_ENV` alone no longer disables the
approval-record check. The policy content hash is always required, including in the relaxed mode, since the
production bootstrap no longer sets `allowUnverifiedPolicy`.

## 2.42 Signed Human Approval Declared by Policy, First Used for Large Refunds (Scoped, 2026-09-27)

_Originally at line 1632 of `CLAIMS.md`._

**Update (2026-10-03, follow up):** an approval's `scope.field` was never compared, so an approval scoped to one fact was accepted for another whenever its bound happened to compare true. `ApprovalSignalVerifier` now requires `scope.field` to be `value` when the declaration gives a `value`, and `resourceId` when it does not, the names the TypeScript and Python SDKs and `scripts/sign-approval.ts` already write. `ApprovalVerifier` takes an optional `scopeField`; the HubSpot verifier requires `amountDeltaAbs`. An approval signed with another field name, such as `amount`, is now refused. Evidence: `packages/approval/tests/unit/ApprovalSignalVerifier.test.ts` (4 new), `packages/approval/tests/unit/ApprovalVerifier.test.ts` (1 new).

## 3.1 Non-Bypassable Envelope Verification (Scoped)

_Originally at line 1721 of `CLAIMS.md`._

**Update (2026-10-03):** the claim also assumes Parmana's authorization signing key is not compromised. Whoever holds that key, or can make the signing service sign (under AWS KMS, a process with `kms:Sign` on it), can produce authorizations the verifier accepts. "Not authorized by Parmana" means not signed with that key; it does not mean not approved by policy. See the attacker table in `docs/site/evaluation/audit-guide.mdx`.

## 3.3 Connector SDK Foundation (Scoped)

_Originally at line 1759 of `CLAIMS.md`._

**Update (2026-08-24 documentation-currency pass):** `HttpConnector`, `SdkConnectorExecutor`, and `CapabilityConnectorPolicy` no longer live in `packages/connector-sdk/src` — all three moved to `packages/execution-gateway` during the Phase 1C execution-ownership refactor (the same refactor §3.10's own "Update (execution-ownership refactor, Phase 1C)" paragraph documents for the HubSpot connector; this section was never given the equivalent update at the time). Current locations: `packages/execution-gateway/src/HttpConnector.ts`, `packages/execution-gateway/src/connector-execution/SdkConnectorExecutor.ts`, `packages/execution-gateway/src/connector-runtime/CapabilityConnectorPolicy.ts`. The previously-cited "45 tests" count was also stale — `packages/connector-sdk/tests/unit` now holds 4 files / 32 tests (re-run and confirmed); the HttpConnector-timeout, end-to-end Gateway integration, and Trust Record hash-boundary regression tests this section originally described moved to `packages/execution-gateway/tests` along with the classes they exercise.

## 3.10 HubSpot Deal Stage/Amount Update Connector (Scoped)

_Originally at line 1829 of `CLAIMS.md`._

**Update (execution-ownership refactor, Phase 1C):** `HubSpotConnector`'s executable class -- including the property allowlist guard and the placeholder-credential guard both described above -- was migrated verbatim to `GatewayHubSpotAdapter` (`packages/execution-gateway/src/connector-execution/GatewayHubSpotAdapter.ts`), mirroring 3.4's identical Razorpay migration exactly (same commit, same "migrated verbatim... only the executable class moved" pattern). `HubSpotDealUpdateService` and `HubSpotDealUpdateHarness` no longer exist anywhere in the repository; capability identifiers and DTOs (`HubSpotCapabilities.ts`, `HubSpotTypes.ts`) stayed in `@parmana/connector-hubspot` and are imported into the adapter. `MockHubSpotServer.ts` is unchanged at its original path.

## 3.10 HubSpot Deal Stage/Amount Update Connector (Scoped)

_Originally at line 1844 of `CLAIMS.md`._

**Update (TD-23, Phase 3C, now closed):** `preAuthorizedForAmountChange` is no longer trusted verbatim. `HubSpotSignalStateVerifier` (`packages/connector-hubspot/src/HubSpotSignalStateVerifier.ts`), constructed with a real `ApprovalVerifier` (`@parmana/approval`) unconditionally in `packages/api/src/bootstrap/createHubSpotSignalStateVerifier.ts` (that file's own comment: "approvalVerifier is always supplied here (never omitted) -- the production wiring path is where independent verification... becomes a structural invariant rather than an optional, caller-declared signal"), verifies a caller's `preAuthorizedForAmountChange: true` claim against a real, independently-issued, Ed25519-signed Approval Artifact (`SignedApproval`, the Phase 3A approval artifact design, in git history) carried in `signals.approvalArtifact` -- checking issuer identity against a registry, signature validity, expiry, capability/resource scope match, and single-use nonce consumption (`ApprovalVerifier.verify`, `packages/approval/src/ApprovalVerifier.ts`), all before the declared value is trusted. A missing, expired, wrong-scope, replayed, or unsigned artifact is treated as `preAuthorizedForAmountChange: false` regardless of what the caller declared. This closes the gap the Phase 2L authorization exceptions record (in git history) independently re-confirmed still open as of that phase.

## 3.10 HubSpot Deal Stage/Amount Update Connector (Scoped)

_Originally at line 1846 of `CLAIMS.md`._

**Update (2026-09-28, checked in code):** the list is no longer empty. It holds one entry, `manager-charak1987` (key `manager-charak1987-key-1`), added by commit `8c48ad9` for refund approvals; the paragraph below describes the state before that.

## 3.10 HubSpot Deal Stage/Amount Update Connector (Scoped)

_Originally at line 1862 of `CLAIMS.md`._

**Update (SDK dogfooding pass): the live suite now drives every request through the real, published `@parmana/sdk` package, not `supertest`.** Until this pass, this suite — like every other test in this repository — talked to `POST /execute` either via `supertest` against an in-process Express `app` object or a direct `fetch`, never through either maintained SDK's own client. Neither SDK's correctness against a real running server had ever actually been exercised this way; both were verified only by their own dedicated SDK test suites, never by anything else in this codebase actually consuming them. This is the one gated live suite this pass rewrote (HubSpot chosen over Razorpay specifically to avoid combining a real refactor with real-money risk; Razorpay's live suite is unchanged).

## 3.10 HubSpot Deal Stage/Amount Update Connector (Scoped)

_Originally at line 1892 of `CLAIMS.md`._

**Update (Phase 3D certification follow-up):** `redactHubSpotToken` (`HubSpotTypes.ts`) no longer truncates the literal Private App token (previously: first 12 characters plus an ellipsis — for HubSpot the bearer token _is_ the entire credential, so this was a genuine fragment of the actual secret). It now returns a one-way, truncated SHA-256 fingerprint (`fp_` + 12 hex chars), preserving the operational "same token used across these executions" signal with zero credential bytes reaching `ConnectorResponse.metadata`, the Trust Record, or the `POST /execute` response body. `hubspot-connector.test.ts`'s redaction test now asserts the response body contains no substring of the token at all.

## 3.10 HubSpot Deal Stage/Amount Update Connector (Scoped)

_Originally at line 1894 of `CLAIMS.md`._

**Update (GitHub connector, §3.17):** the credential-isolation pattern this section describes — provider-resolved, `execute()`-scoped-local, redacted to a one-way fingerprint before it can reach any response or audit record, zero external API calls on policy denial — is no longer HubSpot-specific. §3.17 proves the identical guarantee for `@parmana/connector-github`'s structurally different, ephemeral (per-execution-minted, never cached) credential model, evidence that this pattern is foundational to Parmana's connector architecture rather than a property of any one connector's implementation.

## 3.13 Hybrid (Ed25519 + ML-DSA-65) Signing Capability (Scoped)

_Originally at line 1958 of `CLAIMS.md`._

**Update (2026-10-03, audit):** "the first time hybrid signing is attempted" was after the action had been released, so a missing key meant a released action with no Trust Record. The server now refuses to start in `CRYPTO_MODE=hybrid` unless every key pair the hybrid path reads is present (`assertSigningKeyMaterialConfigured`). It also refuses `CRYPTO_MODE=hybrid` with `KEY_PROVIDER=aws-kms`: both entries of the hybrid `signatures` array are signed with local key files, the Ed25519 one included, and under KMS that key has no local file. Evidence: `packages/api/tests/unit/bootstrap/assert-signing-key-material-configured.test.ts` (3 new cases).

## 3.13 Hybrid (Ed25519 + ML-DSA-65) Signing Capability (Scoped)

_Originally at line 1962 of `CLAIMS.md`._

**Update (2026-10-03):** the caveat above is resolved for the separately published verifier and later (3.12): `verifyExecutionTrustRecordOffline` checks every entry in the `signatures` array as well as the legacy field, and reports `hybridSignaturesValid` separately, so a third party can confirm the full hybrid guarantee through the public package. Earlier versions of the separately published verifier still check the legacy field only.

## 3.14 Per-Caller Rate Limiting on `/execute` (Scoped)

_Originally at line 2005 of `CLAIMS.md`._

**Update (2026-09-10):** the fleet-wide scope gap this claim's own "Scope, precisely" paragraph named above is now closable. New `PostgresRateLimitStore` (`packages/storage/src/postgres/PostgresRateLimitStore.ts`), a real `express-rate-limit` `Store` backed by an atomic `INSERT ... ON CONFLICT` upsert against a new `rate_limit_counters` table (`supabase/migrations/20260910120000_add_rate_limit_counters.sql`). `createRateLimitStore.ts` wires it in when `DATABASE_URL` is configured -- both limiters then share counts fleet-wide, closing the `limitPerMinute * machineCount` gap for any deployment that scales past one machine. Deliberately not fail-closed the way `NonceStore`'s `DATABASE_URL` requirement is: without a configured database, both limiters fall back to the in-process default with a loud startup warning rather than refusing to start, since a looser-than-configured capacity ceiling is not the same class of gap as a missing security check. See `docs/VERIFICATION-GAPS.md` G-41. This deployment's current shape (`fly.toml`'s `min_machines_running = 1`) means the gap this update closes was not yet live-exploitable here, but the fix removes the blocker to scaling out.

## 3.14 Per-Caller Rate Limiting on `/execute` (Scoped)

_Originally at line 2012 of `CLAIMS.md`._

**Update (2026-09-28, G-78):** a third limiter, keyed by IP address, covers the unauthenticated routes that do work: `POST /refusal/verify`, `POST /execution-intents/verify` and `POST /audit/verify` (signature checks) and `/handbook` (a database write), one shared counter, `RATE_LIMIT_PUBLIC_PER_MINUTE`, default 60, with its own `public:` Postgres store when `DATABASE_URL` is set. Static documentation and key discovery (`/keys`, `/.well-known/jwks.json`) are not limited. Evidence: `createPublicRateLimiter` in `packages/api/src/middleware/rate-limit.ts`, `packages/api/tests/integration/rate-limit.integration.test.ts` (3 new: over the limit is `429` before the route runs; one counter across the four routes; it does not count against `/health`). The effective limit behind Vercel depends on how the platform reports client addresses (`trust proxy` is one hop), which was not checked live.

## 3.14 Per-Caller Rate Limiting on `/execute` (Scoped)

_Originally at line 2014 of `CLAIMS.md`._

**Update (2026-10-03, audit):** the G-78 limiter above did not cover two unauthenticated paths that do work. Every request with a missing or invalid API key, on any authenticated route, writes a signed `caller.rejected` audit event (a KMS Sign call in production) before answering `401`, with no limit, so anyone could spend the signing capacity real requests need. A fourth limiter, keyed by IP address and mounted in front of caller authentication, now counts only `401` responses (`createAuthFailureRateLimiter`, `RATE_LIMIT_AUTH_FAILURE_PER_MINUTE`, default 30, its own `auth-failure:` Postgres store when `DATABASE_URL` is set); a request with a valid key is not counted. Key discovery (`GET /keys/:keyId`, `GET /.well-known/jwks.json`), which makes KMS calls per request in production, now shares the public limiter. Evidence: `packages/api/tests/integration/rate-limit.integration.test.ts` (4 new: bad keys over the limit get `429` and stop writing `caller.rejected`; valid keys do not count; `GET /keys/:keyId` over the public limit gets `429`; the public limiter does not count authenticated routes).

## 3.14 Per-Caller Rate Limiting on `/execute` (Scoped)

_Originally at line 2016 of `CLAIMS.md`._

**Update (2026-10-03, follow up):** `KmsSigner` now caches successful `GetPublicKey` and `DescribeKey` answers in memory for 5 minutes, by region and alias, shared across signer instances in one process, so repeated key discovery and verification no longer cost a KMS call each. Concurrent lookups of one key share a call; a missing key or a failed call is never cached; `Sign` is never cached. Evidence: `packages/crypto/tests/unit/kms-signer.test.ts` (5 new).
---

## 3.22 Paytm Refund Connector: Remote, Out-of-Process Execution (Scoped)

_Originally at line 2251 of `CLAIMS.md`._

**Update (2026-09-27):** `paytm:refund` is now bound to `customer-refund` 1.1.0, and `managerApproved` is verified against a signed approval (2.42). The scenarios above that used 1.0.0 were moved to 1.1.0 in the same test file. `refundEligible` and `fraudCheckPassed` are still not re-derived.

## 3.23 Listed as a TRACE External Evidence Source in the AgenTrust Integrations Repository (Scoped, 2026-10-12)

_Originally at line 2276 of `CLAIMS.md`._

**Update (2026-10-13): Verified tier requested, not granted.** A follow-up PR from branch `parmana-verified` asks the
AgenTrust maintainers for the Verified tier, which they grant only after running an integration end to end against
released packages. It pins the released `parmana` SDK 1.6.0 (was 1.5.0) and adds exact reproduction steps; no code
changed. Run by us on a clean environment with released packages only: `references.json` reproduced byte for byte,
18 tests passed. Until a maintainer sets the tier, the listing stays `community`, and nothing here claims Verified.

## 3.23 Listed as a TRACE External Evidence Source in the AgenTrust Integrations Repository (Scoped, 2026-10-12)

_Originally at line 2282 of `CLAIMS.md`._

**Update (2026-10-14): independently reproduced, tier change pending.** On the Verified request
([agentrust-io/integrations#313](https://github.com/agentrust-io/integrations/pull/313)), an AgenTrust maintainer approved
and reported reproducing it at `80c3a92` in a clean environment with the released `parmana` 1.6.0 and
`agentrust-trace` 0.11.0: `emit_references.py` printed the four references, `references.json` regenerated byte for
byte, and 18 tests passed. The maintainer stated that the tier change follows in a separate maintainer PR. Until that
PR is merged, the tier is `community`, and nothing here claims Verified. #313 itself was merged into AgenTrust's `main` as `1aac6c8` on 2026-10-14, still at tier `community`.

## 3.23 Listed as a TRACE External Evidence Source in the AgenTrust Integrations Repository (Scoped, 2026-10-12)

_Originally at line 2289 of `CLAIMS.md`._

**Update (2026-10-29): Verified tier, scoped.** AgenTrust's `main` now sets `tier: verified` in
`integrations/parmana-server/integration.yaml`, read on 2026-10-29. The integration's README scopes that tier to the
offline fixture path: every connector result is a mock, `refundEligible` and `fraudCheckPassed` are declared by the
caller, and no conformance level is claimed. The earlier `community` entries above are the record at their dates.
