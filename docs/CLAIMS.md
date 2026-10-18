# Parmana Technical Claims

Version: 1.0

Status: Public

---

# Key Compromise Notice

The default signing key (`keys/default.private.pem` / `keys/default.public.pem`) was publicly exposed in a Parmana Systems GitHub repository prior to 2026-07-05 (incident record: `04-INCIDENTS-LOG.md`, INC-1). This repository's own commit history does not carry that exposure (no `.pem` private key was ever committed here), but the key itself must still be treated as permanently compromised regardless of which repository exposed it.

All signatures produced by that key are void for authenticity purposes, regardless of when the signed artifact was created.

The key pair was rotated on 2026-07-05.

---

> Building a new connector? Read [BUILDING_A_CONNECTOR.md](./connectors/BUILDING_A_CONNECTOR.md) first: the files to add, credential guards, bound signals, test order and reversible live tests.

---

# 1. Core Positioning

## Category

Parmana is **Execution Trust Infrastructure**.

## Mission

Trust in what an AI agent did should not have to rest on hoping it behaved. It should be a verifiable record. Parmana establishes that record through an explicit chain: authorize, verify, execute, confirm, connecting business authorization, policy evaluation, runtime execution, and execution evidence.

## Value Proposition

Parmana enables organizations to verify what automated systems executed, not simply trust that they executed correctly.

No AI agent action is authorized without a signed approval from a trusted person, reads included (2.47).

---

# Purpose

This document defines the public technical claims that Parmana makes about its architecture and capabilities: the authorize → verify → execute → confirm chain above, made specific and checkable.

Claims are categorized according to the level of implementation evidence available.

A technical claim SHOULD be promoted only when supported by:

- implementation

- automated tests

- audit evidence

- documented proofs

- independent verification (where applicable)

---

# 2. Supported Technical Claims

The following claims are supported by the current implementation and architecture.

---

## 2.1 Trusted Business Transactions

Parmana validates Business Transactions before execution.

Business Transactions are checked for internal trust-chain consistency before entering the runtime.

Evidence

- BusinessTransactionValidator (`packages/runtime/src/validators/BusinessTransactionValidator.ts`)

---

## 2.2 Deterministic Policy Selection

Parmana executes exactly one explicitly referenced business policy.

The runtime loads the policy identified by the Business Transaction and validates its identity before evaluation.

The runtime does not:

- discover policies

- negotiate policies

- automatically select the latest version

- substitute alternative policies

A Business Transaction referencing a `(name, version)` pair with no corresponding file fails closed: `FilePolicyRepository.load` throws `PolicyNotFoundError` (distinct from `PolicyValidationError`/`SignalValidationError`, which map to `400`), the error handler maps it to `404`, and no policy evaluation, connector dispatch, or Refusal Record write occurs — there is no fallback to a default or most-recent version.

Evidence

- PolicyRouter

- PolicyValidator

- `packages/policy/src/FilePolicyRepository.ts` (`PolicyNotFoundError`), `packages/api/src/middleware/error-handler.ts` (maps to `404`)

- `packages/api/tests/unit/execute-api.test.ts`: `"returns 404 when the referenced policy does not exist (PolicyNotFoundError)"`

---

## 2.3 Deterministic Policy Evaluation

Parmana deterministically evaluates business policies using sequential rule evaluation with first-match semantics.

Evaluation records include:

- matched rule

- decision reason

- evaluation trace

Evidence

- PolicyEngine (`packages/policy/src/PolicyEngine.ts`)

---

## 2.4 Authorized Execution

Parmana prevents execution when required trust artifacts are missing or when the decision outcome is not approved.

Evidence

- TrustChainValidationComponent

- RuntimeEngine (`packages/runtime/src/RuntimeEngine.ts`)

---

## 2.5 Verifiable Execution Evidence

Parmana generates cryptographically verifiable execution evidence.

Execution produces:

- Execution Trust Records

- Canonical Trust Record hashes

- Signed Receipts

Evidence

- BusinessTrustRecordBuilder (renamed from ExecutionTrustRecordBuilder)

- ExecutionComponent, ExecutionEvidenceBuilder (packages/runtime/src/{components/ExecutionComponent,ExecutionEvidenceBuilder}.ts) — the live pipeline stage that builds and attaches ExecutionEvidence to every Execution, called by RuntimeFactory-constructed Runtimes; not to be confused with ExecutionEvidenceComponent, a same-named-in-spirit stub confirmed unwired and deleted (docs/VERIFICATION-GAPS.md G-26)

- ReceiptService (packages/runtime/src/services/receipt-service.ts), called directly by ExecutionTrustApplication.execute() on every successful execution

- VerificationCrypto

- ReceiptCrypto

- packages/runtime/tests/integration/receipt.integration.test.ts, receipt-hybrid.integration.test.ts

**Structured decision trace (2026-09-15, docs/VERIFICATION-GAPS.md G-44).** The signed
evidence above now records _how_ a decision was reached, not only _that_ it was and _why_ as
free text. `PolicyEngine.evaluate()` computes `matchedRuleId`, `evaluatedRules`, and
`matchedPath` (the complete ordered rule-id trace) as part of its `PolicyDecision`
(packages/policy/src/PolicyEngine.ts); `DecisionBuilder.build()`
(packages/runtime/src/DecisionBuilder.ts) now carries all three through, verbatim, into the
`Decision` that actually gets signed and persisted (packages/shared/src/domain/decision.ts) —
previously it carried forward only `outcome` and `reason`, dropping the structured trace
before it reached any durable artifact. Optional fields, same pattern as
`PolicyReference.contentHash` (G-24): absent only on a `Decision` built before this field
existed, never a breaking change. Mirrored into the TypeScript SDK model, the JSON schema, and
the generated Python SDK model. Found and fixed same day by an independent read-only audit,
(the 2026-09-15 evidence anchor audit, GAP-2; in git history); verified via
packages/runtime/tests/unit/DecisionBuilder.test.ts and a real live execution against a
locally-running instance (see docs/VERIFICATION-GAPS.md G-44).

**Vendor-confirmation visibility (2026-09-15, docs/VERIFICATION-GAPS.md G-46).**
`ConnectorEvidence` (packages/execution-gateway/src/connector-execution/ConnectorEvidence.ts)
gained `vendorConfirmationVerified: boolean`, defaulting to `false` and folded into
`connectorEvidenceHash`. Confirmed by grep before adding it: none of this codebase's four
connectors (HubSpot, GitHub, Slack, Paytm) independently verify a vendor-originated
cryptographic confirmation — for Paytm, that verification lives entirely in the separate
`parmana-paytm-agent` repository (§3.22 below). This makes that architectural limitation
visible in every piece of evidence itself, not only in prose documentation, and gives a future
connector that does add real vendor-signature verification somewhere to record it. Found and
fixed same day by the same audit (GAP-3); verified via
packages/execution-gateway/tests/unit/evidence-hashing.test.ts and a real live execution.

---

## 2.6 Independent Verification

Parmana supports independent verification of execution evidence.

Verification confirms execution integrity using the generated execution artifacts.

Evidence

- packages/runtime/src/services/verification-service.ts

- packages/runtime/tests/unit/verification-service.test.ts

- VerificationCrypto

---

## 2.7 Replay Support

Parmana supports replay of recorded execution decisions for verification and analysis, via the standalone `@parmana/replay` package (`ReplayEngine`), which re-evaluates a recorded policy decision against its recorded signals and reports whether the outcome matches.

**Scope note (independently verified, Phase 2G):** this is a package-level capability, not yet wired into the HTTP API. `POST /replay` exists and returns 200, but its actual implementation (`ExecutionTrustApplication.replay()`) performs a signature/hash recheck of the stored Trust Record — the same category of check as `/verify` — not a call into `@parmana/replay`. Both behaviors are real and tested; they are simply two different things sharing the word "replay." See `docs/site/replay/overview.mdx` for the full disambiguation and the Phase 2G replay semantics record (in git history) for the independent verification, call graphs, and regression tests establishing this as the current, intentional, and separately production-contracted (both SDKs are typed against `POST /replay`'s current response shape) behavior — not an unwired bug awaiting a fix.

Evidence

- Replay package (packages/replay/src/ReplayEngine.ts)

- the Phase 2G replay semantics record (in git history)

---

## 2.8 Signed, Single-Use, Time-Bounded Execution Authorization

Every approved execution request carries a cryptographically signed Execution Authorization scoped to one decision, bound to a single-use nonce, and valid only within a bounded time window (Ed25519 by default; ML-DSA-65 / FIPS 204 configurable via SIGNATURE_PROVIDER).

Evidence

- AuthorizationSigner

- AuthorizationVerifier

- EnvelopeVerifier

- MemoryNonceStore

- packages/crypto/tests/unit/authorization-envelope.test.ts

- packages/envelope-verifier/tests/unit/envelope-verifier.test.ts

---

## 2.9 Independent Envelope Verification

A receiving system independently verifies that Parmana authorized an execution request without trusting Parmana's runtime process or its database. Verification requires only Parmana's public key and the envelope itself.

Evidence

- @parmana/envelope-verifier (EnvelopeVerifier, requireParmanaAuthorization)

- packages/envelope-verifier/README.md ("Claims" section)

---

## 2.10 Rejection of Forged, Tampered, Expired, and Replayed Authorizations

The receiving system rejects a forged signature, a tampered payload, an expired envelope, and a replayed (previously accepted) envelope. Replay protection is scoped to whichever NonceStore instance performs the check; see 3.2 below.

Evidence

- packages/envelope-verifier/tests/unit/envelope-verifier.test.ts: "a forged envelope does not burn the nonce", "an expired envelope does not burn the nonce", "rejects a second use of the same nonce", "treats the exact expiresAt instant as expired (boundary is exclusive, not inclusive)", "under two concurrent verify() calls with one nonce, exactly one succeeds (deterministic, not flaky)"

---

## 2.11 Trust Record Bound to Its Authorization

The Execution Trust Record's authorizationId is part of the canonical content that is hashed and signed, not merely attached alongside it. Tampering with it changes the recomputed Trust Record hash.

Evidence

- BusinessTrustRecordBuilder (renamed from ExecutionTrustRecordBuilder)

- packages/runtime/tests/unit/execution-authorization-wiring.test.ts: "trust record references the authorization"

---

## 2.12 Fail-Closed Authorization on Rejection

A rejected Decision never produces a Signed Execution Authorization.

Evidence

- RuntimeEngine (authorization signing occurs only after executionGate.enforce() approves the Decision)

- packages/runtime/tests/unit/execution-authorization-wiring.test.ts: "rejected transaction produces no authorization"

---

## 2.13 Key/Algorithm Binding Guard

Signing or verifying with key material of the wrong type (for example, an Ed25519 key against the configured ML-DSA-65 provider, or vice versa) fails closed with a clear error naming both the expected and actual key type, rather than silently dispatching on the key's own type.

Evidence

- assertKeyType (used by Ed25519SignatureProvider and Dilithium3SignatureProvider)

- packages/crypto/tests/unit/signature-provider.test.ts

- examples/tutorials/99-key-algorithm-binding-guard/run.ts (runnable narrative: both mismatch directions, plus a correctly matched key still working)

---

## 2.14 Configurable Post-Quantum Signing (ML-DSA-65)

Post-quantum signing (ML-DSA-65, FIPS 204, historically referred to in this codebase as "dilithium3") is selectable via SIGNATURE_PROVIDER, using the same PEM-based persistent key mechanism as the default Ed25519 provider (FileKeyProvider, keyId "default"). Requires Node >= 24 for native node:crypto ml-dsa-65 support. Selecting it with missing or mismatched key material fails closed rather than silently regenerating or substituting different keys.

**Update (2026-09-09):** `SIGNATURE_PROVIDER`/`PRIMARY_SIGNATURE_PROVIDER`/`SECONDARY_SIGNATURE_PROVIDER` now also accept `ml-dsa-65` as an input alias for `dilithium3` (`parseSignatureAlgorithm`, `packages/shared/src/config/ConfigValidation.ts`), resolved to the same canonical `dilithium3` identifier before validation. Additive only: an existing `dilithium3`-configured deployment is completely unaffected — the internal identifier is not renamed, only a second accepted spelling was added, so a new deployment can use the accurate NIST/FIPS 204 name without anyone reverting or migrating anything. The two `scripts/generate-keypair.ts` CLIs (`--algorithm`) accept the same alias, normalized to `dilithium3` before generating a key, for the identical reason. A production-readiness audit on 2026-09-09 had concluded a literal rename would be a regression (breaking existing `dilithium3`-configured deployments for no externally-visible benefit, since the docs already disclose the naming history) — this alias is the corrected, non-breaking version of that request.

**Crypto-agility, demonstrated independently of hybrid signing (3.13):** the same canonical record (via `CanonicalSerializer`, the same serialization every Parmana signing path uses) can be signed and verified by Ed25519 and by ML-DSA-65 as two entirely separate, single-algorithm operations — each against its own freshly generated key pair, with no `CRYPTO_MODE` or hybrid envelope involved. This is a standalone runnable proof (`packages/crypto/examples/crypto-agility-proof.ts`, run via `npx tsx packages/crypto/examples/crypto-agility-proof.ts`), not a unit test, written to make the claim directly checkable by hand. Measured 2026-08-25: `dilithium3-signature-provider.test.ts` 4/4 passing (6/6 including the related `dilithium3-cross-instance.test.ts`); full repository suite 1274 passed, 37 skipped, 0 failed. (Run of 2026-08-25; its record is in git history.)

Evidence

- Dilithium3SignatureProvider

- FileKeyProvider

- generate-keypair.ts (--algorithm dilithium3)

- packages/crypto/tests/unit/dilithium3-signature-provider.test.ts

- packages/crypto/tests/unit/dilithium3-cross-instance.test.ts

- packages/crypto/examples/crypto-agility-proof.ts

**Update (2026-09-11, PQC production-readiness audit remediation):** a same-day audit scoped specifically to whether this cryptographic evidence is independently verifiable by third parties (regulators, auditors) found and closed four real gaps, none of which change anything described above -- this claim's own content is unaffected. Summarized here; full detail in `docs/VERIFICATION-GAPS.md`'s "Gaps closed in the 2026-09-11 PQC production-readiness audit remediation" table (gaps 51-54): (1) no standalone offline verifier existed anywhere in this repository -- new `packages/crypto/src/OfflineVerifier.ts` and a Python counterpart, cross-language determinism proven by spawning the real TypeScript signer and verifying its output independently in Python; (2) no public-key discovery endpoint existed -- new `GET /keys/:keyId` and `GET /.well-known/jwks.json`; (3) `VerificationCrypto`/`RefusalCrypto`/`AuditEventCrypto` had no way to rotate their signing keyId without breaking every previously-issued signature -- new `PARMANA_VERIFICATION_KEY_ID`/`PARMANA_VERIFICATION_SECONDARY_KEY_ID`, mirroring the existing `PARMANA_GATEWAY_KEY_ID` precedent; (4) a genuinely hybrid-signed record's ML-DSA-65 signature could be silently stripped with no detection -- new opt-in `HYBRID_SIGNATURE_REQUIRED` policy flag. All four fixes are additive; not one already-issued signature is affected by any of them.

---

## 2.15 Authorization-Binding Verification

Every APPROVED execution in a verified Execution Trust Record must carry a non-empty authorizationId in its metadata; absence fails verification and names the execution. REJECTED-decision executions are not required to carry one. All checks (integrity, signature, authorization binding) run unconditionally and independently: a single failure never suppresses reporting of the others.

Evidence

- VerificationService (packages/runtime/src/services/verification-service.ts)

- packages/runtime/tests/unit/verification-service.test.ts: all 8 cases

- packages/runtime/tests/unit/verification-negative.test.ts: always-running, in-memory: fails on a mutated transaction payload field, a mutated signature value, and a mutated executions hash-chain-array element

- packages/api/tests/integration/verification-negative.integration.test.ts: "reports FAILED when the persisted record is tampered after execution" (additional citation; Supabase-gated, does not run without live credentials)

---

## 2.16 Caller Authentication at the API Boundary

Every route except `/health`, `/ready`, `/openapi.yaml`, `/documentation`, `POST /refusal/verify`, and `POST /audit/verify` requires a valid caller credential (`packages/api/src/app.ts`). The first four are liveness/readiness probes and API documentation; the last two are deliberately unauthenticated, independently third-party-verifiable signature-verification capabilities (RFC-0021 Refusal Record verification and caller-audit/webhook-audit signature verification, see 3.11), not routes that expose any caller's data. createApp's callerAuth option is mandatory: it accepts either an authenticator/auditSink pair or the literal string "disabled", so every call site states its choice explicitly; there is no default that silently mounts the API with no caller authentication. Production (server.ts) refuses to start with PARMANA_AUTH_DISABLED unset and no PARMANA_API_KEYS configured (2.17). A key valid for one caller does not grant a different caller's identity, and every accept/reject outcome is audited without ever recording the raw key. In production, that audit trail is durable (see 3.2's sibling claim for the NonceStore side of the same fix), backed by Supabase and shared across every process, not scoped to one process's uptime; `createCallerAuditSink.ts` fails closed at startup if `DATABASE_URL` is not configured (a documented, temporary substitute for a direct Supabase-configuration check — see `createCallerAuditSink.ts`'s own comment, pending resolution of Supabase ticket SU-437429 — that still points at the same underlying Supabase Postgres instance in this deployment). `InMemoryCallerAuditSink` remains available and correct for tests (NODE_ENV=test).

**Precise scope of `PARMANA_AUTH_DISABLED=true` (docs/VERIFICATION-GAPS.md G-28):** this flag, when explicitly opted into, removes _caller identity and accountability only_ — `RuntimeEngine`, `PolicyEngine`, `CapabilityPolicyBinder`, `SignalIntentBinder`, and every `SignalStateVerifier` never read the caller-auth middleware's output at all (confirmed by direct grep: zero references to caller identity anywhere in those files), so _action-level authorization_ (whether a specific `razorpay:refund-create`/`hubspot:deal-update` request is itself authorized) remains fully enforced regardless of this flag. It does not disable the authorization boundary this document's other claims describe; it disables knowing who asked.

**Update (2026-09-10):** `.env.example` shipped `PARMANA_AUTH_DISABLED=true` uncommented, so a first-time operator copying it to `.env` without reading every line would deploy with caller authentication off, discoverable only via the startup `console.warn`, easy to miss in a log-aggregation tool after the fact. The example file's line is now commented out (the code's own default remains `"false"`, unchanged). `GET /ready`'s JSON response now also carries `authDisabled: true` (plus a `warning` string) whenever this flag is set, alongside the existing log line. This gives an operator's own monitoring/synthetic checks, already polling this endpoint every 30s per `fly.toml`, a field to assert and alert on directly. See `docs/VERIFICATION-GAPS.md` G-43.

Evidence (update)

- `.env.example`, `packages/api/src/routes/ready.ts`
- `packages/api/tests/unit/routes/ready.test.ts`: 2 new cases (`authDisabled: true` with a warning when caller-auth is disabled; `authDisabled: false`, no `warning` key, when enabled)

Evidence

- packages/api/src/app.ts (CallerAuthOption: "disabled" | { authenticator, auditSink }, required, no default)

- packages/api/src/bootstrap/createCallerAuthenticator.ts

- packages/api/src/bootstrap/createCallerAuditSink.ts (production wiring; fails closed when DATABASE_URL is not configured, via assertDatabaseUrlConfigured.ts)

- packages/api/src/auth/StaticKeyAuthenticator.ts

- packages/api/src/auth/SupabaseCallerAuditSink.ts / InMemoryCallerAuditSink.ts

- packages/api/tests/integration/supabase-caller-audit-sink.integration.test.ts: a recorded event is read back through a second, independent client

- packages/api/tests/integration/caller-auth.integration.test.ts (valid/missing/invalid credential, scoping and revocation, audit trail content never contains the raw key, composition with policy evaluation, full route inventory)

- packages/api/tests/unit/bootstrap/create-caller-authenticator.test.ts

---

## 2.17 Fail-Closed Startup Configuration Validation

Parmana refuses to start rather than let missing required configuration surface later as an unstructured runtime error. This applies to caller authentication keys (PARMANA_API_KEYS, unless PARMANA_AUTH_DISABLED=true is set explicitly), the policy directory (PARMANA_POLICY_DIR), and, in production wiring, the durable NonceStore and CallerAuditSink's DATABASE_URL configuration alike: all fail at startup with an error naming the missing variable, rather than PARMANA_POLICY_DIR surfacing as an unhandled ERR_INVALID_ARG_TYPE inside FilePolicyRepository.load at request time, or a NonceStore/CallerAuditSink silently degrading to an in-memory implementation.

Evidence

- packages/api/src/bootstrap/createCallerAuthenticator.ts

- packages/shared/src/config/Config.ts (requirePolicyDirectory)

- packages/api/src/bootstrap/assertDatabaseUrlConfigured.ts, used by createNonceStore.ts and createCallerAuditSink.ts (a documented, temporary substitute for the Supabase-specific assertSupabaseConfigured.ts, pending resolution of Supabase ticket SU-437429 — see each factory's own comment)

- packages/shared/tests/unit/config.test.ts: "refuses to start when PARMANA_POLICY_DIR is unset", "refuses to start when PARMANA_POLICY_DIR is blank"

- packages/api/tests/unit/bootstrap/create-caller-authenticator.test.ts

- packages/api/tests/unit/bootstrap/create-nonce-store.test.ts, create-caller-audit-sink.test.ts: "(G-13) fails closed with a named, actionable error when NODE_ENV is not test and DATABASE_URL is not configured", "never silently falls back" to the in-memory implementation

---

## 2.18 Key Provider Input Validation

FileKeyProvider rejects any keyId that does not match ^[A-Za-z0-9._-]+$ before constructing a filesystem path from it, closing the path-traversal surface a crafted keyId (for example, containing "../") would otherwise open against the configured key directory.

Evidence

- packages/crypto/src/providers/key/FileKeyProvider.ts (assertValidKeyId)

- packages/crypto/tests/unit/file-key-provider.test.ts: rejects a path-traversal keyId in getPrivateKey, getPublicKey, hasKey, and getMetadata

**Update (2026-09-10):** a separate, previously-unclosed gap in the same area: `KEY_PROVIDER` accepted `aws-kms`, `azure-key-vault`, `gcp-kms`, and `hsm` as valid config values (`packages/shared/src/config/KeyProviders.ts`), each parsed and validated cleanly, but `KeyBootstrap.create()` (`packages/crypto/src/KeyBootstrap.ts`) always constructed `FileKeyProvider` regardless of the configured value -- an operator setting `KEY_PROVIDER=aws-kms`, expecting real KMS custody, got private-key-on-disk instead, with no error at any point. `docs/VERIFICATION-GAPS.md` G-40 closed this: `KeyBootstrap.create()` now throws at startup for any value other than `"local"`, naming the configured value and stating plainly that only `FileKeyProvider` is implemented -- turning the misconfiguration from a silent, false sense of custody into an immediate, actionable startup error. No real cloud KMS/HSM provider exists yet; this closes the silent-fallback failure mode, not the absence of those providers themselves.

**Update (2026-09-15):** the "no real cloud KMS/HSM provider exists yet" statement above is now out of date for AWS KMS specifically. `SignerBootstrap.create()` (`packages/crypto/src/SignerBootstrap.ts`, a sibling composition root to the still-unchanged `KeyBootstrap.create()` this entry describes) now resolves a real `KmsSigner` (`packages/crypto/src/providers/signer/KmsSigner.ts`, ADR-0009) for `KEY_PROVIDER=aws-kms`, and all seven signing call sites plus `packages/api/src/routes/keys.ts` already resolve through it. Fixed the same day: `KmsSigner` was passing Parmana's logical keyId (e.g. `DEFAULT_KEY_ID = "default"`) straight through as AWS KMS's `KeyId` parameter, which KMS rejects outright — it must be a real key ID, key ARN, or an `alias/`-prefixed name. `KmsSigner` now maps `keyId` → `alias/<keyId>` (mirroring `FileKeyProvider`'s own `keyId` → `<keyId>.private.pem` convention), passing an already-qualified alias, ARN, or raw key ID through unchanged. Verified end-to-end against a real AWS KMS key (`ECC_NIST_EDWARDS25519`/`ED25519_SHA_512`, account 013659367671, ap-south-1) under a least-privilege IAM identity scoped to that one key: `hasKey`, `getPublicKey`, `sign`, and Node's own `crypto.verify` against the returned signature, and `getMetadata`, all passed. Unit test coverage added (`packages/crypto/tests/unit/kms-signer.test.ts`) for the keyId-mapping behavior itself. Azure Key Vault, GCP KMS, and on-prem HSM remain unimplemented, and `KeyBootstrap.create()` (the older, unused-in-production composition root this entry originally described) is unchanged and still throws for any non-local provider. Not yet done: the Vercel→AWS OIDC IAM role (`AWS_ROLE_ARN`) ADR-0009 specifies for production credential-free authentication — only a local-admin IAM user (`parmana-kms-operator`) was provisioned so far, deliberately scoped to local/CLI key administration, not runtime signing.

Evidence (update)

- `packages/crypto/src/KeyBootstrap.ts`
- `packages/crypto/tests/unit/key-bootstrap.test.ts`: 7 cases, including one per unimplemented `KEY_PROVIDER` value

---

## 2.19 Fail-Closed Caller-Authentication Audit Writes

A caller-authentication event (accepted or rejected) that fails to be recorded fails the request. `middleware/caller-auth.ts` wraps every `CallerAuditSink.record()` call: on success the request proceeds exactly as before; on failure the request is rejected with `AuditUnavailableError` (503, code `AUDIT_UNAVAILABLE`) and a structured log entry naming the failure, rather than proceeding unaudited or crashing as an unhandled rejection. This is a deliberate design decision (an action that executes without an audit record contradicts independently verifiable execution), not an incidental side effect; the availability cost is accepted. No retry, buffering, or queueing exists: a failure fails closed immediately, once, every time.

Evidence

- packages/api/src/middleware/caller-auth.ts (calls `recordCallerAuditEvent`)

- packages/api/src/auth/recordCallerAuditEvent.ts (`recordCallerAuditEvent` — the actual fail-closed implementation this claim describes; corrected 2026-08-24, previously miscited under a `recordOrFailClosed` name that does not exist anywhere in this codebase)

- packages/api/src/auth/AuditUnavailableError.ts

- packages/api/tests/unit/middleware/caller-auth.test.ts: both success paths unchanged; both failure paths rejected with `AuditUnavailableError` (503/AUDIT_UNAVAILABLE), not a 401 and not a silent pass-through; the structured log entry's exact shape; the sink is called exactly once (no retry)

- packages/api/tests/unit/supabase-caller-audit-sink.test.ts: `SupabaseCallerAuditSink` propagates storage errors rather than swallowing them, which is what makes this guard reachable in production wiring

- examples/tutorials/101-fail-closed-caller-audit-writes/run.ts (runnable narrative, real HTTP server: a rejected credential and an accepted one each independently fail closed at 503 when the audit write itself fails)

---

## 2.20 Atomic Rejection of Duplicate Business Transactions

Creating a Business Transaction with a `businessTransactionId` that already exists is rejected atomically, with the identical `DuplicateBusinessTransactionError` regardless of storage backend. `MemoryBusinessTransactionRepository.create()` performs its existence check and its write in the same synchronous tick, with no `await` between them, so two concurrent calls for the same id cannot interleave; `SupabaseBusinessTransactionRepository.create()` relies on the `business_transaction_id` column's `PRIMARY KEY` constraint and maps the resulting `23505` unique-violation to the same error class. Neither implementation ever silently overwrites an existing transaction.

**Scope note (`docs/VERIFICATION-GAPS.md` G-29, RESOLVED):** this claim is about the correctness of the rejection — the transaction is never lost, corrupted, or double-accepted; that remains exactly as stated above. A duplicate-ID submission's rejection _attempt_ is now also durably audited (§3.20, `caller.structural_rejected`) — G-29 originally found, and this note originally documented, that it was not.

Evidence

- packages/storage/src/memory/MemoryBusinessTransactionRepository.ts

- packages/storage/src/supabase/SupabaseBusinessTransactionRepository.ts (isUniqueViolation mapping)

- packages/shared/src/errors/duplicate-business-transaction-error.ts

- packages/storage/tests/unit/memory-business-transaction-repository.test.ts: two simultaneous `create()` calls with the same id and different content: exactly one succeeds, the other rejects with `DuplicateBusinessTransactionError`, and the stored record is exactly the winner's

- packages/storage/tests/unit/business-transaction-repository-duplicate-consistency.test.ts: both repository implementations throw the identical error class and message for a duplicate

- packages/storage/tests/integration/supabase-business-transaction-duplicate.integration.test.ts: the same concurrent-race proof against a real Postgres database (Supabase-gated)

---

## 2.21 Distinguishable HTTP Status for Policy Denial and Replay

A policy `REJECTED` decision surfaces as `HTTP 403` with `code: "POLICY_DENIED"`. An execution request whose authorization envelope has already been consumed, meaning every other Gateway check (version, signature, expiry, TTL policy, `businessTransactionHash`) passed and nonce consumption alone failed, surfaces as `HTTP 409` with `code: "NONCE_ALREADY_CONSUMED"`. Both are now distinguishable from a genuine, unexpected server error, which remains `HTTP 500`. Neither the authorization logic nor any underlying check changed to produce this: only the status code and response body surfaced to the caller changed. Every other Gateway verification failure (forged signature, expired envelope, tampered content) is unaffected and remains a plain, uncoded error, still surfacing as `HTTP 500`.

Scope, precisely: the `409` path is reachable today only by a receiving system calling `@parmana/execution-gateway`'s `ExecutionGateway.execute()` directly with an already-consumed authorization (the library-level guarantee this closes). It is not reachable through Parmana's own default `POST /execute` / `POST /transactions` routes, because a resubmitted `businessTransactionId` is rejected with the existing `409` `DuplicateBusinessTransactionError` (2.20) before `RuntimeEngine`, policy evaluation, or the Gateway are ever reached — the same admission-time layer this repository's now-removed Razorpay connector relied on for its own live idempotency proof, documented in this file until the connector's removal on 2026-08-12; see `docs/site/changelog.mdx` for the dated record.

Evidence

- packages/runtime/src/ExecutionGate.ts (`RuntimeError` thrown with `status: 403, code: "POLICY_DENIED"`)

- packages/shared/src/errors/nonce-already-consumed-error.ts (`NonceAlreadyConsumedError`, `status: 409, code: "NONCE_ALREADY_CONSUMED"`)

- packages/execution-gateway/src/ExecutionGateway.ts (`isSoleFailureNonceReplay`: throws `NonceAlreadyConsumedError` only when every check other than nonce consumption passed; any other combination of failed checks still throws the existing, unchanged, uncoded `Error`)

- packages/api/src/middleware/error-handler.ts (dedicated `NonceAlreadyConsumedError` branch; the existing `RuntimeError` branch reads `error.status`/`error.code` dynamically, unchanged)

- packages/execution-gateway/tests/unit/execution-gateway.test.ts, execution-gateway.dilithium3.test.ts: "rejects a replayed request without releasing it twice, as a distinguishable NonceAlreadyConsumedError (409)"

- packages/runtime/tests/unit/execution-authorization-wiring.test.ts: "rejected transaction produces no authorization" (asserts `status: 403`, `code: "POLICY_DENIED"`)

- packages/api/tests/integration/caller-auth.integration.test.ts: "a well-authenticated caller submitting a policy-rejected transaction is still rejected by policy" (asserts `response.status === 403`, `response.body.code === "POLICY_DENIED"`, through the real `POST /execute` route)

- typescript/src/transport/mapHttpErrorResponse.ts, typescript/test/Errors.test.ts, typescript/test/HttpTransport.test.ts: the TypeScript SDK maps `code: "POLICY_DENIED"` to `ExecutionRejectedError`, checked ahead of the generic `403` → `AuthorizationError` mapping so it does not collide with the unrelated caller-identity-mismatch `403` (`packages/api/src/routes/execute.ts`), which carries no `code` at all

- examples/tutorials/102-distinguishable-http-status/run.ts (runnable narrative: all three failure shapes produced side by side — 403/POLICY_DENIED via a real HTTP server, 409/NONCE_ALREADY_CONSUMED and a plain uncoded 500 via `ExecutionGateway.execute()` called directly)

**Update (2026-08-24 documentation-currency pass):** this section previously also cited `packages/api/tests/integration/razorpay-refund.integration.test.ts`/`razorpay-live.integration.test.ts` as evidence of the same `403`/`POLICY_DENIED` assertion "through the real production bootstrap chain." Both files were deleted along with the rest of the Razorpay connector on 2026-08-12 (see §3.16's own update); that specific production path no longer exists. The claim itself — that a policy `REJECTED` decision surfaces as `403`/`POLICY_DENIED` — remains fully current and is unaffected, demonstrated by the `caller-auth.integration.test.ts` citation immediately above, which exercises the same generic mechanism against `test:fixture-execute` rather than a Razorpay-specific transaction.

---

## 2.22 Canonical Capability-to-Policy Binding (TD-22)

For every production capability, the policy that governs it is fixed structurally, not selected by the caller. `CapabilityPolicyBinder` checks a request's declared `Intent.action` against `CANONICAL_CAPABILITY_POLICY_BINDINGS`, a single hardcoded map from capability to the one policy reference that authorizes it (`packages/capability-registry/src/CapabilityPolicyBinding.ts`, moved from `packages/policy/src` 2026-08-26; re-exported unchanged from `@parmana/policy`'s public API) — covering every capability the production connector registry actually registers. A request pairing a real capability with any policy other than its canonical one is rejected as an ordinary policy denial, with zero rules evaluated, before `PolicyEngine.evaluate` ever runs.

This closes the gap that would otherwise exist because policy _loading_ (`FilePolicyRepository.load(name, version)`) is itself keyed by whatever `policy.name`/`policy.version` the caller declares — validated only against a path-traversal allowlist, not against the capability being executed. Without the binder, a caller could pair a real, CRM-mutating capability (e.g. `hubspot:deal-update`) with an unrelated, unprotected policy that has no `boundSignals` for it, and have the real `intent.parameters` executed under that looser policy's rules — bypassing the capability's own protections entirely, not merely weakening them. `CapabilityPolicyBinder` is unconditionally instantiated inside `RuntimeBuilder.build()` — not configuration, not omittable from production wiring — and runs before both `SignalIntentBinder` and `PolicyEngine.evaluate`, so a wrongly-paired policy is loaded but never evaluated.

Evidence

- packages/capability-registry/src/CapabilityPolicyBinding.ts (`CANONICAL_CAPABILITY_POLICY_BINDINGS`, `CapabilityPolicyBinder`; moved from `packages/policy/src` 2026-08-26, G-30 Option C, re-exported unchanged from `@parmana/policy`'s own public API — see §2.22's own update below)

- packages/runtime/src/RuntimeBuilder.ts (unconditional construction, no configuration flag)

- packages/runtime/src/RuntimeEngine.ts (binder check ordered before `SignalIntentBinder`/`PolicyEngine.evaluate`)

- packages/policy/tests/unit/CapabilityPolicyBinder.test.ts (proves the exact live-shaped exploit — `hubspot:deal-update` paired with the unrelated, unprotected `vendor-payment/2.0.0` policy, and the same substitution shape for `hubspot:deal-fetch` paired with `customer-refund/1.0.0` — is rejected; also proves every production-registered capability has a binding, and, per that file's own comment, that Razorpay capabilities were removed from the bound set entirely when the connector was deleted 2026-08-12, not merely left unbound)

- §5.1 of the Phase 3D independent authorization certification, in git history (independent re-verification, Phase 3D)

**Update (code-only ground-truth capture pass, follow-up closure):** this section's "covering every capability the production connector registry actually registers" was, until this pass, not quite true — `CANONICAL_CAPABILITY_POLICY_BINDINGS` also carried a stale `payments:execute` entry left behind by G-27's vendor-payment removal (`docs/VERIFICATION-GAPS.md` G-27's own update). Removed; the table now matches the claim exactly. See that G-27 update for the full trace.

**Update (2026-08-25 audit-fix pass, RESOLVED same-day):** "covering every capability the production connector registry actually registers" was, briefly, not true. `createConnectorRegistry.ts` conditionally registers `github:pr-fetch`/`github:pr-merge` (3.17) when GitHub App credentials are configured, wired in on 2026-08-19 — five days _before_ the code-only ground-truth pass above — but neither capability had been added to `CANONICAL_CAPABILITY_POLICY_BINDINGS`. Fixed same day: both now map to `github-pr-approval/1.0.0` (the policy §3.17's own connector already evaluates), mirroring HubSpot's own two-capabilities-one-policy shape exactly. `CapabilityPolicyBinder.test.ts`'s "binds every capability the production connector registry actually registers" test — which asserts a hardcoded set rather than reading the registry live, which is why the gap went uncaught for six days — now includes both. Full trace in `docs/VERIFICATION-GAPS.md` G-30 (RESOLVED).

**Update (2026-08-26, G-30 architecture follow-up, Option C implemented):** `CANONICAL_CAPABILITY_POLICY_BINDINGS` and `CapabilityPolicyBinder` moved out of `@parmana/policy` into a new leaf package, `@parmana/capability-registry`, depending only on `@parmana/shared`. `@parmana/policy`'s own public API is unaffected — `packages/policy/src/index.ts` re-exports both symbols from the new package unchanged, so every existing consumer importing from `@parmana/policy` needed no changes; confirmed by grep across the ~10 files that do (`RuntimeEngine.ts`, `RuntimeBuilder.ts`, `execute.ts`, and others). **Deviation from the original Option C sketch, corrected before implementing:** the original Option C plan proposed also importing capability-identifier constants from `@parmana/connector-github`/`@parmana/connector-hubspot` into the new package to remove identifier-string duplication. Checked before doing it: `@parmana/connector-hubspot` already depends on `@parmana/policy` directly, and `@parmana/connector-github` depends on `@parmana/connector-sdk`, which also depends on `@parmana/policy` — either import would have created a direct dependency cycle back through the package this extraction was built to be depended on by. Not done; the four capability-identifier strings remain hand-typed in `CapabilityPolicyBinding.ts`, same as before the move, still duplicated against `GitHubCapabilities.ts`/`HubSpotCapabilities.ts`'s own separate constants. What this move does close: the `packages/policy` → `packages/api` backwards-dependency edge Option B would have required. Full detail in `docs/VERIFICATION-GAPS.md` G-30. Verified: full rebuild (`npx tsc -b`, clean) and full suite unchanged at 1274 passed, 37 skipped, 0 failed.

**Update (2026-09-27, G-66, merged to `main` and deployed to production on 2026-09-27 (PR #46, merge `4eebd5f`)):** the binding pins the policy **name**; where policy governance is enforced, the **version** is the one most recently approved for that name, not the one written in the table. See 2.43.

**Update (2026-09-28, G-73):** `github:pr-fetch` is bound to a new policy name, `github-pr-read`, so reads need no merge approval, and the table names `github-pr-approval` 1.1.0 for `github:pr-merge`. The name change takes effect on deploy; in production a read is then refused until `github-pr-read` 1.0.0 is approved (2.44).

## 2.45 Approver Keys Are Added and Revoked Through Maker Checker, With No Deploy (Scoped, 2026-09-29)

**Claim:** a key trusted to sign approvals can be added or revoked without a code change or deploy, and only when one human credential proposes it and a different human credential approves it with a step up authorization.

**Backed by:** `packages/api/src/routes/approval-issuers.ts` (human callers only, maker is not checker, step up on approve and reject, shared with policy changes in `auth/governanceGuards.ts`); migration `20260929120000_add_approval_issuers.sql` (check constraints: maker is not checker, an add carries a key, a key is revoked only with a change behind it; one open change per key); `SupabaseApprovalIssuerRepository.approveChange` (locks the change, applies it and resolves it in one transaction); `GovernedApprovalIssuerRegistry` (code list first, then the table on every approval, fails closed on a read error). Tests: `approval-issuers-governance.integration.test.ts` (through the HTTP boundary, including a refund authorized with a newly added key and refused after its revocation), `governed-approval-issuer-registry.test.ts`, and `supabase-approval-issuer-repository.integration.test.ts` against real Postgres in the Docker image workflow (including two concurrent approvals of one change).

**Scope:** distinct credentials, not proven distinct people. Keys listed in code still change only by deploy. An operator with database access can bypass the API. Not live until the migration is applied in production.

## 2.46 An Approver Is Notified When a Request Waits Only for Their Approval (Scoped, 2026-09-29)

**Claim:** when `APPROVAL_WEBHOOK_URL` and `APPROVAL_WEBHOOK_SECRET` are set, a request refused only for want of a signed approval sends one HMAC SHA256 signed `approval.needed` event naming what to sign, and a delivery failure never changes the refusal.

**Backed by:** `packages/runtime/src/ApprovalNeededNotifier.ts` (`findNeededApprovals`: the same policy evaluated with the declared approval signals true must approve), `RuntimeEngine.notifyApprovalNeeded` (only after a refusal by rules or by an unverified approval; errors logged, never rethrown), `packages/api/src/bootstrap/createApprovalNeededNotifier.ts` (https outside test and development, no redirects, 3 second limit). Tests: `approval-webhook.integration.test.ts` through `POST /execute` with a real local receiver (event and signature, no event for a fraud refusal, above the maximum, or an authorized request, refusal unchanged when the webhook fails), and unit tests.

**Update (2026-09-29, email):** `APPROVAL_EMAIL_TO` sends the same event by email through Resend (`createEmailApprovalNeededNotifier.ts`), with one idempotency key per refusal (`approval-needed/<decisionId>`), alongside or instead of the webhook. Tests: `approval-email.integration.test.ts` through `POST /execute` with the Resend SDK replaced, and unit tests.

**Scope:** best effort, one attempt, no retry. Email needs a sending domain verified in Resend.

## 2.47 No AI Agent Action Is Authorized Without a Signed Human Approval, Reads Included (Scoped, 2026-09-30)

**Claim:** Parmana authorizes no action, of any kind, without a signed approval from a trusted person for that action and that resource. This holds for every policy, not only connector actions, and for reads as well as writes.

**How it is enforced:**

- **At policy load.** `PolicyValidator.validateEveryApprovalNeedsSignedApproval` refuses any policy with an approve rule that does not require a fact declared in `approvalSignals` with `is_true`, as the rule's whole condition or directly inside its top level `all`. An `any`, a nested `all`, or `eq true` does not count. `PolicyRouter` validates every policy it loads, so such a policy refuses every request (`400`), and `POST /policies/:name/:version/pending-changes` validates every proposal, so such a policy cannot be proposed through maker checker.
- **At decision.** `ApprovalSignalVerifier` (2.42) counts an approval signal as true only with a valid signed approval: trusted and unrevoked approver, Ed25519 signature, action, resource, amount where declared, expiry, single use; again at release in the Execution Gateway. `RuntimeEngine` refuses an approve decision when no signal state verifier is configured (`approval-verifier-not-configured`), so a runtime built without one cannot trust a caller's `true`.

**Policies in the binding table (`CANONICAL_CAPABILITY_POLICY_BINDINGS`):** `paytm:refund` to `customer-refund` 1.2.0 (unchanged), `github:pr-merge` to `github-pr-approval` 1.1.0 (unchanged), `github:pr-fetch` to `github-pr-read` 1.1.0 (new, `readApproved` for the pull request), `hubspot:deal-fetch` to `hubspot-deal-read` 1.0.0 (new policy, `readApproved` for the deal), `hubspot:deal-update` to `hubspot-deal-update` 1.1.0 (new, `dealUpdateApproved` for the deal, every update whatever the amount), `slack:post-message` to `slack-post-message` 1.1.0 (new, `postApproved` for the channel). The reference policies with no connector have new versions that need `humanApproved` for the Intent's `target`, and for the amount in `vendor-payment` 2.1.0, `agent-vendor-payment` 1.1.0 and `expense-reimbursement` 1.1.0.

**HubSpot:** under 1.1.0 the one approval for the deal is checked by `ApprovalSignalVerifier`. `HubSpotSignalStateVerifier` still checks the deal's real stage and amount facts, and skips its own pre authorization check when the policy declares `approvalSignals`, so one approval is not spent twice.

Scope, stated plainly:

- **In production since 2026-09-30.** Merged (PR #87, `e18ddae`) and deployed on 2026-09-30, after all 13 new policy versions were approved through maker checker (proposed by `charak1987`, approved by `reviewer-charak1987`, two credentials held by one person). Checked after the deploy: `hubspot:deal-fetch` reports `hubspot-deal-read` 1.0.0 in effect, `/ready` is READY, `/execute` without a key returns `401`. Production runs the version most recently approved for each name (2.43).
- **An approval covers the action and the resource, not every parameter.** A Slack approval does not fix the message text; a HubSpot approval does not fix the new stage or amount. Payment, expense and refund approvals do cover the amount.
- **Superseded versions stay in `policies/` as history** (for example `github-pr-read` 1.0.0, `hubspot-deal-update` 1.0.0, `slack-post-message` 1.0.0, `customer-refund` 1.0.0 and 1.1.0, `vendor-payment` 2.0.0). Each fails to load.
- **No automatic path.** An action cannot be authorized by server checks alone. That is the rule, not a missing feature (G-80).
- **Who approves is still limited to the trusted approver list** (2.42, 2.45). Today that is one approver, `manager-charak1987`, held by the operator (key `manager-charak1987-key-2` since 2026-09-30, added through maker checker), so in practice one person approves every agent action.
- Holds for actions routed through Parmana (3.1).

Verification

- `packages/policy/tests/unit/PolicyValidator.test.ts`: the rule accepts an approval signal as the whole condition or in the top level `all`, and refuses `always`, a caller fact, an approval signal only inside an `any`, only inside a nested `all`, compared with `eq`, or not declared in `approvalSignals`; a policy that only rejects loads.
- `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts` (110): for all 16 current approval backed versions, the policy loads, every approve rule requires the approval fact, the most permissive caller facts are refused without it, approved with it, and a failing caller fact still refuses; the 16 superseded versions are each refused at load.
- `packages/policy/tests/unit/ReferencePolicies.test.ts`: the newest version of every policy in `policies/` loads; every older version loads or is refused only for approving without a person.
- `packages/runtime/tests/unit/runtime.test.ts`: a runtime with no approval verifier refuses an approval; the approval signal set true with no signed approval is refused.
- Through `POST /execute` with the production bootstrap: `slack-post-message.integration.test.ts` (6: a post with an approval lands once; no approval, and an approval for another channel, are refused with zero Slack calls), `hubspot-deal-update.integration.test.ts` (7: an update with an approval lands; no approval, and an untrusted approver, are refused with no PATCH), `github-caller-scoping.integration.test.ts` (a read with an approval), `paytm-refund.integration.test.ts` (`customer-refund` 1.1.0 is refused at load), `pending-policy-changes-governance.integration.test.ts` (a policy that approves without a person cannot be proposed).
- Tutorials 120 (the load time rule, every policy in `policies/`, a runtime with no approval verifier), 121 (an approval for a pull request read) and 122 (a Slack post and a HubSpot update and read), each through the real `RuntimeEngine`; all 113 tutorials in `npm run examples` pass.
- Every other test that expects an approved action now carries a signed approval from a hermetic test approver (`test-support/approvals.ts`, trusted through `vitest.setup.ts`). Full suite: 2512 passed, 0 failed. Python SDK: 135 passed. Docker offline check with no internet route: 14 of 14, including a manager added through maker checker and a refund with that manager's signed approval.

Evidence

- `packages/policy/src/PolicyValidator.ts` (`validateEveryApprovalNeedsSignedApproval`); `packages/runtime/src/RuntimeEngine.ts` (`approval-verifier-not-configured`)
- `packages/capability-registry/src/CapabilityPolicyBinding.ts`; `packages/connector-hubspot/src/HubSpotSignalStateVerifier.ts`
- `policies/github-pr-read/1.1.0`, `policies/hubspot-deal-read/1.0.0`, `policies/hubspot-deal-update/1.1.0`, `policies/slack-post-message/1.1.0`, and the new reference versions
- `docs/site/concepts/human-approval.mdx`; `docs/VERIFICATION-GAPS.md` G-80

---

## 2.48 The Server Tells an Agent What a Request Must Carry (Scoped, 2026-09-30)

**Claim:** `GET /policies/in-effect?capability=...` returns, with the policy to declare, what a request under it must carry: every fact the policy's rules read, their declared types, the signals that must equal a value of the Intent, and the signals that need a signed approval with where the approval's resource and amount are in the request. An agent can build a request from the server's answer, without a copy of the policy and without asking the operator.

Scope, stated plainly:

- **Rule conditions are not returned.** The answer carries the policy's `description`, the author's own text, which may mention a limit; the server decides with the rules.
- **Same authorization as before.** Only a caller whose key may invoke the capability, or a human caller.
- **Fails closed.** If the policy in effect cannot be read, the answer is `503 POLICY_VERSION_UNAVAILABLE`, never a partial answer.
- **SDKs:** `policyInEffect()` in TypeScript and `policy_in_effect()` in Python are in the repository, not yet published (1.4.0 on the registries does not have them). **Update:** published in SDK 1.5.0 (2026-10-04).
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; production runs `main` at `4fdc2c2` (#100) and answers `GET /health` `UP` and `GET /ready` `READY`.

Verification

- `packages/api/tests/integration/policy-in-effect.integration.test.ts`: the refund answer equals the facts, schema, bound and approval declarations of `customer-refund`; no rule condition in `signals`; a read (`github:pr-fetch`) names `readApproved` for the target; `503` with no `signals` when the policy cannot be read.
- `packages/policy/tests/unit/policySignalRequirements.test.ts`: facts collected from nested `all` and `any`, sorted, once; empty objects when a policy declares none.
- `typescript/test/Alignment.test.ts`, `python/tests/test_sdk_alignment.py`: the SDK methods call the endpoint and return the answer; Python keeps signal names unconverted.

Evidence

- `packages/api/src/routes/policy-in-effect.ts`; `packages/policy/src/policySignalRequirements.ts` (also used by `PolicyValidator`)
- `openapi/openapi.yaml` (`getPolicyInEffect`); `docs/site/agents/integrate.mdx` step 3

## 2.49 External Connectors Are Registered Through Maker Checker, With No Deploy (Scoped, 2026-09-30)

**Claim:** an operator can bind a capability to an HTTPS endpoint they run, and to the policy that governs it, without a code change or deploy, and only when one human credential proposes it and a different human credential approves it with a step up authorization. Parmana refuses to register an endpoint that is not https, names an IP address or localhost, or resolves to an address that is not public, and checks the address again when the registration is approved. This is step 1 of ADR-0013.

Scope, stated plainly:

- **This claim is about governing registrations, not about releasing actions to them.** Since ADR-0013 step 4 (2026-10-01, `docs/VERIFICATION-GAPS.md` G-81) an approved request for a registered capability is released to its endpoint as a signed release, its policy bound from the registration, and `GET /policies/in-effect` answers for it; that is claimed in 2.50, after the live check of ADR-0013 step 6 on 2026-10-01. The SDK helpers `verifyParmanaRelease` and `verify_parmana_release` are not published yet.
- **Distinct credentials, not proven distinct people**, as in 2.45. An operator with database access can bypass the API.
- **Built in namespaces stay code.** A capability in the namespace of a built in connector (paytm, hubspot, github, slack, test) is refused.
- **The policy name is checked for form only** at registration, not that the policy exists or has an approved version (G-81).

Verification

- `packages/api/tests/integration/external-connectors-governance.integration.test.ts` (through the HTTP boundary, DNS stubbed): no credential `401`, a service credential `403`, the proposer as checker `403`, approval without a step up or with one for the other action `403`; malformed fields and every built in namespace `400`; an endpoint over http, an IP literal, localhost, a private address, any private address among public ones, and a host that does not resolve `400`; a second pending change and revoking an unregistered capability `409`; register, list, one active per capability, revoke without deleting, register again; the address checked again on approval after a DNS change to `169.254.169.254`; reject with a reason.
- `packages/shared/tests/unit/external-endpoint-address.test.ts`: the URL rules, and the private, loopback, link local, shared, multicast, reserved and documentation ranges in IPv4 and IPv6, including IPv4 mapped IPv6.
- `packages/storage/tests/integration/supabase-external-connector-repository.integration.test.ts` against real Postgres with every migration applied, in the Docker image workflow (5 tests passed on PR #92): approval applies and resolves in one transaction, one pending change and one active registration per capability, only one of two concurrent approvals applies, maker as checker refused by the database.

Evidence

- `packages/api/src/routes/external-connectors.ts`; `packages/shared/src/network/externalEndpointAddress.ts`; `packages/storage/src/supabase/SupabaseExternalConnectorRepository.ts`
- Migration `supabase/migrations/20260930120000_add_external_connectors.sql`, applied in production on 2026-09-30 (`npm run db:migrate -- status`: 33 applied, 0 pending); PR #92 deployed; `GET /external-connectors` with the maker key returned `{"connectors":[]}` in production.
- Checked in production on 2026-10-01: a full propose and approve cycle (the live check in 2.50).
- `openapi/openapi.yaml` (`listExternalConnectors`, `proposeExternalConnectorChange`, `listExternalConnectorChanges`, `approveExternalConnectorChange`, `rejectExternalConnectorChange`); `docs/adr/ADR-0013-Generic-External-Connector.md`

## 2.50 An Approved Request Is Released, Signed, to a Registered External Endpoint (Scoped, 2026-10-01)

**Claim:** for a capability registered to an external HTTPS endpoint through maker checker (2.49), Parmana releases an approved request to that endpoint as a release signed with its own key, naming the capability, target, allowed parameters, the policy at its approved version, the approver, the authorization and the endpoint as audience, and expiring 60 seconds after it is issued. The endpoint can verify it with Parmana's public key alone (`verifyParmanaRelease`), and the signed Execution Trust Record of the request carries the endpoint's answer and verifies offline. A request with no signed approval, or with an approval already used, is refused and nothing is released. This is ADR-0013 steps 2 to 4, checked live in production in step 6.

Scope, stated plainly:

- **What the endpoint answers is its claim, not proof that it acted** (G-82). The record proves what Parmana released and what the endpoint said, not what the endpoint's system did.
- **Checked live once, with one endpoint that acts on nothing.** The check endpoint answers with a receipt; no external system was changed. The same code path serves every registered capability.
- **Distinct credentials, not proven distinct people**, as in 2.45 and 2.49: in the live check the maker and the checker keys, and the approver key, are held by one person.
- **Slow in production** (G-84): the approved request took 23.9 and about 32 seconds end to end; the SDK's default timeout is 30 seconds, and the first attempt's agent stopped waiting while the request completed.
- **The SDK helpers are not published yet.** `verifyParmanaRelease` and `verify_parmana_release` are in the repository; the check endpoint bundles them from it.

Verification

- `packages/execution-gateway/tests/unit/external-adapter.test.ts`: the signed release (canonical form, audience, 60 second expiry), the pinned transport, refused parameters, and every rejected answer.
- `packages/api/tests/integration/external-connector-release.integration.test.ts` and `policy-in-effect-external.integration.test.ts`: a registered capability released through the HTTP boundary, its policy bound from the registration, and `GET /policies/in-effect` for it.
- `typescript/test/VerifyParmanaRelease.test.ts`, `python/tests/test_verify_parmana_release.py`: the helpers, against releases signed by the real server.
- Tutorial 123 (`examples/tutorials/123-external-connector`), run on every preflight: register, release, a retry answered once, a release for another endpoint refused, a revoke.

Evidence: the live check, 2026-10-01 (`examples/live-checks/external-connector/README.md`)

- Endpoint `https://parmana-release-check.vercel.app/api/release` (Vercel project `parmana-release-check`, built from `endpoint.ts`). It answered `401` to an unsigned body.
- Policy `livecheck-receipt` 1.0.0 proposed by `charak1987` (change `ed3dddd3-00d3-448a-a29a-0bcc05f41ec0`) and approved by `reviewer-charak1987` with a step up authorization. Registration of `livecheck:receipt` proposed by `charak1987` (change `e16dc8c3-46c9-4b19-9a40-131f464ab170`) and approved by `reviewer-charak1987`; stored with the endpoint URL unchanged.
- Agent key `livecheck-agent`, allowed only `livecheck:receipt`. `GET /policies/in-effect` named `livecheck-receipt` 1.0.0.
- Transaction `97ddeaa9-8e2d-4dbc-93c7-452cca85db8f`: with no approval, refused (`403`, the policy's reason); with an approval signed by `manager-charak1987` (`manager-charak1987-key-2`) for the target, `APPROVED` in 23.9 s, and the record verifies offline with `GET /keys/default` alone; the same approval again, refused (`receiptApproved=true != verified receiptApproved=false`). Record: `examples/live-checks/external-connector/evidence/2026-10-01-97ddeaa9-record.json`.
- Transaction `ec2f6c00-1009-43f0-9faf-1aeb84917860` (the first attempt, whose agent timed out at 30 s): the API answered `200`, and its record, fetched afterwards, is `APPROVED` and verifies offline. Record: `evidence/2026-10-01-ec2f6c00-record.json`.
- The endpoint's log has exactly one `release_acted` line per approved transaction, each naming the capability, the target, `livecheck-receipt` 1.0.0 with its content hash, and the approver, and `release_refused` only for the unsigned probes.

## 2.51 A Public Sandbox Runs the Same Governance With a Published Demo Key (Scoped, 2026-10-02)

**Claim:** `https://parmana-sandbox.vercel.app` runs the same code as production with `PARMANA_SANDBOX=true`, its own Supabase database, its own signing keys and its own approver. With only the demo key `sandbox-visitor`, which may ask for `sandbox:receipt` alone, a visitor gets the same governance as production: a request with no signed approval is refused, a demo approval from `POST /sandbox/approvals` lets one request be released, signed, to the sandbox receipt endpoint, the signed record verifies offline, the same approval reused is refused, and the policy's own rule refuses a long note. The demo approver signs only for `sandbox:receipt`, and only the docs site may call the API from a browser. This is ADR-0014 steps 2 and 3.

Scope, stated plainly:

- **The sandbox acts on nothing.** Its one capability is released to an endpoint that answers with a receipt; no connector to a real system can be configured while `PARMANA_SANDBOX=true` (the server refuses to start).
- **Anyone can approve in the sandbox.** That is its purpose: the demo approval shows how a signed approval is used, not who may give one. In production only registered approvers sign.
- **The demo key is not published yet.** ADR-0014 step 4 puts it in the docs playground. Until then only the live check has used it.
- **No retention yet.** ADR-0014 accepted deleting sandbox records older than 7 days, daily; that job is not built.
- **Distinct credentials, not proven distinct people**, as in 2.49 and 2.50: the sandbox maker and checker keys are held by one person.
- **Checked live once.** The approved request took 14.1 s (G-84 applies here too).

Verification

- `packages/api/tests/unit/createSandboxOptions.test.ts` and `tests/architecture/sandbox-connector-variables.test.ts`: sandbox mode refuses every connector variable, even empty, and the approver variables outside it.
- `packages/api/tests/integration/sandbox.integration.test.ts`: `POST /sandbox/approvals` behind the key, for `sandbox:receipt` only, expiring in 300 s.
- `tests/architecture/sandbox-policy.test.ts`: `deploy/sandbox/policy.json`.

Evidence: the live check, 2026-10-02 (`deploy/sandbox/README.md`, stage `Check`)

- Supabase project `zkrfrfyokkpfwghoohne` (not production's `ltjadvsjlpcygborxzet`): 33 migrations applied to an empty database. Vercel project `parmana-sandbox`: `GET /ready` `READY` with authentication on, `GET /keys/default` an ed25519 key. Production stayed `READY` throughout.
- Receipt endpoint `https://parmana-sandbox-receipt.vercel.app/api/release` (Vercel project `parmana-sandbox-receipt`): `401` to an unsigned body, answered by the endpoint itself.
- Through maker checker in the sandbox, each proposed by `sandbox-maker` and approved by the sandbox checker: the demo approver `sandbox-demo-approver` (`sandbox-demo-approver-key-1`, change `0143b0a5-ba0f-437a-945d-abeb73d9cdb4`, the public key identical to the key folder's); policy `sandbox-receipt` 1.0.0 (change `4ac16068-0f1b-46ee-b298-c3c0c9ce63e4`, identical to `deploy/sandbox/policy.json`); the registration of `sandbox:receipt` (change `752bea44-40c8-4c88-ba40-b5035c8420c7`, parameter `note` only, 10 s timeout).
- The nine checks, with `sandbox-visitor` only: the key's scope; `sandbox-receipt` 1.0.0 in effect; no approval, refused with the policy's reason; a demo approval, `201`; with it, transaction `18ce9222-ca2e-434c-a47e-0a6f72fdd387` `APPROVED` in 14.1 s, receipt `RC-18ce9222`, the record verifying offline; the same approval again, refused (`receiptApproved=true != verified receiptApproved=false`); a note over 200 characters, refused; a demo approval for another capability, `400 INVALID_SANDBOX_APPROVAL_REQUEST`; a browser preflight from `https://docs.parmanasystems.com` `204`, from another site `403` with no allow origin header. Record: `deploy/sandbox/evidence/check-record.json` (trust record `4df9cdac-6e4a-4c19-b8cd-7b8f79724c8c`, policy governance anchor `VERIFIED`).

## 2.52 A Request Whose Signals Do Not Have the Declared Types Is Refused (Scoped, 2026-10-05)

**Claim:** before any rule runs, every signal a policy declares in `signalsSchema` must have the declared type (`boolean`, `number` or `string`). A request that sends one with another type, such as an amount as text (`"150000"`), `null`, an array, `NaN` or `Infinity` for a number, is refused with `matchedRuleId` `signal-type-violation`, a reason naming each mismatching signal, and no rule evaluated. A policy whose `signalsSchema` declares any other type fails validation.

Why: numeric operators are false for a value that is not a number, so without this check a rule written as "reject if amount gt X, otherwise approve" would not fire for an amount sent as text. Mutation testing surfaced it (docs/MUTATION-TESTING.md); no shipped policy was found to approve such a request, since each also needs a signed approval.

Scope, stated plainly:

- **Only declared signals are checked.** A signal the policy does not list in `signalsSchema` is not, and a policy with no `signalsSchema` is evaluated as before.
- **An absent signal is not a type violation.** It is left to the rules, where a missing fact satisfies no condition (`PolicyEngine`).
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; production runs `main` at `4fdc2c2` (#100) and answers `GET /health` `UP` and `GET /ready` `READY`.

Verification

- `packages/policy/tests/unit/signalTypes.test.ts`: an amount as text is refused where the rules alone would approve it; booleans as text or numbers, strings as numbers, `null`, arrays, objects, `NaN` and `Infinity` refused; every mismatch named; correctly typed, absent, undeclared and inherited signals not refused; `PolicyValidator` refuses an unknown type, a non-string type, an array and `null` as `signalsSchema`.

Evidence

- `packages/policy/src/signalTypes.ts`, `packages/policy/src/PolicyEngine.ts` (`evaluate`), `packages/policy/src/PolicyValidator.ts`

---

## 2.53 An Agent's Proposed Fact Is Not a Business Fact: Sourced Signals and Separate Authority, Validity and Execution Statuses (Scoped, 2026-10-10)

**Claim:** a policy can declare, per fact, the business system that owns it (`signalSources`, RFC-0023). For such a fact Parmana asks the source itself, about the business object read from the Intent, never using the caller's value, and records the answer as a Trusted Signal: source, source identity, subject, claim, observed value, observation time, `validUntil`, the action and transaction it supports, and a SHA-256 digest. The policy is evaluated on the trusted value. A different value proposed by the caller refuses the request as `INVALID`. A source that is not registered, fails or times out is `SOURCE_UNAVAILABLE`; no answer, no business object or the wrong type is `MISSING_DATA`; contradictory facts are `CONFLICTING_DATA`; an answer older than `maxAgeSeconds` (default 300) or past the source's own `validUntil` is `VALIDATION_EXPIRED`. Each refuses the request, with no authorization generated. Every Decision now carries `assessment`, with authority, business validation and, for a refusal, execution as separate statuses. It is signed inside the Execution Trust Record and the Refusal Record.

Scope, stated plainly:

- **No business source is registered in the server yet.** A policy that declares one is refused as `SOURCE_UNAVAILABLE`, failing closed. No shipped policy declares one, so production decisions are unchanged except that they now record `assessment`. Registering sources is RFC-0023 phase 2.
- **Authority is today's checks, named.** `AUTHORIZED` means the governance verification and capability/policy binding passed (and, at the API, the caller key's capability scope). Per-agent limits and expiry are phase 3, so `AUTHORITY_EXPIRED` is not yet produced.
- **Policies without sources are unchanged.** Their validation status is `NOT_EVALUATED`, never `VALID`, and they still need a signed human approval to approve (2.47).
- **The digest proves what Parmana observed, not what the source said.** A source's own proof is carried verbatim in `integrityProof.sourceProof` but not yet verified.
- **Execution statuses for approved actions** remain the Trust Record's executions; `EXECUTION_UNKNOWN` and conditional execution are phase 4. **Update (2026-10-11):** built, see 2.56.
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; production runs `main` at `4fdc2c2` (#100) and answers `GET /health` `UP` and `GET /ready` `READY`.

Verification

- `packages/runtime/tests/unit/trusted-signal-resolver.test.ts` (19): no sources is `NOT_EVALUATED`; the source is asked about the Intent's object; the signal's digest recomputes; a contradicting proposal is `INVALID`; a missing object, `not_found` and a wrong type are `MISSING_DATA`; `conflicting` is `CONFLICTING_DATA`; no registry, an unregistered source, a throw, a timeout, no identity, an invalid or future time are `SOURCE_UNAVAILABLE`; an old answer or a past `validUntil` is `VALIDATION_EXPIRED`; one failing fact of several refuses and every failure is reported.
- `packages/runtime/tests/unit/business-validation.test.ts` (9), through the real `RuntimeEngine` with a signed approval: execution when both hold, deciding on the source's value; `INVALID` with nothing executed when the proposal contradicts the source; the assessment signed into the Refusal Record, verifying after a JSON round trip and failing when a status is changed; the policy refusing on the source's value when the caller sent none; `SOURCE_UNAVAILABLE` with no source or a failing one; `MISSING_DATA`; no source asked when authority is `NOT_AUTHORIZED`; `NOT_EVALUATED` under a policy without sources.
- `packages/policy/tests/unit/PolicyValidator-signalSources.test.ts` (19): valid declarations load and count as covered; malformed or contradictory ones are refused; `GET /policies/in-effect` lists them as `sourced`.

Evidence

- `packages/shared/src/domain/business-validation.ts`, `packages/shared/src/domain/decision.ts` (`assessment`)
- `packages/runtime/src/business-validation/`, `packages/runtime/src/RuntimeEngine.ts`, `packages/runtime/src/DecisionBuilder.ts`
- `packages/policy/src/types/Policy.ts` (`signalSources`), `packages/policy/src/PolicyValidator.ts` (`validateSignalSources`)
- `docs/rfcs/RFC-0023-Business-Validation.md`

**Update (2026-10-11):** the first scope bullet is superseded by 2.54: business systems can now be registered as sources through maker checker, and a source registered with a key must sign its answers, which Parmana verifies (`sourceProofVerified`). The fourth bullet holds only for sources registered without a key. The second bullet is superseded by 2.55 for a policy with `requireAuthorityGrant`: authority then also needs the caller's grant, and `AUTHORITY_EXPIRED` is produced.

---

## 2.54 Any Business System Can Be a Trusted Signal Source: Registered Through Maker Checker, Asked With a Signed Query, Answers Verified (Scoped, 2026-10-11)

**Claim:** a business system that owns facts a policy needs (an ERP, an order system, a CRM, a ledger) is registered under a name through maker checker: a human proposes `register` with an HTTPS endpoint and, optionally, the Ed25519 public key it signs answers with, and a different human approves with a step up authorization. Only then do policies that name it in `signalSources` get answers from it. Parmana asks it with a query signed by Parmana's default key, naming the source, the endpoint as audience, the claim, the business object, the action, the transaction and a fresh nonce, valid 60 seconds. The endpoint's address is checked as public on proposal, on approval and before every query, and the query is sent to that address with redirects refused and the answer limited to 16 KiB. Parmana trusts an answer only when it is HTTP 200, version 1, and echoes the query's source, nonce, signal key, claim and subject; and, for a source registered with a key, only when it carries a valid Ed25519 signature over the canonical answer under that key (and the registered `keyId`, when given). Anything else is `SOURCE_UNAVAILABLE` and refuses the request. A verified answer is recorded in the Trusted Signal with `sourceProof`, `sourceKeyId` and `sourceProofVerified: true`, inside the signed Execution Trust Record or Refusal Record. Revoking a source makes every policy that names it refuse from the next request.

Scope, stated plainly:

- **Not deployed** until this change is merged and deployed, and **no real business system has been connected.** Every test runs against in-process endpoints, including the example endpoint the docs give operators. **Update (2026-10-11):** deployed; `GET /business-signal-sources` answers in production. Still no real business system connected and no source registered there. **Live check, passed in production 2026-10-11** (`examples/live-checks/business-signal-source`): with the demo source `livecheck-erp` (a deployed endpoint answering from a fixed table, registered with an Ed25519 key) and test policy `livecheck-signal`, a request for a paid invoice was approved on the source's signed answer (`sourceProofVerified: true`, released, verifies offline), an unpaid one was refused by the policy on the source's `false`, the agent's `true` against the source's `false` was refused as `INVALID`, and an unknown invoice as `MISSING_DATA`. Transactions `d736681f-8d86-4e24-bcf3-66debfa6ac23`, `266278b4-7683-43fd-97e7-aa724c6cca9a`, `1fd2274c-65e2-47c4-bda5-4dd57b198277` and `173c6f4f-f9d7-46e0-a712-9d9f39a274cd`. No real business system is connected yet.
- **Parmana proves the source said it, not that it is right.** A source answers for its own records.
- **A source registered without a key** is trusted on the pinned HTTPS connection alone; its Trusted Signal has no `sourceProof`. Registering a key is recommended, not required.
- **Checked once, at decision time.** `validUntil` is not re-checked at release; conditional execution is phase 4. **Update (2026-10-11):** re-checked at release, and carried to external connectors as conditions, since 2.56.
- **Authority is unchanged** from 2.53: per-agent grants with limits and expiry are phase 3. **Update (2026-10-11):** built, see 2.55.
- **The SDK methods** (`proposeBusinessSignalSourceChange`, `business_signal_sources.propose_register` and the rest) ship in the next SDK release. **Update (2026-10-11):** published in SDK 1.6.0.

Verification

- `packages/api/tests/integration/business-signal-sources-governance.integration.test.ts` (14), through the real app: no credential is 401 and a service credential 403; the maker cannot approve; no step up, or one for the other action, is refused; an unknown change is 404; malformed names, timeouts, keys (not PEM, RSA), a `keyId` without a key, and a revoke with registration fields are 400; `http`, an IP literal, `localhost`, a private address and an unresolvable host are refused; one pending change and one active registration per name; the endpoint is stored normalized and the key in canonical SPKI PEM; nothing is registered until approval; the address is checked again on approval; reject needs a reason and resolves once; a revoke keeps the row.
- `packages/api/tests/unit/http-business-signal-source.test.ts` (29): the query Parmana sends is signed, names exactly this fact, and uses a fresh nonce; a registered source's signature is verified and marked; `not_found` and `conflicting` pass through; a non-200, non-JSON, missing answer, wrong nonce, subject or source, another version or status, missing value, invalid times, no signature, another key's signature, a signature over a different answer, another `keyId` or algorithm are each refused; a private address is refused before anything is sent; through the resolver, a verified Trusted Signal, `SOURCE_UNAVAILABLE` on a bad signature, after a revoke, and when the registry cannot be read; and the documented endpoint (`typescript/examples/08-business-signal-source.ts`) interoperates with the real client, refusing a query not signed by Parmana, meant for another endpoint, expired or repeated, while Parmana refuses its answer under the wrong key.
- `packages/api/tests/integration/business-validation-http-source.integration.test.ts` (3), through the real `RuntimeEngine` with a signed approval: the ERP's verified answer decides and is in the Trust Record; an agent claiming an unpaid invoice is paid is refused `INVALID` in a Refusal Record that verifies after a JSON round trip; after a revoke the request is refused `SOURCE_UNAVAILABLE` and no system is asked.
- `packages/storage/tests/integration/supabase-business-signal-source-repository.integration.test.ts` (6), against Postgres with every migration: register with key, revoke keeping the row; a source without a key; one pending change and one active registration per name; no double resolution, unknown id or revoke of an unregistered name; one of two simultaneous approvals applies; the database refuses the maker as checker, a register without its fields, a `keyId` without a key and a malformed name. Run on 2026-10-11 against a local Postgres 16.
- `python/tests/test_business_signal_source_api.py` (7): the Python SDK's requests and decoding.

Evidence

- `packages/api/src/routes/business-signal-sources.ts`, `packages/api/src/business-sources/HttpBusinessSignalSource.ts`, `packages/api/src/application.ts`
- `packages/shared/src/domain/business-signal-source.ts`, `packages/storage/src/{memory,supabase}/*BusinessSignalSourceRepository.ts`, `supabase/migrations/20261010120000_add_business_signal_sources.sql`
- `docs/rfcs/RFC-0023-Business-Validation.md` (Business signal sources, Wire protocol), `docs/site/guides/connect-a-business-signal-source.mdx`

---

## 2.55 Per-Agent Authority: Grants With Limits and Expiry, Made Through Maker Checker, Checked Before Anything Is Asked (Scoped, 2026-10-11)

**Claim:** a policy with `requireAuthorityGrant` decides a request only when its authenticated caller (`metadata.submittedBy`, which the server sets from the API key) holds an authority grant in force for the action and the request is within the grant's limits. A grant names one caller, one capability, optional limits by Intent path (`min` and `max` for a number, `oneOf` for allowed values), and an expiry at most 366 days away; it is made and revoked through maker checker (`/authority-grants`): a human proposes, a different human approves with a step up authorization, and neither may be the grantee. No grant, a revoked one, one not yet in force, a request outside a limit (or with the limited value missing or of another type), or no authenticated caller is `NOT_AUTHORIZED`; a grant past its `validUntil` is `AUTHORITY_EXPIRED`; grants that cannot be read, or no grant registry, are `AUTHORITY_UNCLEAR`. Each refuses the request before business validation, so no business system is asked, with a Refusal Record (`authority-not-authorized`, `authority-expired`, `authority-unclear`) that a signed approval cannot cure. The grant checked is recorded in `assessment.authority.grant`, signed in the record. `GET /policies/in-effect` answers `authorityGrantRequired: true` for such a policy.

Scope, stated plainly:

- **Opt in per policy, and no shipped policy opts in.** A policy without `requireAuthorityGrant` keeps the authority of 2.53.
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; `GET /authority-grants` answers in production. No grant has been made there and no production policy requires one. **Live check, passed in production 2026-10-11** (`examples/live-checks/authority-grant`): under test policy `livecheck-grant` with `requireAuthorityGrant`, each request with a valid signed approval, a request before any grant was refused (`authority-not-authorized`), one within grant `4b60507f-adb8-4fe0-82b3-a83c41e09022` (max 100) was approved, released and verified offline with the grant in the signed record, one for 500 was refused as above the granted maximum, and one after the revoke was refused. Transactions `8a75374c-150d-4cea-b57a-abb3a92bcac6`, `da96002b-66ec-44cf-88da-0f29997e4711`, `87770ab4-ac7c-4768-94a9-46df2367782b` and `41ec047d-bf64-48f4-b718-a419c7575e8d`. No production policy for a real action requires a grant yet.
- **Limits are per request.** Cumulative limits ("100000 per day") are not built.
- **The grantee is a caller id the server does not check exists.** A grant to a key that does not exist has no effect.
- **Checked at decision time.** Not re-checked at release (phase 4); the authorization's short TTL bounds the window. **Update (2026-10-11):** re-checked at release since 2.56.
- **The SDK methods** ship in the next SDK release. **Update (2026-10-11):** published in SDK 1.6.0.

Verification

- `packages/runtime/tests/unit/authority-grant-evaluator.test.ts` (14): no effect without `requireAuthorityGrant`; a current grant within limits is `AUTHORIZED` with the grant recorded; no caller (asking nothing), no grant, before `validFrom`, above a maximum, below a minimum, not in `oneOf`, a string where a number is limited and a missing value are `NOT_AUTHORIZED`; at and after `validUntil` is `AUTHORITY_EXPIRED`; the bounds themselves are allowed; the target can be limited; no registry and a failing one are `AUTHORITY_UNCLEAR`.
- `packages/runtime/tests/unit/authority-grants-runtime.test.ts` (9), through the real `RuntimeEngine` with a signed approval: execution with the grant in the Trust Record; refusals for no grant, an expired grant, a request above the limit, another caller's grant and no registry, each with business validation `NOT_EVALUATED` and nothing executed; no caller asks no registry; the expired grant signed into the Refusal Record, which verifies after a JSON round trip and fails when the status is changed; a policy without the flag reads no grant.
- `packages/api/tests/integration/authority-grants-governance.integration.test.ts` (11), through the real app: no credential 401, a service credential 403; a self grant, the grantee as checker and the maker as checker are refused; no step up is refused; an unknown change is 404; malformed fields, limits and expiry (missing, past, before `validFrom`, beyond 366 days) are 400; one pending change and one active grant per caller and capability; nothing is granted before approval; a grant starts at approval unless `validFrom` is later; a revoke keeps the row; reject needs a reason and resolves once.
- `packages/api/tests/unit/authority-grants-route-clock.test.ts` (1): a grant whose `validUntil` passed while it waited is refused on approval, granting nothing.
- `packages/api/tests/integration/authority-grant-runtime.integration.test.ts` (1): a grant made and revoked through the API is what the runtime reads: refused before it, executed within it, refused above its limit and after the revoke.
- `packages/api/tests/integration/policy-in-effect-authority-grant.integration.test.ts` (3) and `packages/policy/tests/unit/PolicyValidator-requireAuthorityGrant.test.ts` (7).
- `packages/storage/tests/integration/supabase-authority-grant-repository.integration.test.ts` (6), against Postgres 16 with every migration, run 2026-10-11: limits and expiry stored; a grant starts at approval or its `validFrom`; one pending change and one active grant per caller and capability; no double resolution; one of two simultaneous approvals applies; the database refuses a self grant, maker or grantee as checker, a grant without expiry and a revoke with limits.
- `python/tests/test_authority_grant_api.py` (7): the Python SDK's requests and decoding.

Evidence

- `packages/runtime/src/authority/AuthorityGrantEvaluator.ts`, `packages/runtime/src/RuntimeEngine.ts`
- `packages/api/src/routes/authority-grants.ts`, `packages/api/src/application.ts`
- `packages/shared/src/domain/authority-grant.ts`, `packages/storage/src/{memory,supabase}/*AuthorityGrantRepository.ts`, `supabase/migrations/20261011120000_add_authority_grants.sql`
- `docs/rfcs/RFC-0023-Business-Validation.md` (Authority grants), `docs/site/guides/grant-an-agent-authority.mdx`

---

## 2.56 What a Decision Rests On Is Re-Checked at Release, and an External System Can Execute Only If It Still Holds (Scoped, 2026-10-11)

**Claim:** the Execution Authorization Parmana signs for an approved request carries what the decision rests on: each Trusted Signal of a `VALID` business validation as a `businessConditions` entry (source, claim, subject, value, `validUntil`), and, when an authority grant authorized it, the grant's id and `validUntil` (`authorityGrant`). The Execution Gateway re-checks both before it releases the action: a condition past its `validUntil`, or a grant that has expired, been revoked or replaced, or cannot be read (or with no grant store configured), refuses the release before any connector is called and without consuming the nonce. When those are the only failed checks the request gets `409 AUTHORIZATION_NO_LONGER_VALID` with `executionStatus: NOT_EXECUTED`; a forged or tampered request stays a generic refusal. A signed release to an external connector carries the conditions, covered by its signature, and expires no later than the earliest `validUntil`; an endpoint that finds a condition no longer holds answers `success: false, conditionsNotMet: true`, recorded in the Trust Record's execution evidence as not acted on. A release whose call fails after it was sent answers `502 EXECUTION_OUTCOME_UNKNOWN` with `executionStatus: EXECUTION_UNKNOWN`, never as failed.

Scope, stated plainly:

- **"Execute only if still valid" at the system is the endpoint's to implement.** Parmana sends the signed conditions; it cannot make an endpoint check them. The SDK verifier covers them with the signature and the example endpoints check them through `conditionsHold`. Built in connectors (Paytm, HubSpot, GitHub, Slack) get the gateway re-check only.
- **A release refused at release leaves the Execution Intent `ERRORED`**, as a refused connector registration already does; the response says `NOT_EXECUTED`, and the intent is closed as `NOT_EXECUTED`.
- **The Trust Record format is unchanged.** Execution statuses are how its executions (completed, failed, `conditionsNotMet`) and the intents are read, not a new field.
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed. Not yet exercised in production: no production decision carries conditions or a grant until a policy uses `signalSources` or `requireAuthorityGrant`. **Live check (2026-10-11):** both checks above passed in production; the source check's approved request carried its Trusted Signal into the authorization and the release (`d736681f-8d86-4e24-bcf3-66debfa6ac23`). The receiving endpoint's log line showing the release's `conditions` was not checked.

Verification

- `packages/execution-gateway/tests/unit/release-recheck.test.ts` (12): a current condition releases and is recorded as checked; a condition past `validUntil` refuses, names the fact, calls no connector, consumes no nonce, and is `AUTHORIZATION_NO_LONGER_VALID` / `NOT_EXECUTED`; no new check without conditions or grant; a grant still active releases; a grant revoked, replaced, expired, shortened since the decision, unreadable, or with no registry refuses; a grant with no caller refuses; a forged authorization with an expired condition stays a generic refusal.
- `packages/execution-gateway/tests/unit/external-adapter-conditions.test.ts` (7): the conditions are signed into the release, which expires at the earliest `validUntil` (and otherwise after 60 seconds); the SDK's `verifyParmanaRelease` accepts it, refuses it after that time, and refuses a changed condition; `conditionsNotMet` is recorded and malformed variants are refused; through the documented endpoint (`typescript/examples/07`), it acts when the conditions hold and does not act when one does not.
- `python/tests/test_external_connector_endpoint_conditions.py` (2): the Python example endpoint acts only when `conditions_hold` says so, and answers a repeat with its first answer.
- `packages/runtime/tests/unit/business-validation.test.ts` and `authority-grants-runtime.test.ts`: the engine signs the Trusted Signal and the grant into the authorization.
- `packages/api/tests/integration/execution-failure.integration.test.ts`: `EXECUTION_OUTCOME_UNKNOWN` answers `executionStatus: EXECUTION_UNKNOWN`.

Evidence

- `packages/shared/src/domain/execution-authorization.ts` (`businessConditions`, `authorityGrant`), `packages/crypto/src/AuthorizationSigner.ts`, `packages/runtime/src/RuntimeEngine.ts`
- `packages/execution-gateway/src/ExecutionGateway.ts` (`businessConditionsCurrent`, `authorityGrantInForce`), `packages/shared/src/errors/authorization-no-longer-valid-error.ts`, `packages/api/src/bootstrap/createExecutionGateway.ts`
- `packages/execution-gateway/src/connector-execution/GatewayExternalAdapter.ts` (`conditions`, `conditionsNotMet`), `typescript/src/crypto/release.ts`, `typescript/examples/07-external-connector-endpoint.ts`, `python/examples/13_external_connector_endpoint.py`
- `docs/rfcs/RFC-0023-Business-Validation.md` (Execution)

---

## 2.57 Proof Audit: Five Authorization Properties Tested by Execution (Scoped, 2026-10-16)

**Claim.** Five properties of Parmana's authorization proofs were tested by running the code
paths, not by reading them. The tests are in `proof-audit/tests/` and run with
`npx vitest run proof-audit/tests` after `npm ci` and `npm run build`. Each case writes a
`PASS` or `FAIL` verdict to `proof-audit/results/`.

1. **Third-party verification without Parmana's services, database or private keys: Verified** for the
   Execution Trust Record bundle. A proof verifies in a fresh process with an empty environment, no
   key files and the network denied, both in-process and in an empty network namespace. Nine field
   changes (decision, amount, action ID, timestamps, policy version, both signatures) each fail. Scope:
   the verifier no longer reads a `.env` file on import (G-112).
2. **Execution requires a valid, current proof: Verified for the Paytm refund, Slack, GitHub and HubSpot paths.** A missing,
   forged, expired, revoked, mismatched or denied-decision proof each reaches the external endpoint zero
   times. A control with an approved decision reaches it once. The same conditions hold for Slack, GitHub and HubSpot (Tests 7 to 9). Other connectors are not yet covered (G-115).
3. **A proof authorizes only the parameters it was issued for: Verified for the Paytm refund path.**
   A changed amount, target, recipient identifier, connector, operation or validity window is rejected.
   Replay is rejected at the gateway and at the API, each with zero extra endpoint calls.
4. **An old proof verifies against the policy version it cites, and a published version cannot be
   overwritten in place: Verified. The startup governance integrity check is now exercised by the audit
   (Test 4); running it against the live policy directory remains an operator step.** Adding a version leaves old proofs valid. A different-content rewrite is refused
   with `409` and the stored content is unchanged. An identical re-save is allowed (G-106).
5. **Altering or deleting a stored audit record is detectable: Detected** for content edits, middle and
   first deletions, and both reorder forms, in the per-caller chain and the per-authorization execution chain. the newest record is
   detected only when the chain head is anchored outside the database** (G-108).

**What the audit found first.** The first run falsified claim 2 (the gateway released a validly signed
denied decision, and the in-process release path accepted caller-set flags), claim 4 (a published
version could be overwritten) and claim 5 (tail truncation). The fixes and their residuals are recorded in `docs/VERIFICATION-GAPS.md`, G-103 to G-118.
The first-run measurements are kept in an internal working report that is not part of the repository.

**Coverage after the follow-up fixes.** The same gate conditions now run for Paytm refund, Slack post-message,
GitHub PR merge and HubSpot deal-update (Tests 2, 7, 8, 9). The Postgres nonce store runs on PostgreSQL semantics
(Test 6). The startup governance integrity check runs against a signed approval record (Test 4). Not yet
covered: KMS signing, a live external connector endpoint, and the caller
authorization scoping (the API harness disables caller authentication, as the existing integration tests do).
These are listed as open in `docs/REMAINING-WORK.md` section M.

**Evidence.** `proof-audit/tests/test1-independent-verification.test.ts` through
`test10-execution-audit.test.ts`; `packages/api/src/bootstrap/createReleaseVerifier.ts`;
`packages/execution-control/src/ExecutionControlService.ts`; `packages/execution-gateway/src/ExecutionGateway.ts`
(`decisionApproved`); `packages/policy/src/FilePolicyRepository.ts` (`save`, `PolicyVersionImmutableError`);
`packages/crypto/src/CallerAuditChainVerifier.ts` (`verifyChain`, the `anchor` argument).

## 2.23 Independently Certified Authorization (Phase 3D)

_"Even if AI has valid credentials, it still cannot execute anything your business hasn't authorized. No exceptions"_ — the specific claim tracked and re-verified across the Phase 2K capability policy binding record (in git history), the Phase 2L authorization exceptions record (in git history) (which found it **not fully supported**, naming two exceptions: Razorpay's caller-declared daily cumulative total, and HubSpot's caller-declared `preAuthorizedForAmountChange`) — was independently re-certified from current repository state in the Phase 3D independent authorization certification (in git history), treating every prior phase's conclusion as a claim to re-verify, not inherit.

**Result: CLAIM FULLY CERTIFIED** for both capabilities actually reachable in production (`razorpay:refund-create`, `hubspot:deal-update`). Both of Phase 2L's named exceptions are independently confirmed closed at the mechanism level (2.4/3.4/3.10's own TD-23 updates), credential isolation, structural capability-to-policy binding (2.22, TD-22), replay resistance, concurrency safety, and auditability were each independently re-traced from source, and no repository evidence was found that contradicts the claim for either in-scope capability — no counter-example, exploit, or bypass path was located during the certification's adversarial review (§10 of that document).

Two narrow, genuinely fixable gaps the certification disclosed were closed in the same follow-up session, not merely noted: a truncated-credential-fragment leak into the caller-visible response (3.4/3.10's `keyIdRedacted`/`bearerRedacted` now return a one-way SHA-256 fingerprint, never a literal credential substring — see 3.4/3.10's own updates below) and a missing live-database concurrency proof for the Razorpay daily-refund-cap ledger (`packages/storage/tests/integration/supabase-razorpay-daily-refund-ledger.integration.test.ts`, new). **`payments:execute`/vendor-payment, originally carried forward here as a sixth disclosed limitation (a capability that would have failed this claim entirely if ever made production-reachable), was removed from the repository outright** rather than independently verified — it was never on the roadmap as a real capability; see `docs/VERIFICATION-GAPS.md` G-27 for the full account, including what was deliberately retained (the policy file and shared test fixtures that use it as generic example data, which carry no execution risk with zero connector able to back them). Five further disclosed limitations remain carried forward explicitly, each with a stated reason it was not force-closed: HubSpot's approval-issuer registry has never yet been exercised against a real operator-provisioned key; the internal Gateway attestation relies on an upstream nonce check rather than its own independent TTL; the internal gateway-session/credential-vault layer is single-process scoped; `OverrideService`'s continued, deliberate unreachability; and hybrid/PQ signing's scope stopping short of execution-authorization/Gateway/connector signing (most decisively for `OverrideService`, where a standing security guard said not to wire it up; it was later removed, see `docs/VERIFICATION-GAPS.md` G-5). None of the five carried-forward items provide a currently exploitable path to unauthorized execution — full detail, with exact certification section references for each, in `docs/VERIFICATION-GAPS.md`'s "Gaps closed in the Phase 3D certification session".

Evidence

- the Phase 3D independent authorization certification, in git history (full methodology, per-property verification, adversarial assessment, evidence summary)

- packages/connector-hubspot/src/HubSpotTypes.ts (`redactHubSpotToken`, fingerprint-based)

- packages/execution-gateway/tests/unit/credential-non-exposure.test.ts (independent claims audit, 2026-08-19): closes the one property this certification's own connector-level test suites had not asserted explicitly — that `GatewayHubSpotAdapter` never retains a resolved credential as instance state between calls (structural check that no instance field is credential-shaped, plus a same-instance two-call test with two different tokens proving each call authenticates independently, never from carried-over state)

**Update (2026-08-24 documentation-currency pass):** this certification was performed, and the "CLAIM FULLY CERTIFIED for both capabilities" verdict above was written, while the Razorpay connector still existed. The Razorpay connector — including `razorpay:refund-create`, the `RazorpayTypes.ts` redaction this section previously cited, and the daily-refund-cap ledger integration test previously cited here — was deliberately removed in its entirety on 2026-08-12 (see §3.16's own update, and this document's historical §3.8/§3.9). `razorpay:refund-create` is therefore no longer a production-reachable capability, and this certification's Razorpay-specific findings are historical: an accurate record of what was independently verified about that connector _while it existed_, not a description of current production reachability. The `hubspot:deal-update` findings are unaffected by the removal and remain current — as of this update, `hubspot:deal-update` is the only capability the "CLAIM FULLY CERTIFIED" verdict above actually describes in present-tense production terms.

**Update (2026-08-25 audit-fix pass):** `github:pr-merge` (and `github:pr-fetch`) also became production-reachable on 2026-08-19 (§3.17), ten days before the update above was written, but was missed by it. Precisely: Phase 3D's certification document is dated 2026-08-09 and contains zero mentions of GitHub — it predates the connector entirely and never assessed it. `github:pr-merge` is therefore **not covered by the "CLAIM FULLY CERTIFIED" verdict above**, in either direction; nothing here should be read as either certifying or doubting its authorization strength. §3.17's own test suite (22 hermetic unit tests, 4 integration tests through the real `POST /execute` bootstrap chain) independently demonstrates policy-denial-makes-zero-calls and credential isolation for GitHub specifically, but that is §3.17's claim, not a Phase-3D-style adversarial certification. Separately, and more directly relevant to this claim's "no exceptions" wording: `docs/VERIFICATION-GAPS.md` G-30 found, and same-day resolved, that `github:pr-merge` had no entry in `CANONICAL_CAPABILITY_POLICY_BINDINGS`, meaning the structural capability-to-policy binding 2.22 describes briefly did not extend to it. That specific gap is now closed (2.22's own update); it does not retroactively make Phase 3D's certification cover GitHub — `hubspot:deal-update` remains the only capability this section's "CLAIM FULLY CERTIFIED" verdict describes.

---

## 2.24 Authorization Is Caller-Type-Agnostic

The authorization pipeline's outcome depends only on the requested action, the governing policy, and the independently-verified facts bearing on it — never on what kind of system, model, or entity submitted the request. This is the source-code basis for the positioning claim that Parmana protects institutional authority against execution risk from any source (AI agents, humans, applications, automated systems, third-party systems, compromised systems), not only AI: the mechanism does not special-case any of them, including ones it has no name for.

Directly validated, not inferred from the absence of AI-specific code: `BusinessTransactionMapper.fromRequest` (`packages/api/src/mappers/BusinessTransactionMapper.ts:28`) casts the caller-declared `authority` field with no runtime validation against the `AuthorityType` enum (`USER | ROLE | SERVICE | ORGANIZATION`, `packages/shared/src/domain/authority.ts`) — an arbitrary string reaches the runtime unfiltered. `RuntimeEngine`, `PolicyEngine`, `SignalIntentBinder`, and `CapabilityPolicyBinder` contain zero references to `authority` or caller identity anywhere in their source (confirmed by direct grep across all four files). A regression test submits two transactions through the real `POST /execute` route, identical in every field except `authority.authorityType` — one declaring the conventional `"USER"`, the other declaring `"FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE"`, a value that is not a member of the enum at all — and asserts byte-identical decisions (`outcome`, `matchedRuleId`, and, for the rejection case, the exact error text) on both the APPROVE and REJECT paths.

Independently confirmed by the Strategic Positioning source-code validation audit (2026-08-09, read-only): the caller-authentication layer (`StaticKeyAuthenticator`, `packages/api/src/auth/StaticKeyAuthenticator.ts`) authenticates by opaque API-key hash comparison only, with no concept of caller category either — the same identity mechanism a human operator, a script, an AI agent, or a third-party integration would all use identically.

**Scope, precisely:** this claim covers `hubspot:deal-update` and, since 2026-08-19, `github:pr-merge`/`github:pr-fetch` (§3.17; missed by the 2026-08-24 pass that last touched this paragraph — see 2.23's own 2026-08-25 update) — the capabilities actually production-reachable today (`razorpay:refund-create` was covered when this claim was originally written and validated, but no longer exists as a registered capability, removed 2026-08-12) — and the general-purpose pipeline mechanism itself, which the regression test below exercises independently of any specific capability. The mechanism's caller-agnosticism does not depend on which capability is invoked (2.24's own evidence is about `RuntimeEngine`/`PolicyEngine`/`SignalIntentBinder`/`CapabilityPolicyBinder` never reading caller identity at all, not about per-capability behavior), so this claim's substance is unaffected by G-30 — G-30 is about policy _binding_ coverage, not caller-type discrimination. It does not claim that a non-AI caller has actually been exercised against a live production deployment — only that the mechanism contains no code path that could distinguish one caller kind from another to begin with.

Evidence

- packages/api/tests/integration/authority-type-agnostic-execution.integration.test.ts (2 cases: identical APPROVE, identical REJECT, across a conventional and a non-enum `authorityType`)

- packages/api/src/mappers/BusinessTransactionMapper.ts (unvalidated `authority` cast)

- packages/shared/src/domain/authority.ts (`AuthorityType` enum)

- packages/api/src/auth/StaticKeyAuthenticator.ts (caller-type-agnostic authentication)

- Repo-wide grep confirming zero `authority`/caller-identity references in RuntimeEngine.ts, PolicyEngine.ts, SignalIntentBinder.ts, CapabilityPolicyBinding.ts (as of this check, 2026-08-09, the last file lived at `packages/policy/src/`; moved to `packages/capability-registry/src/` 2026-08-26 — same file content, unaffected by the move)

- examples/tutorials/100-authorization-caller-type-agnostic/run.ts (runnable narrative, library-level: `"USER"` vs. `"FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE"` produce byte-identical outcomes and reasons on both the APPROVE and REJECT paths)

---

## 2.25 Strategic Positioning — Independently Validated, YES (Pass 4)

_"Only what you authorize should become real"_ — the specific invariant underlying the "We Are Not in the AI Race" positioning — was independently, repeatedly source-code-validated across four passes (the strategic positioning validation record, in git history). The first three passes reached **PARTIALLY SUPPORTED**: the authorization mechanism itself was fully validated for every capability actually reachable in production, but `payments:execute` (vendor-payment) existed in committed code with unverified caller-declared signals, gated only by `NODE_ENV`, not by any authorization-strength property — a capability that would have violated the claim had it ever been enabled as it then existed.

**The fourth pass, run fresh with no reliance on the first three passes' conclusions, upgraded the verdict to SUPPORTED BY IMPLEMENTATION — YES.** The structural change: `payments:execute` was removed from the repository entirely (`docs/VERIFICATION-GAPS.md` G-27), not gated more tightly. `createConnectorRegistry.ts`, at the time of this pass, registered exactly three connectors in production wiring — `test-fixture` (a `NODE_ENV=test`-only, unbound, no-production-implication connector introduced solely to keep shared test infrastructure executable), `razorpay`, `hubspot` — and `payments:execute` had no connector to resolve to in any environment, independently confirmed by a dedicated regression test asserting this across `test`, `production`, and `development` `NODE_ENV` values. The fourth pass separately, freshly re-scrutinized the replacement test-only connector itself for new bypass risk (rather than assuming it safe by association with the removal) and found none: it is fail-closed by the identical mechanism every other connector in this registry uses, and unbound from `CapabilityPolicyBinding.ts`'s governance entirely.

**Update (2026-08-24 documentation-currency pass):** the connector count above ("exactly three... test-fixture, razorpay, hubspot") described `createConnectorRegistry.ts` as it stood at pass 4's time, before the Razorpay connector was deliberately removed on 2026-08-12 (see §3.16's own update). `createConnectorRegistry.ts` now registers exactly **two** connectors — `test-fixture`, `hubspot` — with zero references to `razorpay` anywhere in the file, confirmed by direct reading and by `create-connector-registry.test.ts`'s own current content, which is entirely HubSpot-scoped. This does not change the YES verdict above (the removal only shrinks the set of registered connectors further; `payments:execute` still has no connector to resolve to, and no new capability was added that would need re-validating) — it corrects a count that is now one connector out of date.

**Update (2026-08-25 audit-fix pass):** the "exactly two" count directly above was itself already wrong the day it was written. `createConnectorRegistry.ts` conditionally registers a third connector, `github` (`createGitHubConnector`, `github:pr-fetch`/`github:pr-merge`, §3.17), wired in on 2026-08-19 — five days before the 2026-08-24 pass re-counted the file and still reported two. Confirmed directly by re-reading `createConnectorRegistry.ts` itself, which conditionally registers `test-fixture`, `hubspot`, and `github`. This does not change the YES verdict — GitHub's authorization mechanism is the same caller-agnostic pipeline, and `payments:execute` still has no connector — but it is the second time in this section's history a connector count was asserted without actually re-deriving it from the file, and the miscount stood for a full day of otherwise-careful documentation-currency work. `docs/VERIFICATION-GAPS.md` G-30 has the fuller account of what else this same miscount caused to be missed (§2.22's binding-coverage claim).

**Honesty constraint, carried from the fourth pass's own report, not rounded away here:** that pass re-executed only 2 of the 10 negative tests cited across this validation's history fresh (`authority-type-agnostic-execution.integration.test.ts`; `create-connector-registry.test.ts`'s new absence case) — §6 of the other 8 were cited from code paths confirmed structurally unchanged by the removal, not individually re-run in that session. Multi-tenant/cross-institution authority isolation and the direct-database-write bypass finding were explicitly left as "unchanged, not re-traced," not re-asserted clean. The YES verdict means the specific invariant is now supported without a known exception for every capability this repository currently exposes — it is not a claim that every adjacent property was re-proven from scratch in the same session. Full precision on this distinction: the strategic positioning validation record (in git history) ("Final Answer").

Evidence

- the strategic positioning validation record, in git history (full four-pass history, claim-by-claim matrices, execution control path, bypass analysis, negative-test evidence for each pass)

- docs/VERIFICATION-GAPS.md G-27 (the removal this upgrade rests on)

- packages/api/tests/unit/bootstrap/create-connector-registry.test.ts ("payments:execute has no connector to resolve to in any environment")

- packages/api/tests/integration/authority-type-agnostic-execution.integration.test.ts (re-run fresh in pass 4, 2/2 passing, confirming no regression)

- packages/api/src/bootstrap/createConnectorRegistry.ts, createTestFixtureConnector.ts (the exact production registration state pass 4 verified)

---

**Update (2026-10-03):** "independently" in this section means each pass was run fresh, without relying on the earlier passes' conclusions. All four passes were internal reviews within Parmana's own development process, not an audit by a third party.

## 2.26 Policy Governance (Maker-Checker)

Policy content changes now go through a human-only, maker-checker approval flow before taking effect, closing the prior gap that policy authoring was entirely outside Parmana's own governance surface: any caller with write access to `policies/` could change what a policy allows with no second party involved and no durable, signed record of who approved it.

**Lifecycle and the four endpoints.** A change moves `PENDING_APPROVAL` → `APPROVED`/`REJECTED`, exactly once, never back (`packages/shared/src/domain/pending-policy-change.ts`). Four endpoints in `packages/api/src/routes/pending-policy-changes.ts` cover the full flow — `POST /:name/:version/pending-changes` (propose), `GET /pending-changes` (list with embedded diff), `POST /pending-changes/:id/approve`, `POST /pending-changes/:id/reject` — and every one of the four calls `requireHumanCaller()` before doing anything else. `isHumanCaller()` itself (`packages/api/src/auth/isHumanCaller.ts`) is unit-tested directly (`packages/api/tests/unit/isHumanCaller.test.ts`, 3 cases: USER accepted, undefined credentialHolderType fails closed, ROLE/SERVICE/ORGANIZATION all denied the same as unset), and each endpoint is separately exercised at the HTTP level in `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` (non-human denial on propose, list, approve, and reject).

**Maker ≠ checker.** `SameActorCannotApproveOwnChangeError` is thrown independently on both approve and reject in `pending-policy-changes.ts` when `proposedBy === req.callerId`, verified by `"rejects the maker approving its own change with 403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE"` and `"rejects the maker rejecting its own change with 403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE"` in the same integration suite.

**Step-up authorization (Layer 4).** Approve/reject additionally require a `PolicyChangeStepUpAuthorization` envelope (`packages/shared/src/domain/policy-change-step-up-authorization.ts`) signed by the checker's own key, on top of — never instead of — their bearer token. `PolicyChangeStepUpVerifier` (`packages/api/src/auth/PolicyChangeStepUpVerifier.ts`) reuses `@parmana/envelope-verifier`'s `NonceStore` interface with a dedicated instance/table (`createPolicyChangeStepUpNonceStore.ts`, `SupabasePolicyChangeStepUpNonceStore`) so step-up replay protection never shares a namespace with execution-authorization or approval-artifact nonces. The integration suite proves a missing envelope, an expired one, and a replayed one are each independently rejected, alongside wrong-id/wrong-action/wrong-key cases. Per-check diagnostic detail is logged server-side only (`console.error`, never in the HTTP response) — an earlier draft of this endpoint leaked that detail into the 403 body; caught and fixed before merge, not shipped.

**File write and signing, in the safer order.** `PolicyChangeApprovalService.approve()` (`packages/api/src/governance/PolicyChangeApprovalService.ts`) signs and durably persists the `PolicyChangeApprovalRecord` _before_ writing the live `policies/{name}/{version}/policy.json` file (`policyChangeApprovalRecordRepository.create()`, then `policyRepository.save()`) — not merely documented as the intent but proven: `packages/api/tests/unit/PolicyChangeApprovalService.test.ts` injects a failure at each step independently and confirms (1) when the file write fails, the signed record still exists and independently verifies, and (2) when persisting the record fails, the file write is never attempted at all. The whole service runs before `PendingPolicyChangeRepository.resolve()`, so a failure anywhere in it leaves the pending change untouched rather than falsely marked `APPROVED`.

**Content hash at decision time (G-24).** Separately from the governance write path, `RuntimeEngine.execute()` now stamps `ExecutionTrustRecord.transaction.policy.contentHash` with a hash of the policy document actually loaded for that decision (`packages/runtime/src/RuntimeEngine.ts`, computed at line 204 via the same `TrustRecordHasher` every other artifact hash in this codebase uses, merged into the trust-record-bound copy only — never into the caller-submitted `BusinessTransaction`, which is already persisted, contentHash-free, before this point). `packages/runtime/tests/e2e/runtime.e2e.test.ts`'s `"stamps transaction.policy.contentHash on the Execution Trust Record with a hash of the real loaded policy content (G-24, policy-governance milestone)"` proves the stamped value equals an independently-computed hash of the real on-disk `vendor-payment/2.0.0` policy, and differs when the content differs.

**Deploy/startup integrity check.** `verifyPolicyGovernanceIntegrityAtStartup()` (`packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts`) compares every approved `(policyName, policyVersion)`'s live file against `PolicyChangeApprovalRecordRepository.findMostRecentFor(...).contentHashAfter`, catching a file edited outside the pending-change API. It is fired from `server.ts` (line 89) _after_ `app.listen()` (line 74) without being awaited, and is deliberately fail-open — the opposite discipline of `assertStorageConfigured`/`assertSigningKeyMaterialConfigured` earlier in the same file. Four distinct log events keep outcomes from blurring together: `policy_governance_integrity_check_unavailable` ("couldn't check"), `policy_governance_integrity_mismatch` ("checked, found a problem"), and `policy_governance_integrity_check_passed` ("checked, clean"). A re-approved version is checked exactly once, against the most recent record, and one bad pair never blocks the check for the rest — all proven by `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts`'s 7 cases.

**Update (2026-10-15): the startup call now blocks.** The one-time check at startup is no longer fire-and-forget. `server.ts` awaits `assertPolicyGovernanceIntegrityAtStartup()` (`packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts`) before `app.listen()`. The server does not start if an approved policy's live file does not match its approval record (`missing`, `content-mismatch`, `signature-invalid` or `chain-broken`), or if the approval records cannot be listed, so the check cannot run. The process exits with status 1 and logs `policy_governance_integrity_startup_refused`. A database with no approval records still starts. The periodic re-run (`schedulePolicyGovernanceIntegrityCheck`) stays fail-open, so drift found during uptime is logged, not fatal. The one-time startup runner and its test were removed. Tests: `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts` adds three startup cases (clean, missing file, repository unavailable). Scope: this gates the check's result at boot only. A database outage at boot now stops the server until the database is reachable. Status: on branch `claude/startup-integrity-block`, pending merge.

**`governance-ui`: a read-only internal tool, by design.** `packages/governance-ui` is a small standalone Express package (server-rendered templates, no client-side JS or build step) covering propose/list/diff-review only. It has exactly five routes — `GET`/`POST /login`, `POST /logout`, `GET /` (list), `GET /pending-changes/:id` (diff) — and no route, form, or template anywhere targets `/approve` or `/reject`; the diff page's instructions tell a checker to run `scripts/sign-policy-change-step-up.ts` locally and submit the result themselves, with their own bearer token, outside this UI entirely. A submitted API key is validated once against `GET /callers/me`, then held only in an in-memory, server-side `express-session` — it is attached as the outbound `Authorization` header on every call this UI makes to `packages/api` and never appears in any rendered response; a live check against a real running API, performed during the 2026-08-18 session that added this section, confirmed the raw key string is absent from every page produced. `packages/governance-ui/tests/integration/app.integration.test.ts`'s `"escapes attacker-controlled content (reason, proposer) rather than rendering it raw"` proves a maker-supplied `reason`/`proposedBy` containing a `<script>` tag renders escaped, not executable, in the checker's browser.

**Update (2026-09-10):** this package was outside the original scope of the audits that produced the claims above, which focused on `packages/api`. A follow-up review covered it directly and found one real gap: `POST /login`, this tool's only unauthenticated route, and the only place in this entire codebase that validates a submitted credential against the real API in a "try a key and see" pattern (the API itself has no equivalent endpoint), had no rate limiting at all. Now rate-limited (`express-rate-limit`, 10 attempts/minute, IP-keyed, constructed per app instance). Everything else reviewed in the same pass (session-fixation hardening, cookie flags, XSS-safe rendering) was already correct, as described above. See `docs/VERIFICATION-GAPS.md` G-47.

Evidence (update)

- `packages/governance-ui/src/routes/login.ts`
- `packages/governance-ui/tests/integration/app.integration.test.ts`: 11 sequential `POST /login` attempts, the 11th returns 429

**Deliberate scope boundaries, not gaps.** Two things are intentionally not built: `@parmana/sdk` does not yet expose these four endpoints — `governance-ui` calls `packages/api` directly over plain `fetch`, and adding SDK methods is deferred until a second real consumer exists beyond this UI, not an oversight. And approve/reject remain CLI-only by design: `governance-ui` never handles step-up private key material, since the entire security guarantee of step-up authorization rests on that key never leaving the checker's own machine — a web UI collecting it would defeat the property the mechanism exists to provide.

**Independently audited, separately from the build.** A follow-up audit re-verified every claim above from source rather than trusting the build session's own summary: re-running the full test suite fresh, tracing the approve flow's actual code order end to end, independently re-computing the content-hash-at-decision-time value from scratch (a hand-rolled canonicalization and sha256 implementation, not the codebase's own hasher) against a live execution, and grepping for any private-key material or alternate bypass path. It found two real, narrow defects — both fixed and covered by a new regression test: a single stray NUL byte in `verifyPolicyGovernanceIntegrityAtStartup.ts` (cosmetic — it made the file render as a binary diff in git, not a functional bug) and a real gap in the fail-open guarantee, where the since-removed one-time startup runner (removed 2026-10-15, see git history) constructed `PolicyChangeCrypto` synchronously, outside the promise `.catch()` meant to guard it, so a future constructor failure could have propagated and crashed the process after the port was already bound. The since-removed test for that runner proves the fix: confirmed failing against the pre-fix code, then confirmed passing against the fix.

**Deployment status.** This claim is about what exists in the repository and is proven correct by the tests cited above, not about what is currently running in any live environment. The backend (maker-checker endpoints, step-up auth, sign-then-write ordering, content-hash-at-decision-time, the startup integrity check) is committed and pushed to `origin/main`. Whether `parmana-api.fly.dev` / `parmana-api-live.fly.dev` are running this code has not been checked as part of this claim and is not asserted here.

**Positive-pass evidence anchor, added 2026-09-15 (docs/VERIFICATION-GAPS.md G-45).** A gap
found the same day was fixed the same day: `PolicyGovernanceExecutionVerifier.verify()`
(packages/api/src/governance/PolicyGovernanceExecutionVerifier.ts) — the class this section's
"Content hash at decision time (G-24)" and 2.27's policy-freshness check both feed into when
`POLICY_EXECUTION_VERIFICATION_ENFORCED=true` — checks a policy's most recent
`PolicyChangeApprovalRecord` exists, verifies, and content-hash-matches, but returns bare
`undefined` on success, leaving no durable trace that the check ran and passed. New
`PolicyGovernanceAnchorResolver` (packages/api/src/governance/PolicyGovernanceAnchorResolver.ts)
performs the identical three checks but always returns a status (`VERIFIED` |
`NO_APPROVAL_RECORD` | `SIGNATURE_INVALID` | `CONTENT_MISMATCH`), never blocks execution (a
resolver error is caught and logged, never allowed to affect the real outcome), and — unlike
the enforcement verifier — is wired unconditionally, with no
`POLICY_EXECUTION_VERIFICATION_ENFORCED` gate, since resolving is never itself a rejection
risk. `PolicyReference.contentHash`'s sibling field, `governanceAnchor`
(packages/shared/src/domain/policy-reference.ts), carries the result on the trust-record-bound
copy of `transaction.policy` — every `ExecutionTrustRecord` now honestly records
`NO_APPROVAL_RECORD` for this deployment's current policies rather than being silent about the
question. Verified via packages/api/tests/unit/PolicyGovernanceAnchorResolver.test.ts and two
new packages/runtime/tests/e2e/runtime.e2e.test.ts cases (result stamped correctly; a
resolver failure never blocks a real execution), plus a live check against a locally-running
instance.

**Connector-evidence linkage, added same day.** `ExecutionTrustRecord` gained `evidenceAnchor`
(packages/shared/src/domain/evidence-anchor.ts), built by
`BusinessTrustRecordBuilder.buildEvidenceAnchor()`
(packages/runtime/src/BusinessTrustRecordBuilder.ts): an explicit `{policyContentHash,
governanceAnchorStatus, connectorEvidenceHash, anchorHash}` pointer, entirely within
`packages/runtime` — `RuntimeContext` already carries both the resolved governance anchor and
the connector's evidence by the time the trust record is assembled, so no cross-package
interface change was needed. Not a new cryptographic guarantee on its own (both were already
covered by `trustRecordHash`/`signature`), but a single, explicitly-named pointer an auditor
can check without reconstructing the binding themselves. Verified via
packages/runtime/tests/unit/BusinessTrustRecordBuilder.test.ts and a real live execution.

Separately, unaffected by this fix: `POLICY_EXECUTION_VERIFICATION_ENFORCED` itself (the
enforcement gate, distinct from the anchor resolver above) remains off by default and cannot
safely turn on until the "Legacy-policy backfill" entry below completes, and G-47's
enforcement-severity question (docs/VERIFICATION-GAPS.md) is unaffected — this fix makes the
evidence more complete, not what enforcement does with a mismatch. All found by an
independent read-only audit (the 2026-09-15 evidence anchor audit, in git history)
(GAP-4), whose own first pass initially concluded no policy-content-to-governance linkage
existed at all before finding this section and correcting itself — see that document's §4 and
its same-day addendum.

**Open question: internal vs. external policy authoring.** The system described above resolves _how_ a policy change is approved once Parmana is the system of record for that approval. It does not resolve _whether_ Parmana should be the system of record at all: an alternative architecture — policies authored and approved in an external system, with Parmana staying strictly read-only/enforcement-only for policy content (loading and evaluating whatever content it is handed, verifying its provenance, never hosting the approval workflow itself) — remains a live, undecided option. Nothing in the codebase picks a side; the maker-checker system exists because policy authoring was previously outside any governance surface at all (this section's opening claim), not because "build it internally" was compared against and preferred over the external alternative. Treat this as an open question, not a resolved default.

**Open question: the human-vs-AI-agent identity problem.** `isHumanCaller()` (`packages/api/src/auth/isHumanCaller.ts`) checks `credentialHolderType === AuthorityType.USER` — a value set once, at credential-issuance time, by whoever provisions the credential. Nothing in this codebase, or in any bearer-token/asymmetric-key scheme generally, technically verifies that the entity that generated the key material and holds the private key is a human rather than an automated system with access to the provisioning step. This is a known, general limitation of software-based identity, not a Parmana-specific gap, and not one a purely technical fix within this codebase can close: a credential's `USER` flag is exactly as trustworthy as the process that set it, never more. The current mitigation is operational, not code-enforced: the standing rule is that key generation and step-up signing for a checker's credential must happen on a device with no AI agent access, so that whatever holds the resulting private key is, by the constraints of that device, a human acting directly. No code path in `PolicyChangeStepUpVerifier`, `isHumanCaller`, or anywhere else in this feature checks or enforces that rule — it is a process control sitting outside the system, the same category as "don't commit your private key," not a guarantee this repository's tests can prove.

**Preventive Git-layer enforcement: CI check exists and is fail-closed; enabling it as a required check is blocked by GitHub plan/visibility, not by anything in this codebase.** The maker-checker API above governs every write that goes through `pending-policy-changes.ts`, but it cannot by itself prevent a direct edit to `policies/{name}/{version}/policy.json` committed straight to the repository, bypassing the approval workflow entirely. `scripts/verify-policy-changes-approved.ts` closes the detection half of that gap: given a list of changed policy files (or `--full-scan`), it hashes each file's live content (`PolicyChangeCrypto.hashPolicyContent`) and checks it against `policy_change_approval_records`' `content_hash_after` for that `(policyName, policyVersion)`, via a read-only Supabase `anon` credential scoped by RLS to that one table (`supabase/migrations/20260818150000_add_ci_read_only_policy_for_approval_records.sql`) — deliberately not `DATABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, which would grant read+write on every table. It is fail-**closed** by design, the opposite discipline from `verifyPolicyGovernanceIntegrityAtStartup`'s fail-open startup check: a missing approval record, a content-hash mismatch, _and_ any failure to complete the check at all (Supabase unreachable, a malformed response) are all treated identically as a failure — there is no "couldn't check, let it pass" path. `.github/workflows/ci.yml`'s `verify-policy-approvals` job runs this on every push and pull request against whichever `policies/**/policy.json` files changed, and already fails the job (non-zero exit) on a bypass — this is not advisory logging. What is genuinely missing is the last step: telling GitHub to treat that job's pass/fail as a required condition for merging into `main` (via branch protection). Attempting to enable it this session (`PUT /repos/{owner}/{repo}/branches/main/protection`, admin-authenticated) failed with a real, externally-imposed constraint: `403 Upgrade to GitHub Pro or make this repository public to enable this feature` — branch protection rules are not available on a private repository under this account's current GitHub plan. This is exactly the condition the CI job's own header comment already anticipated ("if/when this repo's plan or visibility ever allows branch protection to be enabled"), not a gap introduced or overlooked by this pass. **Precise current state:** a direct `git push` to `main` containing an unapproved `policy.json` edit will be caught and reported by CI (the job fails, visibly, on that commit) but is not currently _prevented_ from landing on `main` — detection is real and automatic; prevention requires either a paid GitHub plan or making this proprietary, evaluation-only repository public, and no decision has been made to do either.

**Update (2026-09-28, G-79, D-6):** the check now runs with its secrets, checks every policy file on every push and pull request (`--full-scan`), and is a required status check on `main` (branch protection enabled once the repository was public). A pull request that adds a policy version can merge only after that version is approved in production. Pull requests from forks get no secrets, so they fail the check.

**Legacy-policy backfill: resolved 2026-09-16.** The pause point described below (originally: awaiting a second, genuinely distinct human checker) is closed. A distinct reviewer identity, `policy-reviewer-1` (`credentialHolderType: USER`, provisioned via `scripts/generate-api-key.ts --generate-step-up-key`, genuinely separate bearer key and step-up keypair from the proposer `charak1987`), approved all 10 of the original 2026-08-19 proposals plus 4 additional pre-existing policies that had never been proposed at all (`agent-vendor-payment`, `api-key-issuance`, `expense-reimbursement`, `slack-post-message`), for 14 total, following the policy approval runbook (in git history). Every approval went through the real endpoints (`POST /:name/:version/pending-changes`, `POST /pending-changes/:id/approve`), step-up signed and verified, `SameActorCannotApproveOwnChangeError` never triggered since `proposedBy` (`charak1987`) and `approvedBy` (`policy-reviewer-1`) were always genuinely distinct credentials. **Correction (2026-09-28):** distinct credentials, not proven distinct people. The `policy-reviewer-1` step up private key was kept on the proposer's machine (recorded 2026-09-27), so these approvals do not show a second person. Its key was revoked on 2026-09-27.

One real finding surfaced during this pass: the original 2026-08-19 proposals for all 10 policies predated this codebase's `unboundSignalReasons` documentation field (harmless, non-functional) and, for `connector-capability` and `customer-refund` specifically, predated `boundSignals` being added to those two files entirely (functional — without it, `SignalIntentBinder` cannot derive `paymentAmount`/`refundAmount` from the request's own parameters). Approving the stale 2026-08-19 content as-is would have persisted that gap. Instead, all 14 were re-proposed with their current, correct file content and re-approved, so the live `policies` table and each policy's `PolicyChangeApprovalRecord` agree exactly — confirmed via `scripts/verify-policy-changes-approved.ts --full-scan`: "All 14 checked policy file(s) have a matching approval record."

**Why this was missed for a month, and why nothing caught it automatically.** `pending_policy_changes.proposed_content_json` is a one-time snapshot, written once at `POST /:name/:version/pending-changes` and never touched again while the change sits `PENDING_APPROVAL` — there is no code path anywhere in this system that re-reads a policy's live file while its proposal is still open and flags drift between the two. That is by design for the normal case (the whole point of a proposal is a frozen, reviewable snapshot), but it has a blind spot for a proposal left open for an unusually long time: between 2026-08-19 and 2026-09-16, `unboundSignalReasons` documentation was added to all ten files and `boundSignals` was added to two of them, as ordinary, unrelated documentation and correctness work, with nobody thinking to check whether any `PENDING_APPROVAL` proposal might now be stale relative to the file it referenced. `scripts/verify-policy-changes-approved.ts` is the tool that would have caught this, but it only runs (a) in CI against files that changed in a given push/PR, and (b) manually via `--full-scan` — and a full scan was never run during the month the proposals sat open, since nothing prompted one. It surfaced here only because approving these ten for the first time gave the verify script something to compare against; before that, "no approval record at all" was the only signal available (gap 39), and that signal cannot distinguish "never reviewed" from "reviewed against stale content." There is no code fix proposed for this here — the fix applied was procedural, catching it at review time and re-proposing with current content — but a genuine follow-up worth considering is a check at approve-time that refuses (or at least warns) if a proposal's `proposedContent` no longer matches the live file's current content, closing the gap between "this proposal exists" and "this proposal is still current."

Final `policyChangeApprovalRecordId` per policy (all `approvedBy: policy-reviewer-1`, all 2026-09-16):

| Policy                  | Version | `policyChangeApprovalRecordId`         | `approvedAt` (UTC) |
| ----------------------- | ------- | -------------------------------------- | ------------------ |
| `access-control`        | 1.0.0   | `47fe54ce-4d8b-4ffd-9a63-03398c5d426d` | 08:44:32.385       |
| `agent-vendor-payment`  | 1.0.0   | `0b3716b4-b17f-4732-aa0e-0bc2fc5ef1cb` | 08:48:08.863       |
| `api-key-issuance`      | 1.0.0   | `663f00ab-7b24-4459-94b2-4cf53105cbee` | 08:48:15.748       |
| `connector-capability`  | 1.0.0   | `71344a09-6e98-4845-a8f3-bd2514f91e6a` | 08:44:38.428       |
| `customer-refund`       | 1.0.0   | `aed307f1-7a3d-44cc-8d30-8f2e4aba17ef` | 08:44:43.180       |
| `database-change`       | 3.0.0   | `3747440d-c1fb-4e6a-9a6e-02a141898a9b` | 08:44:47.918       |
| `expense-reimbursement` | 1.0.0   | `4b67272c-e3f0-4583-825c-ca2f5de5d25e` | 08:48:22.588       |
| `github-pr-approval`    | 1.0.0   | `8c71ec42-30c8-40f9-b5cd-0a34cbebafbd` | 08:44:52.688       |
| `hubspot-deal-update`   | 1.0.0   | `e0c080b1-fb9a-42d1-84f8-941d7524d11a` | 08:44:57.186       |
| `llm-tool-call`         | 1.0.0   | `941ba97e-2c96-415b-a367-02fdc7046811` | 08:45:01.672       |
| `production-deployment` | 1.0.0   | `6db6498e-0cd0-4625-8384-8b5a1bfa5888` | 08:45:06.204       |
| `rag-document-access`   | 1.0.0   | `baf4962e-d7a0-43ec-9c04-acd30435a600` | 08:45:10.673       |
| `slack-post-message`    | 1.0.0   | `3b3dccd7-4cbc-483b-81f9-97290addd5c7` | 08:48:29.623       |
| `vendor-payment`        | 2.0.0   | `5261f5eb-fe55-4fa8-b870-8e197b66cdf7` | 08:45:15.183       |

Separately: this pass also fixed a real production incident that surfaced along the way, unrelated to the approval content itself. `PolicyChangeApprovalService.approve()`'s live-policy write used `FilePolicyRepository`, which writes to the local filesystem — Vercel's serverless Functions run on a read-only filesystem, so the very first live approve attempt failed with `EROFS`. Fixed by adding `SupabasePolicyRepository` (`packages/policy/src/SupabasePolicyRepository.ts`, migration `20260916060000_add_policies_table.sql`) and switching `application.ts` to use it whenever a real database is configured (`config.storage.provider !== "memory"`), keeping `FilePolicyRepository` for local dev/tests. All 14 policies' file content was backfilled into the new `policies` table before the switch went live, so no policy regressed to "not found" for real traffic. `POLICY_EXECUTION_VERIFICATION_ENFORCED` remains `false` — enabling it is still a separate, deliberate step (see §2.35), not something this pass did.

**Why this was missed until now.** `FilePolicyRepository` has real, passing tests (`packages/policy/tests/unit/file-policy-repository.test.ts`, `packages/api/tests/unit/PolicyChangeApprovalService.test.ts`) and the whole approve flow is covered end to end by `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` — all of it runs against a local scratch directory, which is always writable, so the tests never exercise the one property that actually breaks on Vercel: a read-only filesystem. The gap was invisible from inside the test suite by construction, not from a missing test case for existing code paths — it needed a genuinely different filesystem, not a different input. And per this section's own "Deployment status" note above, `PolicyChangeApprovalService.approve()` had never actually been called against a live, deployed instance before tonight: all ten real production policies sat `PENDING_APPROVAL` from 2026-08-19 until this session, so the very first real invocation of the write path in production was also the first time this could have failed, and it did, immediately. Nothing about this was a regression or a missed test; it was untested-in-the-sense-of-never-yet-exercised code, caught the first time it actually ran for real.

**Original pause point, for the record:** confirmed by direct query against the live `pending_policy_changes` and `policy_change_approval_records` tables (2026-08-19): all 10 pre-existing policies — `access-control`, `connector-capability`, `customer-refund`, `database-change`, `github-pr-approval`, `hubspot-deal-update`, `llm-tool-call`, `production-deployment`, `rag-document-access`, `vendor-payment` — were proposed through the real `POST /:name/:version/pending-changes` endpoint on 2026-08-19 between 01:47:43 and 01:47:47 UTC, each proposed by the same caller (`charak1987`). Zero rows existed in `policy_change_approval_records` at that time — no policy, legacy or otherwise, had completed the approval flow. This was exactly the state maker≠checker is designed to produce and enforce: `SameActorCannotApproveOwnChangeError` (above) means the proposer cannot approve their own ten proposals, and per the operating rule above, whoever does approve them must generate and use their step-up signing key on a separate device with no AI agent access — the same discipline that governs every other checker action under this feature, applied without exception to the backfill. All ten pending changes remained safely `PENDING_APPROVAL` while paused: `pending_policy_changes` has no expiry mechanism (`packages/shared/src/domain/pending-policy-change.ts`), the database-level partial unique index (`ux_pending_policy_changes_open`, `supabase/migrations/20260818120000_add_policy_governance_tables.sql`) prevents a second, conflicting proposal for the same `(policy_name, policy_version)` while one is open, and none of the ten live policy files were touched during the pause, so it created no window of unenforced or inconsistent policy content.

Evidence

- `packages/shared/src/domain/pending-policy-change.ts`, `policy-change-approval-record.ts`, `policy-change-step-up-authorization.ts`

- `packages/api/src/routes/pending-policy-changes.ts`, `auth/isHumanCaller.ts`, `auth/PolicyChangeStepUpVerifier.ts`, `governance/PolicyChangeApprovalService.ts`, `governance/verifyPolicyGovernanceIntegrityAtStartup.ts`, `bootstrap/runPolicyGovernanceIntegrityCheckAtStartup.ts`, `server.ts`

- `packages/runtime/src/RuntimeEngine.ts` (content-hash-at-decision-time wiring)

- `packages/crypto/src/PolicyChangeCrypto.ts`, `PolicyChangeStepUpAuthorizationCrypto.ts`

- `packages/policy/src/FilePolicyRepository.ts` (`save()`, the write-side path-traversal guard added alongside this milestone)

- `scripts/verify-policy-changes-approved.ts` (preventive CI/deploy-time gate, fail-closed, Supabase-backed content-hash verification), `.github/workflows/ci.yml`'s `verify-policy-approvals` job (runs it on every push/PR), `supabase/migrations/20260818150000_add_ci_read_only_policy_for_approval_records.sql` (scoped read-only RLS credential)

- `packages/api/tests/unit/isHumanCaller.test.ts`, `PolicyChangeStepUpVerifier.test.ts`, `PolicyChangeApprovalService.test.ts`, `verifyPolicyGovernanceIntegrityAtStartup.test.ts`

- `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` (23 cases: human-only enforcement on all four endpoints, maker≠checker on approve/reject, step-up missing/expired/replayed/wrong-id/wrong-action/wrong-key, file write + signed record content, path-traversal rejection on `proposedContent.policyVersion`)

- `packages/runtime/tests/e2e/runtime.e2e.test.ts` (content-hash-at-decision-time, real on-disk policy content)

- `packages/governance-ui/src/app.ts`, `routes/login.ts`, `routes/pendingChanges.ts`, `views/diff.ts`

- `packages/governance-ui/tests/unit/apiClient.test.ts`, `tests/integration/app.integration.test.ts` (17 cases: unauthenticated redirect, login/logout, list/diff rendering, no approve/reject controls, XSS-escaping, session invalidation on a revoked key)

- `examples/tutorials/103-policy-governance-maker-checker/run.ts` (runnable narrative, real HTTP server: human-only enforcement, maker ≠ checker, missing-step-up denial, and a distinct checker's valid step-up envelope resulting in both a written `policy.json` and a signed, persisted approval record)

---

**Update (2026-10-03, follow up):** two approvals of the same pending change at the same moment could both pass the `PENDING_APPROVAL` check and both apply the change. `policy_change_approval_records` now has a unique index on `pending_policy_change_id` (`20261003120000_unique_policy_change_approval_per_pending_change.sql`). The approval record is written before the live policy file, so the second approval's insert fails, the repository answers `409 CONFLICT`, and that approval stops before it touches the policy. The in-memory repository enforces the same rule. Evidence: `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` (two concurrent approvals: one `200`, one `409`, one record), `packages/storage/tests/unit/policy-change-approval-record-one-per-change.test.ts` (3). The index has not been run against a real Postgres in this change.

**Update (2026-10-03, second follow up):** the index above would have trapped a legitimate retry. If an approval wrote its record and then failed (the file write, or marking the change approved), the change stayed `PENDING_APPROVAL` and a retry got `409` forever. Production has one such pair from before this change: pending change `662c9ade…` (`access-control` 1.0.0, 2026-09-16), two records by the same approver with the same content hash, the second chained to the first. `PolicyChangeApprovalService` now reuses the existing record when the same approver retries with the same content, finishes the file write, and returns it; another approver gets `409`. The unique index covers records approved from 2026-10-03 18:18:37 UTC, so the 2026-09-16 pair is kept as signed evidence and the migration applies. Evidence: `packages/api/tests/unit/PolicyChangeApprovalService.test.ts` (2 new: the same approver completes a retry with one record; another approver is refused and nothing is written), `packages/storage/tests/unit/policy-change-approval-record-one-per-change.test.ts` (2 new).

**Update (2026-10-16, proof audit, G-106):** a published policy version is immutable. `FilePolicyRepository.save`
refuses different content for an existing `(name, version)` with `PolicyVersionImmutableError`, and the approval
service refuses it before writing an approval record, so the API returns `409`. Re-saving identical content (an
approved rollback) is allowed. Before this, governance could replace the rules a proof already cited in place.

## 2.27 Policy-Freshness Enforcement at Execution Time

A signed Execution Authorization is bound to the exact policy content it was decided under, not merely the policy's `(name, version)` identifier: `RuntimeEngine.execute()` computes `policyContentHash` — a hash of the policy document actually loaded for that decision, via the same `TrustRecordHasher` other artifact hashes in this codebase use — and includes it inside the signed `ExecutionAuthorizationPayload` (`packages/runtime/src/RuntimeEngine.ts`). This is distinct from 2.26's "Content hash at decision time (G-24)", which stamps a content hash onto the persisted `ExecutionTrustRecord` for audit purposes; this hash is signed into the authorization itself and independently re-checked before execution is allowed to proceed.

`ExecutionGateway` optionally accepts a `PolicyRepository` (`ExecutionGatewayOptions.policyRepository`). When supplied, and when the authorization being verified carries a `policyContentHash` (older authorizations signed before this check existed do not), the gateway reloads the policy at the authorization's own `(policyName, policyVersion)` and recomputes its current content hash, comparing it against the signed value. A mismatch — whether from the policy's content changing in place or the policy no longer existing at that name/version at all — sets `policyStillCurrent: false`, is reported in `GatewayVerificationResult.policyContentMismatch`, and fails `verify()` before the connector is ever invoked, exactly like the existing `businessTransactionHash` check it sits alongside in the same ordered check sequence (`packages/execution-gateway/src/ExecutionGateway.ts`).

**Update (2026-09-20): this check is no longer opt in.** It fails closed by default (see 2.36). `ExecutionGateway` now requires a `PolicyRepository` and a policy approval verifier at construction, and an authorization that carries no `policyContentHash` is rejected with `policyStillCurrent: false` instead of being skipped. The only way to get the earlier "absent means skipped" behavior is the explicit, loudly named `allowUnverifiedPolicy: true` option, which production bootstrap does not set. The replay detection logic (`isSoleFailureNonceReplay`) still treats an undefined check as passing, which is safe because in the default mode every policy check is present and must be true for `valid` to be true.

Evidence

- `packages/runtime/src/RuntimeEngine.ts` (`policyContentHash` computed and signed into the authorization payload)

- `packages/execution-gateway/src/ExecutionGateway.ts` (`policyRepository` option, `policyStillCurrent` check, `policyContentMismatch` reporting)

- `packages/execution-gateway/src/GatewayVerificationResult.ts` (`policyStillCurrent`, `policyContentMismatch` fields)

- `packages/execution-gateway/tests/unit/policy-freshness.test.ts` (7 cases: unchanged-policy pass, changed-content-since-signing failure with named mismatch, `execute()` throwing with the mismatch named, policy no longer existing at that name/version, check skipped — not failed — when no `policyRepository` is wired, check skipped — not failed — when the authorization carries no `policyContentHash`, a nonce-replay-only failure still correctly classified when the policy check was skipped)

---

## 2.28 KeyId-Aware Key Resolution with Expiry/Revocation Checking

Signature verification can resolve the verifying key per-authorization by `keyId` instead of always using one static configured public key, enabling more than one key to be valid at once (for example, during a rotation window) without a restart. `EnvelopeVerifier` accepts optional `keyProvider` and `keyExpiryStore` options (`packages/envelope-verifier/src/EnvelopeVerifier.ts`); `ExecutionGateway` forwards its own same-named optional options straight through to the `EnvelopeVerifier` it composes (`packages/execution-gateway/src/ExecutionGateway.ts`).

When `keyProvider` is supplied, each authorization's own `authorization.keyId` is resolved through it (`FileKeyProvider.getPublicKey(keyId)`) instead of the single static `publicKey`; when `keyExpiryStore` is also supplied, the resolved keyId is first checked against it, and a `revoked: true` entry, or an `expiresAt` at or before the verification instant, causes resolution to fail before any key material is even read. Failure at either step — key not found, key unreadable, expired, or revoked — fails closed: `resolveKey()` returns `undefined` rather than throwing or silently falling back to the static `publicKey`, which surfaces as `checks.keyValid: false` and an overall failed verification. A `keyId` with no entry in `keyExpiryStore` at all is treated as always valid (the same "absent means not opted in" convention as 2.27's `policyStillCurrent`). Omitting `keyProvider` entirely preserves the exact prior static-`publicKey` behavior, with `keyValid` staying absent (not `false`) from the result, since key resolution then isn't part of verification's checks at all.

`FileKeyExpiryStore` (`packages/crypto/src/KeyExpiry.ts`) is the reference `KeyExpiryStore` implementation: it reads one small sidecar JSON file beside the PEM key files `FileKeyProvider` already reads from the same configured key directory (`<keyDirectory>/key-expiry.json`), keyed by `keyId`, with `expiresAt`/`revoked` both optional per entry. A `keyId` absent from the file, or the file itself being absent, means "no expiry, always valid" — the safe default that keeps every deployment that doesn't opt into key expiry behaving exactly as it does today. Malformed JSON, or a value of the wrong shape, throws rather than silently treating the key as unexpiring.

Evidence

- `packages/envelope-verifier/src/EnvelopeVerifier.ts` (`keyProvider`, `keyExpiryStore` options; `resolveKey()`; `checks.keyValid`)

- `packages/execution-gateway/src/ExecutionGateway.ts` (forwards `keyProvider`/`keyExpiryStore` to its composed `EnvelopeVerifier`)

- `packages/crypto/src/KeyExpiry.ts` (`KeyExpiryStore` interface, `FileKeyExpiryStore`)

- `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts`: "resolves the public key via keyProvider using the authorization's own keyId", "fails closed when keyProvider has no key for the authorization's keyId", "fails closed when the resolved key is expired per keyExpiryStore", "fails closed when the resolved key is revoked per keyExpiryStore", "a keyId with no keyExpiryStore entry is treated as always valid", "omitting keyProvider preserves today's exact static-publicKey behavior, with keyValid absent"

**Scope, precisely — this claim covers the ExecutionAuthorization/Gateway envelope only.** `docs/VERIFICATION-GAPS.md` gap 53 (2026-09-11 PQC audit) found the durable evidence artifacts this system actually keeps long-term — Trust Records, Refusal Records, Audit Events — had none of this: all three signers hardcoded the literal keyId `"default"` for new signatures, with no way to rotate without overwriting that key in place and breaking every prior signature. Closed the same day with `PARMANA_VERIFICATION_KEY_ID`/`PARMANA_VERIFICATION_SECONDARY_KEY_ID`, mirroring this section's own `PARMANA_GATEWAY_KEY_ID` precedent — see that gap entry for full detail.

- `packages/crypto/tests/unit/key-expiry.test.ts` (6 cases: missing file, keyId absent from an existing file, parsed `expiresAt` as a real `Date`, `revoked: true`, malformed JSON throws, non-object JSON throws)

**Update (2026-09-09):** the verification-side machinery above (`keyProvider`, resolved by `authorization.keyId`) had, until this date, never been exercised by anything but the single shared `"default"` keyId — nothing on the signing side ever produced an authorization carrying a different one. `docs/VERIFICATION-GAPS.md` G-32 found and same-day-closed that gap: `RuntimeAuthorizationSigner` (`packages/runtime/src/RuntimeAuthorizationSigner.ts`) now resolves the signing keyId per-transaction via a new `TenantKeyResolver` (`packages/runtime/src/TenantKeyResolver.ts`), signing under a dedicated `tenant.<tenantId>` key when `transaction.metadata.tenantId` is set and that key has been provisioned (same `FileKeyProvider` layout, `scripts/generate-keypair.ts --key-id tenant.<tenantId>`), and falling back to the shared `"default"` key otherwise. This is opt-in per tenant, not a change to the default (single-key) path: a deployment with no tenant-specific keys provisioned behaves exactly as before. See G-32 for the full fix and its own explicitly-stated residual gaps (manual provisioning only, no KMS/HSM/rotation automation, silent fallback on an unprovisioned tenantId).

**Update (2026-10-03, audit):** the tenant id came from the request body (`metadata.tenantId`) with nothing tying it to the caller, so any authenticated caller could have its authorization signed with another tenant's `tenant.<id>` key. `POST /execute` now refuses a `tenantId` that is not in the API key's new `allowedTenantIds` list (`403 TENANT_NOT_ALLOWED`; unset means none). A request with no tenant id is unaffected. Separately, per tenant keys cannot work under `KEY_PROVIDER=aws-kms`: KMS alias names cannot contain the dot in `alias/tenant.<id>`, so the resolver falls back to `default`. Evidence: `packages/api/tests/integration/caller-capability-scoping.integration.test.ts` (3 new), `packages/shared/tests/unit/config-validation.test.ts` (2 new).

**Update (2026-10-03, follow up):** per tenant keys now resolve to a valid KMS alias. `resolveKmsKeyId` replaces each `.` in a logical key id with `/`, so `tenant.acme` is `alias/tenant/acme`; a logical key id never contains `/`, so two ids cannot map to the same alias. An id that would land under AWS's reserved `alias/aws/` prefix is refused. Not verified against real AWS: the evidence is unit tests and tutorial 113. Evidence: `packages/crypto/tests/unit/kms-signer.test.ts` (2 new), `examples/tutorials/113-kms-key-id-resolution`.

- `packages/runtime/src/TenantKeyResolver.ts`, `packages/runtime/src/RuntimeAuthorizationSigner.ts`, `packages/runtime/src/RuntimeEngine.ts`

- `packages/runtime/tests/unit/tenant-key-resolver.test.ts` (5 cases), `packages/runtime/tests/unit/execution-authorization-wiring.test.ts` (2 new cases: tenant-keyed authorization verifies under its own tenant's public key and fails under the shared default public key; no-tenantId transaction still signs under `"default"`)

---

## 2.29 Signal-Freshness Enforcement at Execution Time (G-31)

A signed Execution Authorization is also bound to the exact runtime signals its decision rested on, not merely the policy and content it approved: `RuntimeEngine.execute()` computes `signalsHash` — a canonical hash of the `PolicySignals` object evaluated for that decision, via the same `TrustRecordHasher` idiom 2.27's `policyContentHash` uses — and includes it inside the signed `ExecutionAuthorizationPayload` (`packages/runtime/src/RuntimeEngine.ts`). This closes the one gap 2.27 left open: policy content was already re-checked at the execution boundary, but the vendor status, risk exposure, market conditions, or other real-world facts a policy's `boundSignals`/`SignalStateVerifier` cares about were verified once, pre-authorization, and never again.

`ExecutionRequest` carries the same `signals` the authorization was signed under (`packages/execution-system/src/ExecutionRequest.ts`, populated by `ExecutionRequestBuilder` from the persisted `BusinessTransaction.signals`), and `ExecutionGateway` optionally accepts a `SignalStateVerifier` (`ExecutionGatewayOptions.signalStateVerifier` — the same port `@parmana/policy` already defines and `RuntimeEngine` already uses pre-authorization, reused here rather than reimplemented). When supplied, and when the authorization carries a `signalsHash` and the request carries `signals` (older authorizations signed before this check existed carry neither), the gateway recomputes the signals hash and compares it to the signed value — a mismatch sets `signalsStillCurrent: false` and is reported in `GatewayVerificationResult.signalsHashMismatch`. When the hash matches, the gateway independently re-verifies those signals against real-world state via `SignalStateVerifier.findViolations` — any divergence also sets `signalsStillCurrent: false`, reported in `GatewayVerificationResult.signalDivergence`, and fails `verify()` before the connector is ever invoked, in the same ordered check sequence `policyStillCurrent` sits in (`packages/execution-gateway/src/ExecutionGateway.ts`).

This check is opt-in and additive, not a behavior change for existing deployments: omitting `signalStateVerifier`, or verifying an authorization signed before `signalsHash` existed, leaves `signalsStillCurrent` absent (not failed) — the same "absent means skipped" convention `policyStillCurrent` already uses — and `isSoleFailureNonceReplay` treats an absent/undefined check as passing, so it does not spuriously reclassify a stale-signals rejection as a nonce replay. In production, only capabilities with a configured `SignalStateVerifier` (today, `hubspot-deal-update` via `createHubSpotSignalStateVerifier`) get a real re-verification; every other action's `findViolations` call returns an empty array (nothing to check), the same discipline every capability-scoped `SignalStateVerifier` implementation already follows. The check also only has effect when decision and execution are actually separated in time; this codebase's own `RuntimeEngine`/`ExecutionGateway` wiring runs both synchronously in one call today, so its practical value is for a `SignedExecutionAuthorization` handed to a decoupled downstream receiver (e.g. an `HttpExecutionSystem`-based deployment) that verifies and executes independently, potentially much later, up to `maxTtlSeconds` — exactly the use this authorization type's own "receiving systems" doc comment describes as supported.

Evidence

- `packages/shared/src/domain/execution-authorization.ts` (`signalsHash` on `ExecutionAuthorizationPayload`)

- `packages/runtime/src/RuntimeEngine.ts` (`signalsHash` computed and signed into the authorization payload)

- `packages/runtime/src/ExecutionRequestBuilder.ts`, `packages/execution-system/src/ExecutionRequest.ts` (`signals` carried through to the execution boundary)

- `packages/execution-gateway/src/ExecutionGateway.ts` (`signalStateVerifier` option, `signalsStillCurrent` check, `signalsHashMismatch`/`signalDivergence` reporting)

- `packages/execution-gateway/src/GatewayVerificationResult.ts` (`signalsStillCurrent`, `signalsHashMismatch`, `signalDivergence` fields)

- `packages/api/src/bootstrap/executionGatewaySignalStateVerifier.ts` (late-binding singleton resolving the Gateway↔verifier circular construction dependency in production wiring), `packages/api/src/bootstrap/createExecutionGateway.ts`, `packages/api/src/application.ts`

- `packages/execution-gateway/tests/unit/signal-freshness.test.ts` (9 cases: unchanged-signals pass, verifier-reported drift failure with named divergence, `execute()` throwing with the divergence named, request signals no longer hash-matching the authorization, check skipped — not failed — when no `signalStateVerifier` is wired and when the authorization carries no `signalsHash`, a request without `signals` failing against an authorization signed over signals, a request without `signals` checked as `{}` against one signed over no signals, a nonce-replay-only failure still correctly classified when the signals check was skipped)

- `packages/crypto/tests/unit/authorization-envelope.test.ts` (3 cases: `signalsHash` included and verifies unchanged, omitted when not supplied, a tampered `signalsHash` fails signature verification)

- `packages/runtime/tests/unit/execution-authorization-wiring.test.ts` (1 case, through the real `RuntimeBuilder`/`RuntimeEngine`/`ExecutionComponent` wiring: the produced authorization's `signalsHash` matches an independently recomputed hash of the transaction's signals, and the `ExecutionRequest` reaching the execution system carries those same signals)

- `docs/VERIFICATION-GAPS.md` G-31 (full narrative, including what this does and does not close)

- `examples/tutorials/98-signal-freshness-enforcement/run.ts` (runnable narrative: one authorization, two independent receiving systems — one whose live re-check finds nothing changed and executes, one that finds the vendor blocked since authorization and is rejected with the divergence named, before its connector is ever invoked)

---

**Update (2026-10-03, follow up):** a request with no `signals` used to skip this check even when the authorization carried a `signalsHash`. It is now checked as `{}`, the value `RuntimeEngine` hashes for a transaction with no signals, so omitting signals passes only against an authorization signed over no signals, and is then still re-verified by the `SignalStateVerifier`. Evidence: `signal-freshness.test.ts` (the two new cases above).

## 2.30 Policy-Authoring and Deployment Observability Warnings

Two additive, non-blocking observability checks close gaps found by an internal audit (`REAL-GAPS-FOUND.md`) where a real protection existed but its absence for a given policy or deployment was silent — no error, no log line, nothing for a policy author or operator to notice.

**boundSignals rule-coverage warning.** `boundSignals` (2.11's `SignalIntentBinder`) only verifies the specific signals a policy author lists — nothing previously checked that every fact a rule actually decides on (e.g. `amount` in `{ fact: "amount", operator: "gt", value: 500 }`) has a corresponding `boundSignals` entry. A policy author could write a rule that approves or rejects on a caller-declared fact while never binding it, silently forfeiting `SignalIntentBinder`'s protection for that fact, with nothing surfacing the omission. `PolicyValidator.findUncoveredFacts(policy)` walks every rule condition (including nested `all`/`any`), collects referenced facts, and returns those absent from `boundSignals`; `PolicyRouter.load()` logs a `policy_boundSignals_coverage_incomplete` warning (never throws) listing the policy id/version and the uncovered facts. Deliberately warn-only: per `boundSignals`' own doc comment, a fact with no genuine Intent-side equivalent (e.g. `vendorVerified`, `riskScore`) is legitimately excluded from `boundSignals` and would otherwise generate constant false-positive noise if this were an error.

**RuntimeEngine optional-protection logging.** `signalStateVerifier` and `capabilityPolicyBinder` (2.22, 2.29) are optional, capability-scoped `RuntimeEngine` dependencies — intentionally omittable, per RFC-0022/TD-22's own design. But omitting either was previously silent at construction time: an operator reading logs had no way to tell which protections a given deployment was actually running with. `RuntimeEngine`'s constructor now logs a single `runtime_engine_constructed` event noting whether `signalStateVerifier`, `capabilityPolicyBinder`, and refusal recording are configured. Construction-time only, not per-request — the configuration doesn't change per transaction, and logging it on every request would be redundant once construction-time visibility exists.

Both checks are purely additive: no existing behavior changes, no policy that previously loaded successfully now fails to load, and no transaction that previously executed now fails to execute.

Evidence

- `packages/policy/src/PolicyValidator.ts` (`findUncoveredFacts`)
- `packages/policy/src/PolicyRouter.ts` (`policy_boundSignals_coverage_incomplete` warning)
- `packages/policy/tests/unit/PolicyValidator.test.ts` (4 cases: fully covered, no rule facts, one uncovered fact, uncovered facts nested inside `all`/`any` while a bound fact is correctly excluded)
- `packages/policy/tests/unit/PolicyRouter-boundSignals-coverage.test.ts` (2 cases: no warning when coverage is complete, warning fired with the exact policy id/version/uncovered-facts payload when it is not)
- `packages/runtime/src/RuntimeEngine.ts` (`runtime_engine_constructed` log line)
- `packages/runtime/tests/unit/optional-protections-logging.test.ts` (3 cases: both protections absent, only `signalStateVerifier` configured, only `capabilityPolicyBinder` configured)
- Full repo `npx tsc -b`, `npx eslint . --ext .ts`, and `npm test` (`vitest run`) all clean: 1451 passed, 37 pre-existing skips, 0 failed — no regressions

**Update (2026-09-09):** the "deliberately warn-only" design above traded false-positive noise for a real cost: running the real `vendor-payment` policy live (Tutorial 105) surfaced the warning, and checking all 10 real policies in `policies/` found every single one had uncovered facts, none reviewed or documented — a warning nobody reviewing a running system would see, indistinguishable from a genuinely forgotten binding. `docs/VERIFICATION-GAPS.md` G-33 found and same-day-closed this: a new `Policy.unboundSignalReasons` field lets a policy author acknowledge, with a specific reason, exactly which facts have no genuine Intent-side equivalent (mirroring `INTENTIONALLY_UNBOUND_CAPABILITIES`'s "reviewed exemption, not silence" pattern, scoped per-policy instead of centralized). `PolicyValidator.validate()` now fails closed — throws for any rule-referenced fact neither bound nor acknowledged — and `PolicyRouter.load()`'s warning is gone, replaced by that throw. All 10 real policies were updated: 8 got per-fact `unboundSignalReasons`, and 2 (`connector-capability`, `customer-refund`) turned out to have a genuinely bindable amount fact that had simply never been bound (`parameters.amount`, the same pattern `vendor-payment` already used) — a real scope-drift gap fixed, not merely documented around. See G-33 for full evidence and the residual (a reason is a documented claim, not a proof that the fact is truly unbindable).

**Second update (2026-09-09), a new sibling observability warning:** a policy approval/rejection audit found no detection existed for two rules whose conditions could both be true for the same input — first-match-wins means the earlier one silently decides, with nothing surfacing that the later rule is partly or wholly unreachable. `docs/VERIFICATION-GAPS.md` G-39 closed this the same day with `PolicyValidator.findRuleConflicts(policy)`, wired as an advisory `console.warn` from `PolicyRouter.load()` and surfaced in `pending-policy-changes.ts` alongside the existing `coverageWarnings`. Unlike `boundSignals` coverage, this is deliberately **not** fail-closed — a flagged overlap is a heuristic judgment, not a structural fact with one correct fix, and the checker doesn't claim to be bug-free for every condition shape. Verified against every real policy in `policies/`: zero `WARNING`-level results; one honest `INFO`-level "needs review" case (`hubspot-deal-update`) that is a genuine, deliberate priority ordering, not a bug. The same session also found and removed `PolicyOutcome`/`PolicyAction`'s unused third value, `REQUIRE_OVERRIDE` (G-38) — see that entry for a real design tension surfaced during removal: two tests and several docs had treated it as a deliberately reserved future extension point, not dead code, and it was removed anyway as an explicit, disclosed trade-off, not an oversight.

---

## 2.31 Signed Caller-Capability Claim, Checked at the Connector Layer

**What this closes, precisely.** A prior internal audit found that `DefaultConnectorPolicy.assertAllowed()` (`packages/execution-control/src/ConnectorPolicy.ts`) only checked the _connector's_ declared capabilities (`connector.capabilities.includes(action)`) and three pre-computed `verifiedTransaction` booleans — it had no way to independently confirm that the _caller_ who submitted the request was ever cleared for the specific capability now being executed. That confirmation happened exactly once, at the API edge (`isCapabilityAllowed()` in `packages/api/src/routes/execute.ts`), and its result was then discarded — nothing carried it forward into the signed authorization or to the connector layer.

**What was added.** `ExecutionAuthorizationPayload` (`packages/shared/src/domain/execution-authorization.ts`) gained two optional signed fields, following the exact precedent `policyContentHash`/`signalsHash` set (optional so every pre-existing authorization keeps verifying unchanged): `submittedBy` (the caller id, already threaded into `BusinessTransaction.metadata.submittedBy` but never previously reaching the signed payload) and `grantedCapability` (the capability `isCapabilityAllowed()` confirmed for that caller, at the moment it confirmed it). `execute.ts` now carries `grantedCapability` forward onto `transaction.metadata` alongside the existing `submittedBy` write, server-set and never trusted from the client. `RuntimeEngine.execute()` reads both from `transaction.metadata` and passes them to `RuntimeAuthorizationSigner`/`AuthorizationSigner`, which sign them into the payload exactly like every other field there (`ArtifactSigner` signs the complete canonical payload, not an enumerated subset). `DefaultConnectorPolicy.assertAllowed()` now additionally checks: when the authorization's `grantedCapability` is present, it must equal the action actually being executed (`request.executableContent.action`) — a mismatch is rejected before the connector's own credential is ever resolved.

**What this is, honestly.** This is defense-in-depth, not a fix for a live exploit. `ExecutionGateway.verify()` already independently re-verifies the authorization's cryptographic signature before `ExecutionGateway.execute()` is ever called, and `ExecutionControlService.execute()` (the only production call site reaching `ConnectorPolicy.assertAllowed()`) is only reachable through that path today — a repo-wide search confirms no other code constructs a `GatewayExecutionRequest` and calls it directly. The new check does not re-verify the signature a second time at the connector layer; it checks _internal consistency_ of a value that is already inside the same signed payload `verifiedTransaction.authorizationVerified` already vouches for. Its value is specifically against a _future_ code path that might reach `ConnectorPolicy.assertAllowed()` without going through today's single, already-verified route (a plugin system, an admin override endpoint, a differently-wired deployment) — in that scenario, the caller-capability claim travels with the authorization itself rather than depending on whatever new code path remembers to set `verifiedTransaction` correctly. It does not, and cannot, defend against an attacker who already has in-process code execution and a reference to internal wiring — that attacker can fabricate `grantedCapability` exactly as easily as they could already fabricate the `verifiedTransaction` booleans, since both arrive over the same trust boundary.

**Update (Sep 7, 2026, NF-004):** the guarantee this claim describes previously held only for `POST /execute`. `POST /transactions` — a second, independent entry point into the identical `application.execute()` pipeline — performed the same caller-capability admission check (`isCapabilityAllowed()`) but never carried the confirmed capability into `transaction.metadata.grantedCapability`, and only audited denials, never grants. A transaction submitted via `/transactions` therefore signed an authorization missing `grantedCapability` that the equivalent `/execute` submission would have carried. `packages/api/src/routes/transactions.ts` now performs the identical `caller.capability_granted` audit write and `metadata.grantedCapability` assignment `execute.ts` already did, by direct duplication of the existing logic (the surrounding capability-check/audit block was already duplicated between the two routes before this change; a new shared abstraction was deliberately not introduced for a fix this small). New test: `packages/api/tests/integration/caller-auth.integration.test.ts`, `"POST /transactions parity with POST /execute (NF-004)"` — both routes, given the same caller, now produce a response whose `authorization.payload.grantedCapability` equals the executed action, and both emit exactly one `caller.capability_granted` event. Commit `7da8f0d`.

**Update (2026-09-11, docs/VERIFICATION-GAPS.md gap 50):** the `caller.capability_granted` write NF-004 above describes was, itself, silently impossible against a real Postgres-backed audit sink. `caller_audit_events`'s `type` CHECK constraint — last widened by `20260824090000_add_structural_rejected_to_caller_audit_events.sql` — was never widened again to include `'caller.capability_granted'`, even though both `execute.ts` and `transactions.ts` have written that exact event type unconditionally on every successful, authenticated capability check since before NF-004. Combined with 2.19's fail-closed guarantee (an audit write failure fails the request), this meant **every successful, authenticated `POST /execute` or `POST /transactions` call, in any real deployment with caller-auth enabled and a Postgres-backed `CallerAuditSink`, failed closed with `503 AUDIT_UNAVAILABLE` before Policy Engine evaluation ever ran** — the capability-granted path this section documents was, in that configuration, entirely unreachable. Invisible in the existing test suite because Supabase-backed integration tests are opt-in (`ALLOW_LIVE_SUPABASE=1`); `InMemoryCallerAuditSink` (2.16) has no such constraint to violate. Found and closed by deploying the real API to a real environment (Vercel, real `parmana-sandbox` Supabase project, `PARMANA_AUTH_DISABLED=false`) for the first time and observing the failure live, not by code review. Closed by a new migration, `supabase/migrations/20260911090000_add_capability_granted_to_caller_audit_events.sql`, widening the constraint the same way each of its four prior widenings did. Applied directly to `parmana-sandbox`. Commit `1eb8881` — see `docs/VERIFICATION-GAPS.md`'s new "Gaps closed in the 2026-09-11 real-deployment verification session" table for the full reproduction and fix detail.

Evidence

- `packages/shared/src/domain/execution-authorization.ts` (`submittedBy`, `grantedCapability` on `ExecutionAuthorizationPayload`)
- `packages/shared/src/domain/metadata.ts` (`grantedCapability` on `TransactionMetadata`)
- `packages/api/src/routes/execute.ts` and `packages/api/src/routes/transactions.ts` (both carry `grantedCapability` onto `transaction.metadata`, server-set, alongside the existing `submittedBy` write — see Update above)
- `packages/crypto/src/AuthorizationSigner.ts`, `packages/runtime/src/RuntimeAuthorizationSigner.ts`, `packages/runtime/src/RuntimeEngine.ts` (threading into the signed payload)
- `packages/execution-control/src/ConnectorPolicy.ts` (`DefaultConnectorPolicy.assertAllowed()`'s new consistency check)
- `packages/crypto/tests/unit/authorization-envelope.test.ts` (3 new cases: fields included and verify unchanged when supplied, omitted when not supplied, a tampered `grantedCapability` fails signature verification)
- `packages/runtime/tests/unit/execution-authorization-wiring.test.ts` (2 new cases: both fields threaded through from `transaction.metadata` end-to-end through the real `RuntimeBuilder`/`RuntimeEngine` wiring; both correctly absent when metadata carries neither)
- `packages/execution-control/tests/unit/connector-policy-granted-capability.test.ts` (3 cases: execution allowed when `grantedCapability` matches the executed action, execution allowed when `grantedCapability` is absent — caller-auth was disabled, execution rejected when `grantedCapability` names a different action than the one executed)
- Full repo `npx tsc -b`, `npx eslint . --ext .ts`, and `npm test` (`vitest run`) all clean: 1463 passed, 38 pre-existing skips, 0 failed — no regressions

---

## 2.32 Per-Caller Tamper-Evident Chaining on the Caller-Authentication Audit Trail

**What this closes.** `docs/site/trust-and-claims/objections-and-evidence.mdx` (Domain 3) found that `caller_audit_events` rows were signed (§2.19-adjacent signing milestone, `AuditEventCrypto`) but not chained: unlike `ExecutionTrustRecord`'s `previousChainHash`/`chainHash` (`ExecutionChainCrypto`), a deleted `caller_audit_events` row was undetectable by any mechanism this repo had — a signature proves a _surviving_ row wasn't edited, it says nothing about a row that's simply gone.

**Why not a single global chain.** `caller.authenticated` fires on every authenticated request to every route — `caller_audit_events` is the highest-write-volume table in this system. A global hash chain needs each new row to know its immediate predecessor's hash before writing, which ordinarily means a lock serializing every write through one predecessor lookup — putting that lock on the busiest table would risk a real production bottleneck.

**What was built instead: a chain per caller, not a chain per table.** `SupabaseCallerAuditSink.record()` (`packages/api/src/auth/SupabaseCallerAuditSink.ts`), when the event carries a `callerId`, opens a transaction and takes a Postgres advisory lock scoped to `hashtext(callerId)` — this serializes only that caller's own concurrent writes, never a different caller's. It then reads that caller's most recent `chain_hash`/`chain_position` (`ORDER BY id DESC LIMIT 1`), folds `previousChainHash`/`chainPosition` into the exact object `AuditEventCrypto.sign()` already signs (the existing `signature_json` column now covers the chain link too — no second signature column), computes `chainHash` via `TrustRecordHasher` (the same idiom `RuntimeEngine` already uses for `policyContentHash`/`signalsHash`), and commits. Events with no `callerId` (the earliest possible rejection — malformed JSON/oversized body, before caller-auth middleware or any route handler runs — and `caller.rejected`) get `NULL` chain fields: there is no per-caller chain to link them into, the same "absent means not covered" discipline every other optional column on this table already follows.

**What this catches, and what it doesn't.** Deleting any row for a caller who has other rows before or after it breaks the chain: the surviving next row's `previousChainHash` still points at the deleted row's `chainHash`, which no longer matches the row now immediately before it in that caller's sequence — `CallerAuditChainVerifier.verifyChain()` (`packages/crypto/src/CallerAuditChainVerifier.ts`) detects this with no network call, no database, and no running Parmana process — the same standalone discipline the "Verify a trust record independently" guide demonstrates for `ExecutionTrustRecord`. It does not catch deleting an entire caller's history at once (nothing remains to show a gap), and it does not detect reordering or deletion across different callers' independent chains — both are honest, stated limits, not oversights.

Evidence

- `supabase/migrations/20260906120000_add_per_caller_chain_to_caller_audit_events.sql` (`chain_hash`, `previous_chain_hash`, `chain_position` columns, nullable and additive; synced into `scripts/apply-all-migrations.sql`)
- `packages/api/src/auth/SupabaseCallerAuditSink.ts` (`record()`'s per-caller advisory-lock transaction, chain-link computation)
- `packages/crypto/src/CallerAuditChainVerifier.ts` (new, standalone chain verification)
- `packages/api/tests/unit/supabase-caller-audit-sink.test.ts` (13 cases, including: a new caller starts at `chain_position: 1` with `previous_chain_hash: null`; a second event from the same caller chains to the first with an incremented position; two different callers get independent chains, both starting at position 1; an insert failure mid-transaction rejects the promise with no row persisted; a chained event's signature covers the folded-in `previousChainHash`/`chainPosition`, and a tampered chained event fails verification)
- `packages/crypto/tests/unit/caller-audit-chain-verifier.test.ts` (5 cases: an unbroken three-event chain verifies; a deleted middle row is caught via the resulting `previousChainHash` mismatch; a modified event is caught via its own signature failing; unchained rows verify on signature alone with no linkage required; an empty chain is valid)
- `packages/api/tests/integration/supabase-caller-audit-sink.integration.test.ts` (extended: chain fields present and correctly linked against a real Postgres advisory lock, not just the unit-level fake pool)
- docs/site's "Caller Audit Trail" concept page, for the reader-facing writeup this evidence supports
- Full repo `npx tsc -b`, `npx eslint . --ext .ts`, and `npm test` (`vitest run`) all clean: 1493 passed, 38 pre-existing skips, 0 failed — no regressions

---

**Update (2026-10-16, proof audit, G-108):** the chain does not detect deleting the newest row for a caller, because
nothing remains after it to break. `CallerAuditChainVerifier.verifyChain(rows, anchor)` now accepts a chain head
recorded outside the database. With that anchor, a chain that no longer ends at the head fails verification. Without
an anchor the limit stands. Publishing the head to an external store is an operator step, not yet done.

## 2.33 Authorization Envelope Bound Into the Trust Record's Own Signature

**What this closes.** A full-codebase deep read (Sep 7, 2026) found that `ExecutionTrustRecord` carried no record of the `SignedExecutionAuthorization` the Execution Gateway actually accepted for that transaction. A loaded trust record could prove its own `transaction`/`overrides`/`executions` hadn't been tampered with, but could not independently prove which nonce was consumed, which expiry was checked, or which `businessTransactionHash`/`policyContentHash`/`signalsHash` the authorization itself was signed under — an auditor had to trust that a matching authorization existed somewhere else, not verify it from the trust record alone.

**What was added.** `ExecutionTrustRecord` (`packages/shared/src/domain/execution-trust-record.ts`) gained an optional `authorization?: SignedExecutionAuthorization` field, captured from `RuntimeContext.authorization` by `BusinessTrustRecordBuilder.build()` (`packages/runtime/src/BusinessTrustRecordBuilder.ts`) and included in `VerificationCrypto.canonicalRecord()` (`packages/crypto/src/VerificationCrypto.ts`) alongside `transaction`/`overrides`/`executions` — so it is covered by the same `trustRecordHash`/`signature` (and, under `CRYPTO_MODE=hybrid`, the same `signatures[]`) as everything else already hashed there, not a separate, independently-checked attachment.

**Backward compatibility, and why no special-case verification branch was needed.** `CanonicalSerializer` (`packages/crypto/src/CanonicalSerializer.ts`) normalizes to a plain object and serializes via `JSON.stringify`, which drops any key whose value is `undefined` regardless of whether that key was present during normalization. A trust record built before this field existed — or any record for a transaction that never reached execution, e.g. a policy rejection — has `authorization === undefined`, which therefore serializes byte-identically to a record built with no `authorization` key at all. `VerificationCrypto.hash()`/`.sign()`/`.verify()`/`.verifySignature()` needed no code change beyond `canonicalRecord()` itself: every existing trust record's stored `trustRecordHash`/`signature` verifies unchanged, and a new record with a real `authorization` gets it covered by the hash/signature automatically, with no "if present" branch anywhere in the verification path.

**A related, independently-discovered defect fixed in the same pass.** While verifying the Supabase storage round-trip for this field, found that the hybrid-signature fields (`ExecutionTrustRecord.schemaVersion`/`.signatures`, from an earlier "Hybrid Signature Support" milestone) had never been given a Supabase column at all — a `CRYPTO_MODE=hybrid` trust record silently lost its second signature on every read from Supabase, degrading hybrid verification to single-signature for anything reloaded from durable storage, since the record was constructed. Not previously known or documented. Fixed in the same migration as `authorization_json`: see Evidence.

Evidence

- `packages/shared/src/domain/execution-trust-record.ts` (`authorization?: SignedExecutionAuthorization` field)
- `packages/runtime/src/BusinessTrustRecordBuilder.ts` (captures `context.authorization` into the draft, conditionally, to satisfy `exactOptionalPropertyTypes`)
- `packages/crypto/src/VerificationCrypto.ts` (`canonicalRecord()` includes `authorization`)
- `supabase/migrations/20260907120000_add_authorization_and_hybrid_signatures_to_execution_trust_records.sql` (`authorization_json`, `schema_version`, `signatures_json` columns, all nullable)
- `packages/storage/src/supabase/SupabaseExecutionTrustRecordRepository.ts` (`create()`/`findByTransactionId()` persist and retrieve all three)
- `packages/crypto/tests/unit/verification-crypto-authorization.test.ts` (4 cases: verifies with authorization absent; verifies with it present, hash differs from the same record without it; fails closed on a tampered authorization; a record built with the literal pre-fix draft shape hashes identically to one built with `authorization: undefined`)
- `packages/runtime/tests/unit/business-trust-record-builder.test.ts` (2 cases: captures a present authorization onto the built record; leaves the key genuinely absent, not `undefined`, when RuntimeContext has none)
- `packages/storage/tests/unit/supabase-execution-trust-record-repository.test.ts` (2 new cases: full round-trip of `authorization`/`schemaVersion`/`signatures` against a fake `pg.Pool`; a legacy row with none of the three persisted returns them as genuinely absent)
- `python/parmana/models/trust_record.py` regenerated to match (`npm run check:python-models` clean)
- Full repo `npx tsc -b`, `npx eslint . --ext .ts`, and `npx vitest run` all clean: 1514 passed, 38 pre-existing skips, 0 failed. Commit `6303801`

---

## 2.34 Policy Governance Integrity: Signature Verification, Record Chaining, Continuous Checks

**What this closes.** An independent audit of the Policy Governance mechanism (2.26) documented in an artifact published 2026-09-07 found that `PolicyChangeCrypto.verify()` — the signature-verification counterpart to `.sign()`, unit-tested since it was written — was never actually called anywhere in production code. `verifyPolicyGovernanceIntegrityAtStartup()` re-derived and compared a content hash but never re-verified the stored `PolicyChangeApprovalRecord`'s own signature, so a tampered field on an already-persisted record (e.g. a rewritten `approvedBy`) would not have been caught by anything that read it back. The same audit found the integrity check ran only at process startup (a gap of up to a full deploy cycle), and that `packages/policy/src/types/LedgerEntry.ts`/`hashLedger()` were unexported, unimported dead code that could be mistaken for the real audit trail.

**Signature verification wired in.** `verifyPolicyGovernanceIntegrityAtStartup()` (`packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts`) now calls `policyChangeCrypto.verify(mostRecent)` on the most recent approval record for each `(policyName, policyVersion)` pair before trusting its `contentHashAfter`, reporting a new `"signature-invalid"` mismatch reason distinct from `"content-mismatch"`/`"missing"`.

**Approval records are now hash-chained.** `PolicyChangeApprovalRecord` (`packages/shared/src/domain/policy-change-approval-record.ts`) gained an optional `previousRecordHash`, computed by `PolicyChangeApprovalService.approve()` as the hash of the approval record that immediately preceded it for the same `(policyName, policyVersion)` (absent for the first record ever created for that pair), and included inside the record's own signed payload (`PolicyChangeCrypto.canonicalRecord()`) — so tampering with the chain pointer itself invalidates the signature too. `verifyPolicyGovernanceIntegrityAtStartup()` independently re-derives this chain from `PolicyChangeApprovalRecordRepository.list()` and reports a `"chain-broken"` mismatch when a record's `previousRecordHash` does not match the record actually before it, detecting a deleted, reordered, or substituted record in the approval-record store itself — not only a tampered live `policy.json`. Ships with a Postgres migration (`supabase/migrations/20260907130000_add_previous_record_hash_to_policy_change_approval_records.sql`) and the corresponding `SupabasePolicyChangeApprovalRecordRepository` column mapping.

**Continuous, not startup-only.** `schedulePolicyGovernanceIntegrityCheck()` (`packages/api/src/bootstrap/schedulePolicyGovernanceIntegrityCheck.ts`) re-runs the same check every 5 minutes for the life of the process (`POLICY_GOVERNANCE_INTEGRITY_CHECK_INTERVAL_MS` to override, `0` to disable), sharing its construction and fail-open error handling via `runPolicyGovernanceIntegrityCheckOnce()` (`packages/api/src/bootstrap/policyGovernanceIntegrityCheckRunner.ts`). Its interval timer is `.unref()`'d, matching `createGracefulShutdown.ts`'s own discipline for its force-exit timer, so it can never itself keep the process alive past a clean shutdown.

**Minor hardening in the same pass.** `PolicyValidator.validateRegex()` (`packages/policy/src/PolicyValidator.ts`) now rejects `matches` patterns over 200 characters and single-level nested quantifiers (e.g. `(a+)+`) — documented in-source as a heuristic improvement, not a ReDoS-proof guarantee. `findUncoveredFacts()` coverage warnings are now returned as `coverageWarnings` on both the propose response and the `GET /pending-changes` diff listing, so a checker actually sees them at approval time instead of only a load-time `console.warn`. `packages/policy/src/types/LedgerEntry.ts`/`hashLedger()` were deleted (dead code); `@parmana/storage`'s `StorageEngine`/`AppendOnlyLedger` were kept (genuinely tested, exported) but now document in their own doc comment that they are in-memory-only and not part of the live request path.

**Legacy-policy backfill: a script exists, and does not touch a real in-flight approval.** `scripts/backfill-legacy-policy-approvals.ts` creates a synthetic, system-actor `PendingPolicyChange` + signed `PolicyChangeApprovalRecord` (content unchanged) for any `(policyName, policyVersion)` with neither an approval record nor an open proposal — closing the gap that a policy predating Policy Governance is permanently invisible to the integrity check. It is dry-run by default (`--apply` to write) and deliberately not wired into server startup, since mutating the durable audit trail is a reviewed, one-time action, not implicit boot-time behavior. Its first version did not check for an existing open proposal before planning a backfill; fixed the same day (commit `4e1a8e3`) after cross-referencing 2.26's own "Legacy-policy backfill" entry, which records that all ten real production policies already have a genuine, human-proposed `PendingPolicyChange` from 2026-08-19 sitting `PENDING_APPROVAL`. The script now calls `pendingPolicyChanges.findPending()` and excludes any pair with an open proposal from the backfill plan entirely, reporting it separately (`awaitingRealApproval`) rather than fabricating a system approval for content a human maker-checker decision hasn't actually been reached on. **As of this writing the script has not been run with `--apply` against any environment** — the ten real policies 2.26 describes remain exactly as documented there, unaffected by anything in this section.

**Deployment status.** Committed to `main` (commits `437f5ec`, `4e1a8e3`). Full repo `npx tsc -b` and `npx vitest run` both clean: 1524 passed, 38 pre-existing skips, 0 failed, after updating `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts`'s fixtures to carry real signatures (the pre-existing fixtures used a hand-written placeholder signature string, correct for a check that never verified it, and would have failed all nine cases once verification was wired in) and adding two new cases for `"signature-invalid"` and `"chain-broken"`. Not yet checked against any live deployment (`parmana-api.fly.dev` / `parmana-api-live.fly.dev`), same caveat as 2.26.

Evidence

- `packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts` (`"signature-invalid"`, `"chain-broken"` mismatch reasons)
- `packages/api/src/governance/PolicyChangeApprovalService.ts` (`previousRecordHash` computation)
- `packages/shared/src/domain/policy-change-approval-record.ts` (`previousRecordHash` field)
- `packages/crypto/src/PolicyChangeCrypto.ts` (`canonicalRecord()` includes `previousRecordHash`)
- `packages/api/src/bootstrap/policyGovernanceIntegrityCheckRunner.ts`, `schedulePolicyGovernanceIntegrityCheck.ts`, `server.ts`
- `supabase/migrations/20260907130000_add_previous_record_hash_to_policy_change_approval_records.sql`, `packages/storage/src/supabase/SupabasePolicyChangeApprovalRecordRepository.ts`
- `packages/policy/src/PolicyValidator.ts` (`validateRegex()` length cap + nested-quantifier heuristic, `findUncoveredFacts()` surfaced via `coverageWarnings`)
- `packages/api/src/routes/pending-policy-changes.ts` (`coverageWarnings` on propose response and diff listing)
- `scripts/backfill-legacy-policy-approvals.ts` (dry-run by default; excludes any pair with an open `PendingPolicyChange`)
- `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts` (9 cases, including new `"signature-invalid"`/`"chain-broken"` coverage)
- Independent audit artifact (2026-09-07): https://claude.ai/code/artifact/0a454f3f-055c-47c1-a4ff-5401ad582dd0
- Commits `437f5ec` (signature verification, chaining, continuous checks, minor hardening, dead-code removal), `4e1a8e3` (backfill-script fix)

---

## 2.35 Execution-Time Policy Governance Verification (Prevention, Always On Outside Test and Development)

**What this adds.** 2.34 (and 2.26 before it) detect a Policy Governance bypass after the fact — at process startup, or every 5 minutes thereafter. This section adds real prevention on top: a policy with no `PolicyChangeApprovalRecord`, an approval record whose signature does not verify, or live content that no longer matches its approval record's `contentHashAfter` can now be refused _before_ `PolicyEngine` ever evaluates a rule in it, not merely flagged up to 5 minutes later.

**Where it actually lives.** A prior implementation runbook assumed the choke point was `packages/api/src/execution-gateway/ExecutionGateway.ts` — that path does not exist. Reading the source directly found the real, single choke point for every policy evaluation to be `RuntimeEngine.execute()` (`packages/runtime/src/RuntimeEngine.ts,325` — `policyRouter.load()` then `policyEngine.evaluate()`); `packages/execution-gateway/src/ExecutionGateway.ts` is a separate package that runs _after_ authorization, for connector execution, and never calls `PolicyEngine.evaluate()` at all. The new check (`packages/policy/src/types/PolicyExecutionVerifier.ts`, concrete implementation `packages/api/src/governance/PolicyGovernanceExecutionVerifier.ts`) is wired in immediately after the existing G-24 `policyContentHash` computation and before `capabilityPolicyBinder`/`signalIntentBinder` — checking a narrower guarantee against a policy that might itself be illegitimate is meaningless, the same reasoning §2.22/TD-22 already documents for why capability binding runs before signal-intent binding.

**Same optional-dependency idiom as every other pluggable protection in `RuntimeEngine`.** `policyExecutionVerifier` is a new, trailing, optional constructor parameter — the same pattern `signalStateVerifier`/`capabilityPolicyBinder` already use. When omitted, current behavior is unchanged. When supplied and it finds a violation, that becomes an ordinary `PolicyDecision` with `outcome: REJECT` and `matchedRuleId: "policy-execution-verification-violation"` — flowing through the exact same refusal-recording (RFC-0021) and fail-closed `ExecutionGate.enforce()` path every other rejection already uses. No new throw-and-audit-separately mechanism was added; a prior runbook proposed one, and it was deliberately not built, since it would have bypassed the trust/refusal-recording pipeline every other rejection in this codebase goes through.

**Feature-flagged, default OFF — this was a decision, not an oversight.** `createPolicyExecutionVerifier()` (`packages/api/src/bootstrap/createPolicyExecutionVerifier.ts`) returns `undefined` unless `POLICY_EXECUTION_VERIFICATION_ENFORCED=true` is set. This was deliberate when written: at that time, every real production policy in this system was still `PENDING_APPROVAL` with zero rows in `policy_change_approval_records` (2.26's "Legacy-policy backfill" entry, ten policies proposed 2026-08-19). Enabling this gate unconditionally would have refused every execution in the system, not merely a genuine bypass. Before writing any code, this exact tradeoff was put to the user directly (an always-on gate vs. a warn-only stage vs. a feature flag vs. not building it yet); the user chose the feature-flagged default-off option, specifically to avoid a choice between bricking production and fabricating synthetic approvals for the ten real pending policies to work around it — the latter being exactly what 2.34's backfill-script fix (`4e1a8e3`) already refused to do for a different reason.

**Update (2026-09-16): the precondition above no longer holds, the flag itself is unchanged.** 2.26's "Legacy-policy backfill" entry now shows all 14 real production policies with a genuine, distinct-checker `PolicyChangeApprovalRecord`. The reason the flag was off (zero approval records, an unconditional gate would refuse everything) is gone. `POLICY_EXECUTION_VERIFICATION_ENFORCED` has not been changed and remains `false` in `.env` — turning it on is still a separate, deliberate decision the runbook explicitly reserves for a later, dedicated step (Part 5 of the policy approval runbook, in git history: "Do this only once every policy this deployment actually executes against has been resolved"), not something this pass did as a side effect of closing the backfill.

**Update (2026-09-20): the flag no longer decides production behavior.** `createPolicyExecutionVerifier()` now returns a real verifier everywhere except when `NODE_ENV` is exactly `test` or `development`. In production, or with `NODE_ENV` unset or set to any other value, `POLICY_EXECUTION_VERIFICATION_ENFORCED` is ignored and enforcement is on. The earlier gap, where a production deployment could run with the verifier unconfigured (`policyExecutionVerifierConfigured: false` was observed in the live startup log on 2026-09-20), is closed by removing the opt in. The tradeoff recorded above still applies in one direction: any deployment must have a genuine, signed approval record for every policy it executes against before it goes live, or executions under that policy are refused.

**What this does not change.** The CI merge-gate requirement described in 2.26 ("Preventive Git-layer enforcement") is unchanged — still fail-closed in CI, still not a _required_ GitHub status check, still blocked by GitHub plan/repository-visibility limits external to this codebase, not attempted again here.

Evidence

- `packages/policy/src/types/PolicyExecutionVerifier.ts` (`PolicyExecutionVerifier`/`PolicyExecutionViolation`, undefined-means-clean)
- `packages/api/src/governance/PolicyGovernanceExecutionVerifier.ts` (concrete implementation: no-record / bad-signature / content-mismatch checks, in that order)
- `packages/api/src/bootstrap/createPolicyExecutionVerifier.ts` (enforced by default; relaxed only when `NODE_ENV` is exactly `test` or `development`, see 2.36)
- `packages/runtime/src/RuntimeEngine.ts` (constructor param, observability log field, `execute()` wiring before capability/signal-intent binding), `RuntimeBuilder.ts` (`withPolicyExecutionVerifier`), `RuntimeFactory.ts`, `packages/api/src/application.ts`
- `packages/api/tests/unit/PolicyGovernanceExecutionVerifier.test.ts` (4 cases: no record, bad signature, content mismatch, clean)
- `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts` (cases: enforced in production, cannot be switched off in production by the env var, enforced when `NODE_ENV` is unset or unrecognized, off in test and development unless exactly `"true"`)
- `packages/runtime/tests/e2e/runtime.e2e.test.ts` (2 new cases: a configured violation rejects before `PolicyEngine` runs; no violation leaves execution unaffected), `packages/runtime/tests/unit/optional-protections-logging.test.ts` (1 new case)
- `examples/tutorials/104-policy-governance-execution-verification/run.ts` (runnable narrative, no HTTP server: an approved policy executes normally, a policy with no approval record is refused, a policy edited outside the governed API is refused and independently caught by `verifyPolicyGovernanceIntegrityAtStartup()` too, and a tampered approval record is refused on signature failure — added in the same pass as this evidence update, registered in `scripts/run-examples.ts`)
- Full repo `npx tsc -b` and `npx vitest run` clean: 1544 passed, 38 pre-existing skips, 0 failed. Commit `7a1aa37`

**Update (2026-10-16, proof audit, G-105 and G-103):** governance relaxation (`NODE_ENV` of `test` or `development`)
now also needs an explicit `PARMANA_ALLOW_UNGOVERNED_POLICY=true`. `NODE_ENV` alone no longer disables the
approval-record check. The policy content hash is always required, including in the relaxed mode, since the
production bootstrap no longer sets `allowUnverifiedPolicy`.

## 2.36 Fail-Closed Policy Binding at the Execution Boundary

Every execution released by `ExecutionGateway` proves one policy hash across the whole chain, and any mismatch or any missing piece stops the execution before the connector is called. Four hashes must agree:

1. The policy the caller declared is the policy actually evaluated (capability to policy binding, 2.22, for registered capabilities).
2. The policy content hash equals the `contentHashAfter` of the policy's most recent signed `PolicyChangeApprovalRecord`, and that record's signature verifies. A checker's signed approval is the authority act that makes a policy usable.
3. That same hash is signed into the execution authorization as `policyContentHash` (2.27).
4. At release, the gateway recomputes the live policy hash and it must still equal the signed one, and the approval record check runs again against that live hash.

What changed on 2026-09-20 (`packages/execution-gateway/src/ExecutionGateway.ts`):

- **Missing is a failure, not a skip.** An authorization with no `policyContentHash` (an older authorization signed before 2.27) is rejected with `policyStillCurrent: false`. A missing policy at that name and version is a rejection. An error from the approval verifier is a rejection.
- **The approval record is checked at release, not only before authorization.** `ExecutionGatewayOptions.policyApprovalVerifier` reuses the `PolicyExecutionVerifier` port from 2.35. The result is `checks.policyGovernanceVerified` and, on failure, `policyGovernanceViolation.reason`.
- **A pass must be positive.** By default `valid` requires `policyStillCurrent === true` and `policyGovernanceVerified === true`. "Not run" is never a pass.
- **A misconfigured gateway cannot start.** The constructor throws unless it has both a `policyRepository` and a `policyApprovalVerifier`, unless the explicit opt out `allowUnverifiedPolicy: true` is set. Production bootstrap (`createExecutionGateway.ts`) sets it only when `createPolicyExecutionVerifier()` returns `undefined`, which happens only under `NODE_ENV` `test` or `development`.
- **The nonce is not burned by a policy binding failure.** The nonce remains the last check and is consumed only when every earlier check passed.

Scope, stated plainly:

- This binds execution to the policy a human checker approved. It does not prove the policy is correct or wise, and it does not model per policy or per role approver authority. Any provisioned human checker with a step up key can approve any policy (see G-50 in `docs/VERIFICATION-GAPS.md`).
- Signals such as `fraudCheckPassed` are caller declared unless a `SignalStateVerifier` covers that capability. The HubSpot verifier and, for any signal a policy declares in `approvalSignals` (such as `managerApproved` on refunds), `ApprovalSignalVerifier` (2.42) are wired; other signals are only as true as the caller says (G-51). Since 2026-09-28 the policies for merges and LLM tool calls need a signed approval, so their caller declared facts cannot authorize on their own (2.44).
- The claim holds for execution routed through the gateway. A request that never reaches the gateway is not covered (see 3.1).
- Direct edits to the policy store outside the API are prevented from executing (hash mismatch against the approval record) but are still only detected, not blocked, at the storage layer.

Evidence

- `packages/execution-gateway/src/ExecutionGateway.ts`, `GatewayVerificationResult.ts` (`policyGovernanceVerified`, `policyGovernanceViolation`, `allowUnverifiedPolicy`)
- `packages/execution-gateway/tests/unit/policy-binding-fail-closed.test.ts` (10 cases: all hashes agree, construction refused without repository or verifier, no `policyContentHash`, policy edited after authorization, no approval record, stale approval hash, verifier error, policy missing, nonce not burned, explicit legacy opt out; each failure asserts zero connector calls)
- `packages/api/src/bootstrap/createPolicyExecutionVerifier.ts`, `createExecutionGateway.ts`
- `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts`
- Full repo `npx tsc -b` clean and `npx vitest run`: 1871 passed, 42 skipped, 0 failed

## 2.37 Large Message Signing Under AWS KMS (Commitment Scheme)

An Execution Trust Record, an execution authorization, or any other artifact whose canonical form is longer than 4096 bytes can be signed with a KMS held Ed25519 key and verified independently. AWS KMS refuses a raw Ed25519 message over 4096 bytes, which broke `POST /execute` for `paytm:refund` in production on 2026-09-20 (`VerificationCrypto.sign` calling `KmsSigner.sign`, `ValidationException: Member must have length less than or equal to 4096`).

The decision is recorded in `docs/adr/ADR-0010-Large-Message-Signing-Under-KMS.md`:

- A message of 4096 bytes or fewer is signed and verified raw, exactly as before, so every signature issued before this change stays valid.
- A longer message is signed by the KMS signer as a fixed 97 byte commitment, the prefix `PARMANA-ED25519-LARGE-MESSAGE-V1` and a NUL byte followed by the SHA-512 digest of the message. The signature is an ordinary Ed25519 signature.
- The scheme depends only on message length, so no marker or schema change is stored on any record.
- A verifier accepts a raw signature for any message, and additionally the commitment form only for a message over 4096 bytes. A commitment signature over a message at or below the limit is rejected, so a small message cannot be downgraded to the commitment form.

Scope, stated plainly:

- The TypeScript packages and the Python SDK implement the rule. A third party verifier must implement it to verify a large KMS signed artifact. It is fully specified in the ADR and the Python module is a compact reference.
- This makes signing possible. It does not change the ordering in which a request is processed. The connector can still be called before the trust record is signed, so a signing failure after the connector call leaves an executed action without a signed record (G-52 in `docs/VERIFICATION-GAPS.md`).
- Verified against the real AWS KMS service in production on 2026-09-20 (commit 333786a): a live `paytm:refund` returned `200` with a 4965 byte trust record that verifies only as the commitment signature, and `verifyExecutionTrustRecordOffline` accepted it against the live public key.

Evidence

- `packages/crypto/src/SignatureCommitment.ts`, `providers/signer/KmsSigner.ts`, `providers/signature/Ed25519SignatureProvider.ts`
- `packages/crypto/tests/unit/signature-commitment.test.ts` (boundary at 4096 and 4097 bytes, tamper, wrong key, wrong message, no downgrade, raw backward compatibility, end to end sign and verify of a 30,000 byte artifact through a signer that enforces the KMS limit, and a naive signer that fails on the same artifact)
- `packages/crypto/tests/unit/kms-signer.test.ts` (exactly 4096 bytes sent raw, longer sent as the 97 byte commitment and never raw)
- Live evidence, 2026-09-20, production commit 333786a: canonical record 4965 bytes, raw signature check false, commitment signature check true, offline verifier `valid: true` against `GET /keys/default`, `verifications[0].status` `VERIFIED`, no `ValidationException` in the runtime log
- `python/parmana/crypto/offline_verifier.py`, `python/tests/test_offline_verifier.py` (TypeScript signs a large record as a commitment and the independent Python verifier accepts it, rejects a tampered copy, and rejects a commitment signature over a small message), `scripts/generate-offline-verifier-fixture.ts`

## 2.38 Signing Readiness Before Release, Explicit Failure After Release

Before an action is released to a connector, the runtime proves that the evidence signing path can currently produce a signature that verifies. If it cannot, the request is refused with `503 SIGNING_UNAVAILABLE` and nothing is executed. If the action was released and the signed Execution Trust Record then cannot be produced or persisted, the failure is reported as `500 EXECUTION_RECORD_INCOMPLETE`, naming the `businessTransactionId` and `authorizationId`, with a critical log event, instead of a generic `500` that reads as "nothing happened". The decision is recorded in `docs/adr/ADR-0011-Signing-Readiness-And-Explicit-Post-Release-Failure.md`.

- The probe (`VerificationCrypto.probeSigning()`) signs a synthetic artifact over 4096 bytes through the same signer and key id used for trust records and verifies it against the public key the same signer publishes. It catches a missing, disabled or denied key, a KMS or network outage, a signing and verification key mismatch, and the KMS size limit.
- A success is cached for 60 seconds, a failure is never cached, and concurrent requests share one probe.
- It is enforced everywhere except when `NODE_ENV` is exactly `test` or `development`, and no environment variable can switch it off in production.
- A failure before release, such as a policy rejection, is not reclassified as a released action.

Scope, stated plainly:

- This does not guarantee that every executed action has a signed trust record. A transient failure between the readiness check and the real signing, or a database failure after release, still leaves an executed action with no signed record. It narrows the window and makes the failure explicit and reconcilable. **Superseded on 2026-09-21 by section 2.39:** a signed Execution Intent is now stored before release, and a missing record can be rebuilt.
- There was no two phase record and no rebuild path for a missing record (G-53 in `docs/VERIFICATION-GAPS.md`) when this section was written. Section 2.39 adds both, with the limits stated there.
- Verified in tests, and the success path verified live on 2026-09-20 (production commit 4047536): the startup log shows `signingReadinessConfigured: true` and a live `paytm:refund` returned `200` with `VERIFIED`, which required the readiness probe to pass against the real KMS. The failure responses (`503 SIGNING_UNAVAILABLE`, `500 EXECUTION_RECORD_INCOMPLETE`) are proven in unit tests, not by live fault injection.

Evidence

- `packages/runtime/src/SigningReadiness.ts`, `RuntimeEngine.ts`, `Runtime.ts`, `errors/SigningUnavailableError.ts`, `errors/ExecutionRecordIncompleteError.ts`
- `packages/crypto/src/VerificationCrypto.ts` (`probeSigning`), `packages/api/src/bootstrap/createSigningReadiness.ts`, `packages/api/src/application.ts`
- `packages/runtime/tests/unit/signing-readiness.test.ts` and `execution-record-incomplete.test.ts` (readiness failure leaves the release counter at zero, failure after release is `EXECUTION_RECORD_INCOMPLETE` with the identifiers and a critical log, a persistence failure is reported the same way, a policy rejection before release is not reclassified)
- `packages/crypto/tests/unit/signing-probe.test.ts` (matching key passes, missing key fails, mismatched public key fails)
- `packages/api/tests/unit/bootstrap/create-signing-readiness.test.ts`

---

## 2.39 Execution Intents: Signed Evidence Before Release, and a Repair Path

Before an action is released to a connector, the runtime signs an Execution Intent and stores it. If it cannot, nothing is released and the caller gets `503 EXECUTION_INTENT_UNAVAILABLE`. So an action that was released always has a signed intent that was stored before it. If the signed Execution Trust Record then cannot be produced or stored, it can be rebuilt from the execution context that was saved right after release, with `POST /execution-intents/{businessTransactionId}/finalize`, which never calls the connector. The decision is recorded in `docs/adr/ADR-0012-Signed-Execution-Intent-Before-Release.md`, and the operator procedure is the docs site page `concepts/execution-intents`.

- The intent is a separate record with its own table (`execution_intents`). The Execution Trust Record keeps its format, and both SDK verifiers keep verifying it unchanged.
- What is signed: the ids, the policy reference, `policyContentHash`, `signalsHash` and `businessTransactionHash` copied from the signed authorization, `action`, `target`, `submittedBy`, `grantedCapability` and `createdAt`. Never the execution result and never the raw intent parameters.
- The signature is made with the same key as the Trust Record, so AWS KMS in production. It verifies with the public key alone, through `POST /execution-intents/verify` (no credential) or offline with `scripts/verify-execution-intent.ts`.
- The operational state (`PREPARED`, `RELEASED`, `FINALIZED`, `ERRORED`) is stored next to the intent and is not signed. Status updates after release are best effort and never throw. They log at critical severity.
- Finalize is idempotent and race safe: an existing record is returned and nothing is built, and a record that appears while it works is treated as already finalized. It also verifies the record and generates the receipt.
- Marking an intent `FINALIZED` deletes the saved execution context, because the Trust Record then holds it.
- It is enforced everywhere except when `NODE_ENV` is exactly `test` or `development`, where `EXECUTION_INTENTS_CHECK=true` turns it on. No environment variable switches it off in production. `GET /ready` reports `NOT_READY` when the table is missing.
- `finalize` and `GET /execution-intents/unfinalized` need a credential provisioned as a verified human, and refuse any other with `403 NON_HUMAN_CALLER_DENIED`.

Scope, stated plainly:

- An intent proves what was about to be released. It does **not** prove that the action was released, or what its result was, because it is written before release. An intent in `PREPARED` or `ERRORED` means the action may or may not have run, and only the connector can say.
- This does not guarantee that every released action has a signed Trust Record. `EXECUTION_RECORD_INCOMPLETE` is still possible. It is repairable when the execution context was saved (state `RELEASED`). When that save also failed (state `PREPARED`), finalize refuses with `409 EXECUTION_INTENT_RESULT_NOT_RECORDED` and the outcome has to be established from the connector by hand.
- An `ERRORED` or `PREPARED` intent that an operator reconciled at the connector is closed with `POST /execution-intents/{businessTransactionId}/resolve` (G-54, closed). That records what they found (`NOT_EXECUTED` or `EXECUTED`), a required note, who and when, in the intent's **unsigned** status. It is an attributed operator statement. It is **not** tamper evident and it does **not** create a Trust Record. It never calls a connector, is idempotent, and refuses a `RELEASED` intent (use finalize), a `FINALIZED` intent, and any transaction that already has a Trust Record.
- The TypeScript and Python SDKs have methods for the intent routes (G-55, closed in the source on 2026-09-21). **They are in SDK 1.2.0, published on 2026-09-21, and not in 1.1.6 or earlier.** The Python SDK has an offline intent verifier that needs only the public key. The TypeScript SDK has none in 1.2.0; 1.3.0, published to npm on 2026-09-25, adds one (2.41).
- Transactions created before this change have no intent, and their behavior is unchanged.
- Deploying this version without the migration `20260921120000_add_execution_intents.sql` makes every execution fail closed with `503 EXECUTION_INTENT_UNAVAILABLE`. That is by design, and `GET /ready` reports it first.

Verification

- Unit and integration tests, listed under Evidence, all pass. The full suite passed on 2026-09-21.
- The Postgres queries were also run against a real Postgres with every migration applied: 16 checks covering the state guards, the unique and foreign key constraints and the JSON round trip.
- Live on 2026-09-21, against the production Docker image built from this code, a real Postgres, the real AWS KMS key `alias/default` in `ap-south-1` and the real `parmana-paytm-agent` (with fake Paytm staging credentials, because the subject was the intent lifecycle and not Paytm): 23 of 23 checks passed. They cover a normal request (the intent and the Trust Record each verified offline with only the KMS public key), a released action whose Trust Record could not be stored (a signed intent survived, finalize rebuilt the record with the connector called exactly once in total, a second finalize was a no-op, and the rebuilt record verified offline), and an intent that could not be stored (`503 EXECUTION_INTENT_UNAVAILABLE`, the connector was not called, no intent row was written). After closing an intent by hand (G-54) was added, the whole check, now four scenarios, passed 37 of 37 under the same KMS key, including a real connector failure that a human then closed. An earlier attempt under KMS had one scenario fail because the agent's own call to Paytm staging failed on the network (`fetch failed`): the intent correctly ended `ERRORED` and the scenario never reached the state it tests. The check no longer depends on the internet: the rig now answers the agent's one call to Paytm staging with a local stand in (the response shape real staging returned for a bad merchant id), and it passed 37 of 37 three times in a row under KMS. The 23 of 23 run above called real Paytm staging with fake credentials. A later run also failed once because the temporary AWS credentials handed to the container had expired after about 15 minutes, so the rig now records their expiry and stops early with an instruction.
- A repeat live run recorded an unplanned real connector timeout as an intent in state `ERRORED` with the reason `PaytmConnector "paytm" request to capability "paytm:refund" timed out after 10000ms`. That is the designed behavior.
- Cost, measured once: about 35 ms median for the extra KMS signature (34 to 40 ms, 10 samples), from a Windows machine to `ap-south-1`. Not measured from Vercel.
- Not verified: the Vercel OIDC role signing an intent, latency from Vercel, or a real Paytm refund.

Evidence

- `packages/shared/src/domain/execution-intent.ts`, `packages/shared/src/repositories/execution-intent-repository.ts`
- `packages/crypto/src/ExecutionIntentCrypto.ts`, `ExecutionIntentCanonicalView.ts`, `OfflineVerifier.ts` (`verifyExecutionIntentOffline`), `scripts/verify-execution-intent.ts`
- `packages/runtime/src/ExecutionIntentBuilder.ts`, `ExecutionIntentService.ts`, `ExecutionIntentFinalizer.ts`, `RuntimeEngine.ts`, `Runtime.ts`, `ExecutionTrustApplication.ts`, `errors/ExecutionIntent*Error.ts`
- `packages/storage/src/supabase/SupabaseExecutionIntentRepository.ts`, `memory/MemoryExecutionIntentRepository.ts`, `supabase/migrations/20260921120000_add_execution_intents.sql`
- `packages/api/src/routes/execution-intents.ts`, `bootstrap/createExecutionIntents.ts`, `routes/ready.ts`
- `packages/runtime/tests/unit/execution-intent.test.ts` (the intent is signed and stored before the connector is called, a failed intent store or signature releases nothing, a release error is `ERRORED`, a failed record store leaves a `RELEASED` intent, finalize rebuilds a verifiable record without a second release, is idempotent and race safe, and refuses with `409` and `404`)
- `packages/crypto/tests/unit/execution-intent-crypto.test.ts` (offline verification, tamper detection, and agreement with the runtime signer), `packages/storage/tests/unit/execution-intent-repository.test.ts`
- `packages/api/tests/integration/execution-intents.integration.test.ts` (the routes, the authorization rules and the full repair over HTTP), `packages/api/tests/unit/bootstrap/create-execution-intents.test.ts`, `packages/api/tests/unit/routes/ready.test.ts`

---

## 2.40 Self Hosted Deployment: One Command Start, Enforcement With No Internet Route (Scoped)

A customer can run Parmana on its own infrastructure with one command, `docker compose up -d --build --wait`, and that deployment authorizes, refuses, executes and signs evidence with no route to the internet and no call to the hosted service. Decisions, signatures, the audit trail and the Trust Records stay in the deployment's own Postgres, and a Trust Record it produces verifies anywhere with only the public keys.

- The start needs only Docker on the host. `setup` makes the two Ed25519 key pairs and an API key inside the image and keeps them on every later start. `migrate` creates the roles the migrations expect and applies each migration once, recorded in `parmana_schema_migrations`. `seed` copies the shipped policies into the database without overwriting any version already there. `api` is the unchanged production image, run with `PARMANA_STORAGE=postgres`.
- `PARMANA_STORAGE=postgres` selects the same Postgres storage as `supabase` (G-57). `supabase` is unchanged for existing deployments.
- Every production rule is kept, none is relaxed for the self hosted path: caller authentication, the rule that a key acts only for its own principal, policy governance before a policy may authorize, the HTTPS only connector URL, Execution Intents, signing readiness and refusal recording.

Scope, stated plainly:

- **A new deployment authorizes nothing until its own people approve the policies they use** through policy governance (2.26, 2.35). `seed` does not approve them. API keys for the proposer and approver are issued inside the image (`docker/local/api-keys.mjs`). Signing the approval no longer needs the repository: the TypeScript SDK 1.3.0, published on npm on 2026-09-25, signs it (2.41, `docs/VERIFICATION-GAPS.md` G-62, closed). The Python SDK 1.3.0, published on PyPI the same day, signs it too.
- An authorized action whose connector cannot be reached, times out or answers with an error returns `502 EXECUTION_OUTCOME_UNKNOWN` with the transaction's identifiers, matching the Execution Intent's `ERRORED` state (G-63, closed 2026-09-25; before, a bare `500`).
- Verified on Docker Desktop 29.8.0 on Windows 11 and on Linux in CI run 36113024609 (`.github/workflows/docker-image.yml`, job `self-hosted`, 2026-09-25, on the merge commit `a14bc5c`). CI repeats it on every change to the deployment files, and also runs every command of the quickstart page and compares the output (`docker/local/quickstart-check.sh`).
- The offline run used a stand in for the downstream system (`parmana-paytm-agent`), not a real one. It covers the Paytm connector only.
- The images were built while online. The claim is about running, not about building, with no internet.
- One API instance with one Postgres. No high availability.
- **No customer runs this deployment.** That remains a future claim in section 4.

Verification

- Clean start on 2026-09-25: every service completed or became healthy. `GET /ready` returned `{"status":"READY","authDisabled":false}`. `POST /execute` returned `401` with no key and `400` with the generated key and an empty body.
- Second start: both key files and `api-keys.json` unchanged (SHA-256 compared), `migrate` reported `0 applied, 31 already applied`, `seed` reported `0 added, 14 already present and kept`, and the caller audit rows written before the restart were still there.
- Offline check, `bash docker/local/offline-check/run.sh`, on a Docker network created with `internal: true`: 12 of 12 checks on each clean run (G-60 lists them). **Update (2026-09-30, 2.47):** the check now adds a refund manager through maker checker and signs the refund's approval, 14 checks. Run on 2026-09-30 with Docker: 14 of 14 passed, including the manager key added by one human and approved by another, and the refund with that manager's signed approval executed once. They include: no internet route; a policy approved by a second human with a signed step up authorization after the proposer was refused as approver; an authorized refund executed and reaching the downstream stand in, which verified the gateway's signature with only the public key; a refund over the policy threshold refused with `403 POLICY_DENIED` and never reaching it; the Trust Record verified with only the public keys; and a changed copy failing.
- The Trust Record saved by that run was verified again on the host, outside Docker, with `scripts/verify-trust-record.ts`: `valid: true`.
- Unit tests for the `postgres` storage name: 57 of 57 in the four affected files.

Evidence

- `docker-compose.yml`, `docker/local/setup.mjs`, `docker/local/migrate.sh`, `docker/local/postgres-roles.sql`, `docker/local/seed-policies.mjs`
- `docker-compose.offline-check.yml`, `docker/local/offline-check/run.sh`, `check.mjs`, `check-identities.mjs`, `paytm-agent-stand-in.mjs`
- `packages/shared/src/config/StorageProviders.ts` (`isPostgresStorage`), `packages/storage/src/StorageFactory.ts`, `packages/api/src/bootstrap/assertStorageConfigured.ts`, `packages/api/src/routes/ready.ts`
- `packages/storage/tests/unit/storage-factory.test.ts`, `packages/api/tests/unit/bootstrap/assert-storage-configured.test.ts`, `packages/api/tests/unit/routes/ready.test.ts`, `packages/shared/tests/unit/config-validation.test.ts`
- `.github/workflows/docker-image.yml`, job `self-hosted`
- `docs/site/self-hosted/` (the operator guide: overview, quickstart, policy approval, API keys, connectors, offline verification, operations, configuration, troubleshooting), `docker/local/api-keys.mjs`, `docker/local/examples/refund-request.mjs`, `docker/local/quickstart-check.sh`; `docs/VERIFICATION-GAPS.md` G-56 to G-63

---

## 2.41 The TypeScript and Python SDKs Cover the Same Product API (Scoped, SDK 1.3.0, Published)

Both SDKs have a method for every product operation of the API, the same set in each, and the same offline and signing capabilities. The mapping, with the reason for each route that has no method, is `docs/site/sdks/api-coverage.mdx`.

- **Policy governance**, which neither SDK had: propose (`POST /policies/{name}/{version}/pending-changes`), list for review (`GET /policies/pending-changes`), approve and reject (`POST /policies/pending-changes/{id}/approve|reject`), and signing the step up authorization on the approver's machine (`signPolicyChangeStepUp()`, `parmana.crypto.sign_policy_change_step_up()`). The signature is the server's own format: key sorted canonical JSON of the payload, Ed25519, base64.
- **Also in both:** `GET /callers/me`, `GET /keys/{keyId}`, and Trust Record listing (`GET /trust-records`, with `since` and `until`).
- **TypeScript gains what only Python had:** offline verification of Trust Records and Execution Intents, `GET /receipt/latest/{id}`, and the HTTP status on every error (`statusCode`, Python's `status_code`).
- **Python gains:** the offline verifiers accept the SDK's own decoded models as well as raw JSON, and a `latest_receipt()` shortcut.
- Policy content and step up authorizations are sent exactly as given. The Python SDK's model encoder rewrites dict keys with an underscore to camelCase; the new methods do not pass user content through it.

Scope, stated plainly:

- **Published: both.** `@parmana/sdk` 1.3.0 was published to npm on 2026-09-25 (visible at 10:14:57 UTC); installed from npm into a clean project it reports 1.3.0 with every new export, and it passed the same 11 of 11 live checks against a self hosted deployment. `parmana` 1.3.0 was published to PyPI the same day (wheel and source archive); installed from PyPI into a clean environment it reports 1.3.0 with every new method, and it passed the same 11 of 11 live checks against a self hosted deployment.
- The routes with no method are the readiness probe, the JWKS document, the API's own description files and the handbook download, each with its reason in the coverage page.
- ML-DSA-65 is not verified by either SDK; a hybrid record is reported as not valid, with the reason.
- In Python, `client.version` is the SDK's version, while TypeScript's `version()` is the server's. This existing difference is documented, not changed.

Verification

- TypeScript: 191 tests in 18 files pass, including `typescript/test/Alignment.test.ts` (16 tests): the method, path and body of each new operation; offline verification of the same real server signed Execution Intent the Python tests use, and of a Trust Record checked against the server's own reference verifier; a step up authorization accepted by the server's `PolicyChangeStepUpAuthorizationVerifier`; `statusCode` on HTTP errors. The documentation examples were typechecked against the built SDK in strict mode.
- Python: 119 tests pass, including `python/tests/test_sdk_alignment.py` (10 tests), one of which runs the server's TypeScript verifier on a step up authorization signed in Python. `ruff`, `black` and `mypy` are clean. `npm run check:python-models` covers the newly generated `policy_change.py`.
- Live, 2026-09-25, each SDK against a self hosted deployment: caller; public key; propose, list, sign and approve a policy change; a reused signature refused (`403`); a refused request (`403 POLICY_DENIED`) with its Refusal Record verified; an authorized request with no connector (`503`, `CONNECTOR_NOT_REGISTERED` on the error); that request's Execution Intent verified offline with the fetched public key; Trust Record listing. 11 of 11 in each.
- `scripts/check-sdk-docs.ts` passes: every name the SDK pages use exists.

Evidence

- `typescript/src/client/PolicyApi.ts`, `CallerApi.ts`, `TrustRecordApi.ts`, `ReceiptApi.ts`, `ParmanaClient.ts`; `typescript/src/crypto/canonical.ts`, `offline-verifier.ts`, `step-up.ts`; `typescript/src/models/policy-change.ts`, `caller.ts`; `typescript/src/transport/mapHttpErrorResponse.ts`
- `python/parmana/api/policy_api.py`, `caller_api.py`, `trust_record_api.py`; `python/parmana/crypto/step_up.py`, `offline_verifier.py`; `python/parmana/models/policy_change.py` (generated), `policy_change_results.py`, `caller.py`; `python/parmana/client.py`
- `typescript/test/Alignment.test.ts`, `python/tests/test_sdk_alignment.py`
- `docs/site/sdks/api-coverage.mdx`, `docs/site/sdks/typescript.mdx`, `docs/site/sdks/python.mdx`; `docs/VERIFICATION-GAPS.md` G-62 and G-64

## 2.42 Signed Human Approval Declared by Policy, First Used for Large Refunds (Scoped, 2026-09-27)

A `paytm:refund` above 10000 executes only with a signed approval from a trusted approver, for that order, covering that amount, used once. A refund whose signals say `managerApproved: true` without one is refused, at any amount.

- **Policy:** `customer-refund` 1.1.0, bound to `paytm:refund`. Up to 10000: authorized automatically after the eligibility and fraud checks. Above 10000 and up to 100000: only with `managerApproved: true`. Above 100000: refused. Refusals that need a manager have their own rule id, `reject-manager-approval-required`.
- **Verification, for any action:** a policy declares which signals need a signed approval in `approvalSignals`, with dot paths to the resource (or the Intent's `target`) and, optionally, the value in the Intent (`customer-refund` 1.1.0: `managerApproved`, `parameters.orderId`, `parameters.amount`). `ApprovalSignalVerifier` enforces every declaration, with no per action code. It runs when policy would approve, before the authorization is signed, and again in the Execution Gateway just before release, against the policy the gateway loaded and hash checked. It checks the approver is trusted and not revoked, the Ed25519 signature, the expiry, the action, the resource and the value (read from the Intent, never from the caller's signals), checks every approval before using any, and uses each once, at authorization. `PolicyValidator` rejects a declaration no rule reads, a resource path other than `target` or one into the Intent's parameters, a key that is also bound, or two declarations sharing an approval.
- **Approvers** sign on their own machine with `scripts/sign-approval.ts`, from a key made by `scripts/generate-approver-key.ts`. Approver keys are Ed25519 whatever the server's own signing algorithm is.

Scope, stated plainly:

- **One approver is configured.** `TRUSTED_APPROVAL_ISSUERS` lists one approver, `manager-charak1987` (added 2026-09-28, held by the operator, who also holds the maker and checker credentials); an approval from anyone else is refused. It takes effect in production when its change is deployed. The success path is proven in tests with a test approver; an approval signed by `manager-charak1987` being accepted in production has not been checked yet. **Update (2026-09-30):** key `manager-charak1987-key-1` is revoked in code; the manager now signs with `manager-charak1987-key-2`, added through maker checker (`/approval-issuers/changes`) during the credential rotation.
- **Approved in production, 2026-09-27 18:53:40 UTC** (pending change `008f504d-0efd-4bec-b33a-2991bb84099f`), so refunds in production run under 1.1.0. With no approver configured, every production refund above 10000 is refused. The approval was made with two distinct credentials held by one person, not by two people (2.43).
- A refused request is not held for a person, and nobody is notified. The agent sends a new request with the approval.
- **The refund agent** (`parmana-paytm-agent`) forwards a signed approval (`approvalArtifact` in its `/agent/refunds` body) since its PR #6, deployed 2026-09-28; before that it had no way to send one. A signed approval through the agent has not been tested in production yet.
- `refundEligible` and `fraudCheckPassed` are still caller declared (G-51). **Update (2026-09-28, G-75):** under 1.1.0 they alone authorize a refund up to 10000. `customer-refund` 1.2.0, now named in the binding, needs a signed approval for every refund, so they can only refuse; production moves to it when it is approved (2.44).
- Holds for refunds routed through Parmana (3.1).

Verification

- `packages/api/tests/integration/paytm-refund.integration.test.ts` (15 tests, the real production bootstrap with a test approver): a 75000 refund with a valid approval executes exactly once; no approval, another order, a smaller approved amount, an untrusted key, a changed payload, another capability, and a reused approval are each refused with zero connector calls; above 100000 is refused with an approval; `customer-refund` 1.0.0 is refused by the binding.
- `packages/approval/tests/unit/ApprovalSignalVerifier.test.ts` (24: a refund with an amount, a merge whose resource is the Intent's target with no amount, a numeric resource, two approvals in one policy, nested paths, single use across both checks, and a request with no policy), `packages/policy/tests/unit/PolicyValidator-approvalSignals.test.ts` (14), `packages/policy/tests/unit/CustomerRefundPolicy110.test.ts` (11), `packages/crypto/tests/unit/approval-artifact-signer.test.ts` (6), `scripts/tests/approver-scripts.test.ts` (14).
- With `ApprovalSignalVerifier` removed from the app, 7 of the 15 refund integration tests fail; with the gateway not passing the policy at release, the valid approval is refused there (fails closed).
- Building it found and closed G-67: an approval could never pass the gateway's second check, for HubSpot too.

Evidence

- `policies/customer-refund/1.1.0/policy.json`; `packages/capability-registry/src/CapabilityPolicyBinding.ts`
- `packages/approval/src/ApprovalSignalVerifier.ts`; `packages/policy/src/types/Policy.ts` (`approvalSignals`), `PolicyValidator.ts`; `packages/api/src/bootstrap/createApprovalVerifier.ts`, `createApprovalSignalVerifier.ts`; `packages/api/src/application.ts`; `packages/execution-gateway/src/ExecutionGateway.ts` (passes the verified policy at release)
- `packages/crypto/src/ApprovalArtifactCrypto.ts`; `packages/approval/src/ApprovalVerifier.ts` (`consumeNonce`); `packages/policy/src/types/SignalStateVerifier.ts` (`stage`)
- `scripts/generate-approver-key.ts`, `scripts/sign-approval.ts`; `docs/site/concepts/human-approval.mdx`; `docs/VERIFICATION-GAPS.md` G-65, G-67

**Update (2026-10-03, follow up):** an approval's `scope.field` was never compared, so an approval scoped to one fact was accepted for another whenever its bound happened to compare true. `ApprovalSignalVerifier` now requires `scope.field` to be `value` when the declaration gives a `value`, and `resourceId` when it does not, the names the TypeScript and Python SDKs and `scripts/sign-approval.ts` already write. `ApprovalVerifier` takes an optional `scopeField`; the HubSpot verifier requires `amountDeltaAbs`. An approval signed with another field name, such as `amount`, is now refused. Evidence: `packages/approval/tests/unit/ApprovalSignalVerifier.test.ts` (4 new), `packages/approval/tests/unit/ApprovalVerifier.test.ts` (1 new).

## 2.43 A Live Action's Policy Version Is Decided by Policy Governance, Not by a Deploy (Scoped, 2026-09-27)

For a capability in `CANONICAL_CAPABILITY_POLICY_BINDINGS`, the policy name is fixed in code and the version is the one most recently approved for that name through policy governance. A new version takes effect when a second caller, other than the proposer, approves it; approving an older version again rolls back to it. No code change and no deploy. The server checks that the two callers differ, not that they are two people: in production on 2026-09-28 both credentials are held by one person.

- A request that names the bound policy at any other version, including an older version that was approved in the past, is refused before any rule runs, with a message naming the version in effect.
- No approved version, or a failed lookup of it, refuses the request.
- Where policy governance is not enforced (`NODE_ENV` test and development, unless `POLICY_EXECUTION_VERIFICATION_ENFORCED` is `true`), the version written in the table applies. The two are switched on by the same rule.

Scope, stated plainly:

- **Merged and deployed** 2026-09-27 (PR #47 into #46, then #46 into `main`, merge `4eebd5f`). Production's `customer-refund` versions in effect were not checked after the deploy.
- Binding an action to a different policy name, adding a capability, and adding an approver still need a deploy.
- Agents must send the version in effect. After an approval, requests naming the previous version are refused until agents update. **Added 2026-09-28:** `GET /policies/in-effect?capability=<action>` returns the policy to declare right now, from the same `CapabilityPolicyBinder.policyInEffect` the check uses, so an agent that asks before each request needs no update when a version is approved. It answers a caller whose key may invoke the capability, or a human caller (`packages/api/src/routes/policy-in-effect.ts`; `packages/api/tests/integration/policy-in-effect.integration.test.ts`). The refund agent (`parmana-paytm-agent`) declared 1.0.0 in its code, so every refund it sent to production was refused from the approval of 1.1.0 until its PR #6, deployed 2026-09-28, which makes it ask this endpoint before every refund. Verified in production the same day: a refund through the agent was evaluated under 1.1.0's rules.
- The version is read from the latest approval record without verifying it; the same request then verifies that record's signature and content hash (2.35, 2.36), so a record changed outside the API refuses the request.

Verification

- `packages/api/tests/unit/GovernedPolicyVersion.test.ts` (5, through `RuntimeBuilder` with governance enforced): no approval refuses; an approved 1.0.0 runs; approving 1.1.0 makes it current and refuses 1.0.0; approving 1.0.0 again rolls back; a failed lookup refuses. Without the version source, 2 of the 5 fail.
- `packages/capability-registry/tests/unit/CapabilityPolicyBinder.test.ts` (15), `packages/api/tests/unit/bootstrap/create-current-policy-version-source.test.ts` (10), `packages/storage/tests/unit/policy-change-approval-record-most-recent-for-name.test.ts` (2).

Evidence

- `packages/capability-registry/src/CapabilityPolicyBinding.ts` (`CurrentPolicyVersionSource`, async `CapabilityPolicyBinder`)
- `packages/api/src/governance/GovernedPolicyVersionSource.ts`, `packages/api/src/bootstrap/createCurrentPolicyVersionSource.ts`, `packages/api/src/application.ts`
- `packages/runtime/src/RuntimeBuilder.ts` (`withCurrentPolicyVersions`), `RuntimeFactory.ts`, `RuntimeEngine.ts`
- `packages/shared/src/repositories/policy-change-approval-record-repository.ts` (`findMostRecentForName`), `packages/storage/src/memory/` and `supabase/` implementations
- `docs/VERIFICATION-GAPS.md` G-66

---

## 2.44 A Manipulated Agent Cannot Authorize a Refund, a Merge, a Slack Post to Another Channel or an LLM Tool Call by Declaring Facts (Scoped, 2026-09-28)

An AI agent can be manipulated by content it reads (prompt injection) into sending anything Parmana accepts. A fact the agent declares in `signals` and nothing checks is only as true as the agent says (G-51). This section records what stops such an agent, per action, after the 2026-09-28 AI attack review (`docs/VERIFICATION-GAPS.md`, "Gaps opened in the 2026-09-28 AI attack review").

**Pull request merges (`github:pr-merge`, G-73).** `github-pr-approval` 1.1.0 approves a merge only when `mergeApproved` is true, and `mergeApproved` is declared in `approvalSignals` with `resourceId: "target"`, so `ApprovalSignalVerifier` (2.42) counts it as true only with a signed approval from a trusted approver for that exact pull request (`owner/repo#number`), for `github:pr-merge`, not expired, used once. The review, status check, branch protection and risk facts are still caller declared; they can refuse a merge and cannot authorize one on their own. Reading a pull request (`github:pr-fetch`) is now bound to its own policy, `github-pr-read` 1.0.0, which approves a read with no caller declared facts, so reads need no approval. **Update (2026-09-30, 2.47):** reads need a signed approval too; `github:pr-fetch` is bound to `github-pr-read` 1.1.0.

**Refunds (`paytm:refund`, G-75).** `customer-refund` 1.1.0 authorizes a refund up to 10000 when the caller declares `refundEligible` and `fraudCheckPassed` true, and nothing checks either. 1.2.0 approves a refund only with `managerApproved` true, which needs a signed approval for that order covering that amount (unchanged declaration from 1.1.0), refuses 0 or less (1.1.0 approved a refund of 0 or a negative amount on the same claims), and refuses above 100000. The binding table names 1.2.0.

**Slack posts (`slack:post-message`, G-76).** **Update (2026-09-30, 2.47):** `slack-post-message` 1.1.0 also needs a signed approval for the channel. The caller's `channelAuthorized` is not trusted. `SlackChannelSignalVerifier` refuses a post unless the channel the message goes to (`parameters.channel`) equals the Intent's `target` and is in the server's `SLACK_ALLOWED_CHANNEL_IDS`, before authorization and again at release, and `GatewaySlackAdapter` refuses a channel that is not the target. Unset refuses every post. This is a code change, effective on deploy. `contentApproved` is still caller declared: an approved post carries whatever text the agent writes, but only to a listed channel.

**LLM tool calls (`llm-tool-call`, G-74).** `llm-tool-call` 1.1.0 approves only when `humanApproval` is true, declared in `approvalSignals` with `resourceId: "target"` (the tool), so it needs a signed approval for that tool. The tool, resource, environment and risk facts can refuse a call and cannot authorize one on their own.

A test checks the structure, not only examples: in each of these policies every approve rule requires the approval backed fact to be true, and every caller declared fact at its most permissive value, without the approval, is refused.

**Refusal reasons (G-77).** Reasons stay specific; the policy files are public and a caller can read its own Refusal Record, so hiding them would not help. Instead, `connector-policies-not-self-authorizing.test.ts` requires that for every capability bound in `CANONICAL_CAPABILITY_POLICY_BINDINGS` that changes something, every approve rule needs, on every path, a fact declared in `approvalSignals` or a fact a server verifier checks for that capability. So no refusal reason can teach an agent a flag that unlocks a write. A new capability fails the test until it is classified as a read or a write.

Scope, stated plainly:

- **Approved in production on 2026-09-28.** Production runs the version most recently approved through maker checker (2.43). `customer-refund` 1.2.0, `github-pr-approval` 1.1.0 (17:30:00 UTC), `github-pr-read` 1.0.0 (17:30:18 UTC) and `llm-tool-call` 1.1.0 (17:30:53 UTC) were approved by `reviewer-charak1987` after being proposed by `charak1987`, two credentials held by one person (2.43). Before that, the refund exposure was live in production, where the Paytm connector is configured. Any trusted approver can sign for any action (approvers are not limited to an action, G-50), so `manager-charak1987` can sign merge approvals.
- **Every refund needs a person.** This is a product change: refunds up to 10000 no longer run without a manager. Automatic refunds come back only with an independent eligibility and fraud check the server itself reads (a `SignalStateVerifier`), which does not exist yet. The self hosted quickstart adopts 1.2.0 and shows a small refund refused; the offline check stays on 1.1.0, since proving an authorized refund there would need a trusted approver key in the image. `github-pr-read` 1.0.0 must be approved before `github:pr-fetch` works again in production after this change is deployed: with no approved version, reads are refused (fails closed).
- **Whether the GitHub connector is configured in production was not checked** on 2026-09-28 (the available Vercel token could not read the project's variables).
- **`llm-tool-call` is not bound to an action.** No connector runs an LLM tool call, so on the hosted API an approved `llm-tool-call` decision executes nothing. Older versions are retired instead: once 1.1.0 is approved, 1.0.0 is refused as superseded whatever action names it (below).
- GitHub's own branch protection remains a separate control. Parmana does not read review or check state from GitHub.
- **Superseded versions are refused, for every policy (G-74, 2026-09-28).** `PolicyGovernanceExecutionVerifier` refuses any version other than the one most recently approved for its name, before authorization and at release, so an older approved version with weaker rules cannot be named instead. This extends 2.43 from connector actions to all policies. Approving an older version again rolls back.
- Approvers are the ones listed in `TRUSTED_APPROVAL_ISSUERS`; today that is one approver held by the operator (2.42).

Verification

- `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts` (19, including `customer-refund` 1.2.0) and `CustomerRefundPolicy120.test.ts` (11): validity, the approval declaration, every approve rule requires the approval fact, the most permissive caller facts are refused without it, approved with it, a failing caller fact still refuses; `github-pr-read` approves a read.
- `packages/api/tests/integration/github-pr-merge.integration.test.ts` (8, through `POST /execute` and the production bootstrap): a merge with a signed approval lands once on the mock GitHub server; every caller fact true with no approval, and `mergeApproved: true` with no approval, are refused with zero GitHub calls; an approval for another pull request is refused; an approval is used once.
- `packages/api/tests/integration/github-caller-scoping.integration.test.ts` (4): a fetch under `github-pr-read`, a merge with an approval.
- `packages/api/tests/integration/paytm-refund.integration.test.ts` (18, moved to 1.2.0): a small refund with every caller fact true and no approval is refused with zero connector calls, with `managerApproved` false and true; a refund of 0 with an approval is refused; a small refund with an approval executes once; declaring 1.1.0 is refused, naming 1.2.0.
- `packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts` (6): the four write capabilities pass at the bound versions; the check flags `customer-refund` 1.1.0 and `github-pr-approval` 1.0.0; every bound capability is classified.
- `packages/api/tests/integration/slack-post-message.integration.test.ts` (4) and `packages/api/tests/unit/bootstrap/create-slack-channel-signal-verifier.test.ts` (7): only a listed channel that is the target receives a post; an unset list refuses every post.
- Tutorial 96 (`examples/tutorials/96-github-pr-merge-connector`) shows the refusal and the approved merge through the production composition. Tutorials 111 and 119 use 1.2.0. Tutorial 112 refuses a channel off the list.

Evidence

- `policies/github-pr-approval/1.1.0/policy.json`, `policies/github-pr-read/1.0.0/policy.json`, `policies/llm-tool-call/1.1.0/policy.json`, `policies/customer-refund/1.2.0/policy.json`
- `packages/capability-registry/src/CapabilityPolicyBinding.ts` (`github:pr-fetch` to `github-pr-read`, `github:pr-merge` to `github-pr-approval` 1.1.0)
- `packages/api/src/application.ts` (`createApplication` takes an optional `approvalVerifier`, defaulting to the production one; the composite verifier includes the Slack channel check)
- `packages/api/src/bootstrap/createSlackChannelSignalVerifier.ts`, `packages/execution-gateway/src/connector-execution/GatewaySlackAdapter.ts`

---

# 3. Conditional Claims

The following claims are true only under an explicitly stated scope. The scope clause is load-bearing: removing it makes the claim false.

---

## 3.1 Non-Bypassable Envelope Verification (Scoped)

For any system running the Parmana envelope verifier, execution requests not authorized by Parmana are cryptographically impossible to accept.

This claim holds only for a receiving system that (a) runs @parmana/envelope-verifier and (b) gates every execution-triggering code path behind its verification result. Parmana enforces nothing at the network level. A receiving system that does not call the verifier, or that calls it but does not act on a failing result, is not covered by this claim.

**Update (2026-10-03):** the claim also assumes Parmana's authorization signing key is not compromised. Whoever holds that key, or can make the signing service sign (under AWS KMS, a process with `kms:Sign` on it), can produce authorizations the verifier accepts. "Not authorized by Parmana" means not signed with that key; it does not mean not approved by policy. See the attacker table in `docs/site/evaluation/audit-guide.mdx`.

Evidence

- @parmana/envelope-verifier (EnvelopeVerifier.verify, requireParmanaAuthorization)

---

## 3.2 Fleet-Wide Single-Use Requires a Shared NonceStore

Single-use enforcement of an authorization's nonce is scoped to whichever NonceStore instance performs the check. If multiple independent receiving systems, or multiple instances of the same system, each use their own NonceStore, the same authorization can be accepted once per instance. Fleet-wide single-use requires every instance to share one persistent NonceStore that survives a process restart, not a per-process, in-memory one.

Parmana's own production gateway does this by default. `packages/api/src/bootstrap/createNonceStore.ts` wires in `SupabaseNonceStore` (`packages/storage/src/supabase/SupabaseNonceStore.ts`), a durable, Postgres-backed NonceStore shared across every process pointed at the same Supabase project, and fails closed at startup if it is not configured, rather than silently falling back to a per-process `MemoryNonceStore`. A receiving system that does not share a persistent NonceStore (whether by choice, misconfiguration, or because it is not Parmana's own gateway) still has its exposure window bounded by the envelope's short TTL, not unlimited. This is the general, deployment-agnostic version of the claim, and still the correct one for any `@parmana/envelope-verifier` integrator supplying their own NonceStore choice; `MemoryNonceStore` remains available and correct for tests.

Evidence

- NonceStore / MemoryNonceStore / SupabaseNonceStore

- packages/api/src/bootstrap/createNonceStore.ts (production wiring; fails closed when Supabase is not configured, never falls back to in-memory)

- packages/storage/tests/integration/supabase-nonce-store.integration.test.ts: "a nonce consumed through one store instance is still consumed by a fresh instance against the same backing" (the fleet-sharing / restart-survival proof) and "two simultaneous checkAndRecord calls for the same nonce: exactly one succeeds" (a real concurrent-INSERT race against Postgres, not a simulated one)

- packages/envelope-verifier/README.md ("Claims", "PRODUCTION WARNING: MemoryNonceStore")

---

## 3.3 Connector SDK Foundation (Scoped)

@parmana/connector-sdk defines a Connector authoring contract (Connector, ConnectorRequest, ConnectorResponse, ConnectorExecutionContext, ConnectorCapability, ConnectorMetadata, ConnectorVersion, ConnectorHealth, ConnectorFactory) and extends execution-control's ConnectorRegistry, CredentialVault, and ConnectorPolicy seams without modifying them. This claim covers only the foundation: two reference connectors (HttpConnector, MockConnector), a credential-provider seam (StaticCredentialProvider, EnvironmentCredentialProvider), and deterministic connector evidence attached to the existing Execution Trust Record via the existing, unmodified ExecutionEvidence.attributes path and the existing TrustRecordHasher. It does not claim any enterprise-specific connector, any cloud secret-manager integration, or any change to Phase 1's Runtime, Policy Engine, Execution Gateway, Replay, Receipt Generation, Verification, or REST API; all of which remain exactly as evidenced elsewhere in this document.

Evidence

- packages/connector-sdk/src (Connector, CredentialProvider, MockConnector) — ConnectorRegistry itself is not defined here; it lives at packages/execution-control/src/ConnectorRegistry.ts, extended (not duplicated) by connector-sdk, per the seam described above

- packages/connector-sdk/tests/unit (4 files, 32 tests: registry, credential-provider leak checks, MockConnector, reference-policy evaluation)

- policies/connector-capability/1.0.0/policy.json (reference policy: ALLOW crm:read, BLOCK crm:delete, threshold-gated payments:refund, default BLOCK, no approval-workflow outcome)

**Update (2026-08-24 documentation-currency pass):** `HttpConnector`, `SdkConnectorExecutor`, and `CapabilityConnectorPolicy` no longer live in `packages/connector-sdk/src` — all three moved to `packages/execution-gateway` during the Phase 1C execution-ownership refactor (the same refactor §3.10's own "Update (execution-ownership refactor, Phase 1C)" paragraph documents for the HubSpot connector; this section was never given the equivalent update at the time). Current locations: `packages/execution-gateway/src/HttpConnector.ts`, `packages/execution-gateway/src/connector-execution/SdkConnectorExecutor.ts`, `packages/execution-gateway/src/connector-runtime/CapabilityConnectorPolicy.ts`. The previously-cited "45 tests" count was also stale — `packages/connector-sdk/tests/unit` now holds 4 files / 32 tests (re-run and confirmed); the HttpConnector-timeout, end-to-end Gateway integration, and Trust Record hash-boundary regression tests this section originally described moved to `packages/execution-gateway/tests` along with the classes they exercise.

---

## 3.8 Deployed Environment: Full Chain via a Permanent Public Endpoint (Scoped) — Historical: Razorpay connector removed 2026-08-12

**This claim was true and independently verifiable when written (2026-07-19, commit `7d27e63`).** The Razorpay connector it documents was deliberately removed from this codebase on 2026-08-12 (see the removal commit). This section is retained as the permanent historical record of what was demonstrated — it is not a claim about current capability, and nothing below should be read as describing present-tense behavior. Parmana does not run a Razorpay connector today. The dated, external record of this proof is `docs/site/trust-and-claims/trl7-verification.mdx` (2026-08-01 verification session) and `docs/site/changelog.mdx`.

Closes the last gap 3.7 (now removed; see this claim's own history in `docs/site/changelog.mdx`) left open: a real Razorpay-initiated webhook delivery had previously been proven only against a temporary `cloudflared` tunnel run locally, with no standing infrastructure. This claim proved the identical full chain — a real refund, a real Razorpay-initiated webhook, signature-verified, correlated, and closed into a signed Settlement Confirmation — against Parmana's actual deployed instance, reachable at a permanent public URL, continuously running, not a one-time local exercise.

**Deployment**: `parmana-api`, a single Docker image (see `docs/site/deployment/production.mdx`), running on Fly.io across two machines in the `lhr` region (`fly.toml` declares `primary_region = 'bom'`; the actually running machines are `lhr` — this claim states the observed region, not the configured one). Durable storage (`PARMANA_STORAGE=supabase`) and the webhook/settlement event stores are Supabase-backed, shared across both machines. The API requires caller authentication at every route except `/health`, `/ready`, `/openapi.yaml`, `/documentation`, `POST /refusal/verify`, and `POST /audit/verify` (2.16): an unauthenticated `POST /execute` was observed returning `401` with `WWW-Authenticate: Bearer realm="Parmana"`, never falling open.

`POST /webhooks/razorpay` is registered permanently — not through a tunnel — at `https://parmana-api.fly.dev/webhooks/razorpay`, in the Razorpay Dashboard's Test Mode, for `refund.processed` and `refund.failed`.

**Procedure**: one authenticated, gated 100-paise refund was created through the full production `POST /execute` chain against the same manually captured test-mode payment 3.4/3.7 use, executed against the deployed instance. Razorpay created the refund (id redacted `rfnd_**********T9Cj`) and, independently, delivered a genuine `refund.processed` webhook to the permanent endpoint above. The deployed instance's webhook route verified its signature against the rotated `RAZORPAY_WEBHOOK_SECRET`, persisted the event, and the deployed settlement poll loop (`scripts/process-razorpay-settlements.ts`, `pollIntervalMs: 15000`) drained it: fetch-verified the refund's real status directly from Razorpay, and appended a signed `SETTLED` Settlement Confirmation (`confirmationId dcb06247-6e7a-4adf-b709-5da407f0b054`, `fetchedRefundStatus: "processed"`) to the Execution Trust Record, surfaced correctly on `GET /verification/{businessTransactionId}`. Elapsed time from `POST /execute` to the signed `SETTLED` confirmation: approximately 48 seconds.

Correlation is proven by construction, not just observation: `RazorpaySettlementProcessor` never queries Razorpay for refunds on its own — `runOnce()` only drains events already sitting in the durable webhook event store, and the only code path that ever writes to that store is the webhook route, only after signature verification succeeds. Since the business transaction id driving this refund was freshly generated for this exercise, a matching event could only have entered the store via a genuinely delivered, correctly signed webhook POST from Razorpay to the permanent endpoint above.

This claim is scoped narrowly: one real delivery, test mode only, against a permanent endpoint. It does not claim live-mode operation, load-bearing traffic, or high availability — the deployment runs two machines for redundancy, not for capacity or failover behavior that has been tested. [FUTURE] live-mode operation remains open (see 3.4/Future Claims).

Evidence

- `fly.toml`, `Dockerfile`, `docker/entrypoint.sh` (deployment shape)

- `packages/api/src/routes/ready.ts` (readiness probe distinguishing Supabase-backed storage from in-memory)

- `packages/api/src/middleware/caller-auth.ts` (401 + `WWW-Authenticate` on missing credential, observed live against the deployed instance)

- `scripts/process-razorpay-settlements.ts` (the deployed settlement poll loop; `RAZORPAY_SETTLEMENT_POLL_INTERVAL_MS`) — **deleted 2026-08-12** along with the rest of the Razorpay connector; cited here as an accurate historical record of what this file did while it existed, not as a currently-resolvable path

- Live smoke test performed against `https://parmana-api.fly.dev` this session: unauthenticated `POST /execute` → `401`; one authenticated 100-paise refund via `POST /execute`; `GET /verification/{businessTransactionId}` polled until `settlement.status: "SETTLED"` (confirmationId `dcb06247-6e7a-4adf-b709-5da407f0b054`, `fetchedRefundStatus: "processed"`, refund id redacted `rfnd_**********T9Cj`)

---

## 3.9 Deployed Environment: Live-Mode Full Chain (Scoped) — Historical: Razorpay connector removed 2026-08-12

**This claim was true and independently verifiable when written (2026-07-20, commit `57558d6`).** The Razorpay connector it documents was deliberately removed from this codebase on 2026-08-12. Retained as historical record only — not a current-capability claim. See `docs/site/trust-and-claims/trl7-verification.mdx` and `docs/site/changelog.mdx` for the permanent dated record.

Closes the gap 3.8 (and the now-removed 3.4) left open: every live claim before this one was against Razorpay's test-mode API only. This claim proved the identical full chain — a real refund, a real Razorpay-initiated webhook, signature-verified, correlated, and closed into a signed Settlement Confirmation — in Razorpay **Live Mode**, against a second, separately deployed instance.

**Deployment**: `parmana-api-live`, the same Docker image (see `docs/site/deployment/production.mdx`), running on Fly.io in the `sin` region (`fly.live.toml` declares `primary_region = 'sin'`; the actually running machines are also `sin` — no region mismatch this time, unlike 3.8's `parmana-api`). Durable storage (`PARMANA_STORAGE=supabase`) and the webhook/settlement event stores are Supabase-backed, shared across both machines. `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are a live-mode (`rzp_live_`) key pair, distinct from every other credential used elsewhere in this document. Caller authentication is enforced identically to 3.8: an unauthenticated `POST /execute` was observed returning `401` with `WWW-Authenticate: Bearer realm="Parmana"` against this deployment specifically.

`POST /webhooks/razorpay` is registered permanently at `https://parmana-api-live.fly.dev/webhooks/razorpay`, in the Razorpay Dashboard's **Live Mode** specifically (not Test Mode — see 3.7/3.8 for the debugging cost of getting this wrong), for `refund.processed` and `refund.failed`.

**Procedure**: a real ₹10.00 Payment Link was created and paid with a real card, live, through Razorpay-hosted checkout. One authenticated, policy-gated 100-paise refund was then created through the full production `POST /execute` chain against that payment (`pay_` id redacted below). Razorpay created the refund (id redacted `rfnd_**********WnNG`) and, independently, delivered a genuine `refund.processed` webhook to the permanent endpoint above. The deployed instance's webhook route verified its signature, persisted the event, and the deployed settlement poll loop drained it: fetch-verified the refund's real status directly from Razorpay, and appended a signed `SETTLED` Settlement Confirmation (`confirmationId 6a334df8-190d-4835-9050-b54e6657e05f`, `fetchedRefundStatus: "processed"`), surfaced correctly on `GET /verification/{businessTransactionId}`. Elapsed time from `POST /execute` to the signed `SETTLED` confirmation: approximately 43 seconds.

Correlation is proven by construction, for the same reason 3.8 states: the settlement processor never queries Razorpay on its own initiative — `runOnce()` only drains events already sitting in the durable webhook event store, and the only writer to that store is the webhook route, only after signature verification succeeds. The `businessTransactionId` driving this refund was freshly generated for this exercise, so a matching event could only have entered the store via a genuinely delivered, correctly signed Live Mode webhook POST from Razorpay.

This claim is scoped narrowly and deliberately: **one** real-money refund (₹1.00 / 100 paise), one deployed instance, one live-mode webhook delivery. It does not claim volume, sustained load, high availability, or tested failover behavior — `parmana-api-live` runs the same two-machine shape as `parmana-api` for redundancy, not capacity or failover that has been exercised. It does not claim Razorpay payout creation (RazorpayX remains a distinct, unimplemented item — see Future Claims), and it does not claim any change to Phase 1's Runtime, Policy Engine, Execution Gateway, Replay, Receipt Generation, Verification, or REST API.

Evidence

- `fly.live.toml` (app `parmana-api-live`, `primary_region = 'sin'`) — **deleted 2026-08-12** along with the rest of the Razorpay connector; cited here as an accurate historical record, not as a currently-resolvable path

- `packages/api/src/middleware/caller-auth.ts` (401 + `WWW-Authenticate` on missing credential, observed live against this deployment)

- Live execution performed against `https://parmana-api-live.fly.dev` this session: unauthenticated `POST /execute` → `401`; a real ₹10 Payment Link paid live with a real card; one authenticated 100-paise refund via `POST /execute` against that payment; `GET /verification/{businessTransactionId}` polled until `settlement.status: "SETTLED"` (confirmationId `6a334df8-190d-4835-9050-b54e6657e05f`, `fetchedRefundStatus: "processed"`, refund id redacted `rfnd_**********WnNG`)

---

## 3.10 HubSpot Deal Stage/Amount Update Connector (Scoped)

`@parmana/connector-hubspot` is a new, standalone workspace package (not a subdirectory of `@parmana/connector-sdk`, unlike Salesforce/SAP/Oracle/Workday) that depends on `@parmana/connector-sdk`'s `Connector` authoring contract the same way those connectors do. (Razorpay was also a `@parmana/connector-sdk` subdirectory at the time this was written; that subdirectory no longer exists, deleted along with the rest of the Razorpay connector on 2026-08-12.) It authorizes exactly one HubSpot CRM Objects API action this milestone: updating a Deal's `dealstage` property, optionally alongside `amount` in the same `PATCH /crm/v3/objects/deals/{dealId}` call. This claim covers dealstage/amount update on Deals only. Contacts, Companies, deleting or archiving deals, any HubSpot webhook/event-driven trigger, and multi-object transactions are all explicitly out of scope this milestone (see Future Claims).

`HubSpotConnector`, as originally shipped (`packages/connector-hubspot/src/HubSpotConnector.ts`; see the Phase 1C update below for where this logic lives today), is deny-by-default at the property level, not just the object-type level: a `hubspot:deal-update` request naming any property other than `dealstage`/`amount` is refused before any network call, rather than silently dropped — silently dropping an unsupported property could mask a caller's real intent behind an update that quietly did less than requested. `HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES` (`HubSpotTypes.ts`) is the single source of truth both the connector's guard and its PATCH-body construction read from.

Learning directly from this codebase's own Razorpay incidents, both fixes are structural in this connector's first version rather than retrofitted after the fact:

- **Placeholder-credential guard, from day one.** `RazorpayConnector` originally had no guard against sending its built-in test-mode placeholder credential to Razorpay's real production API — it survived only because Razorpay happened to reject an unrecognized key, an accident of Razorpay's behavior, not a guarantee this codebase controlled (see 3.4's "defense-in-depth fix" paragraph, added only after the gap was noticed). `HubSpotConnector` refuses, before any network call, to send `HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN` to HubSpot's real API (`https://api.hubapi.com`) unless `baseUrl` is explicitly overridden to a mock server — the same shape of guard, present from this connector's very first version, not added after an incident.

**Update (execution-ownership refactor, Phase 1C):** `HubSpotConnector`'s executable class -- including the property allowlist guard and the placeholder-credential guard both described above -- was migrated verbatim to `GatewayHubSpotAdapter` (`packages/execution-gateway/src/connector-execution/GatewayHubSpotAdapter.ts`), mirroring 3.4's identical Razorpay migration exactly (same commit, same "migrated verbatim... only the executable class moved" pattern). `HubSpotDealUpdateService` and `HubSpotDealUpdateHarness` no longer exist anywhere in the repository; capability identifiers and DTOs (`HubSpotCapabilities.ts`, `HubSpotTypes.ts`) stayed in `@parmana/connector-hubspot` and are imported into the adapter. `MockHubSpotServer.ts` is unchanged at its original path.

- **No bridge variable, from day one.** `createRazorpayCredentialProvider.ts`'s `NODE_ENV=test` branch originally read a word-order-swapped bridge variable (`TEST_RAZORPAY_KEY_ID`/`SECRET` instead of the documented `RAZORPAY_TEST_KEY_ID`/`SECRET`), fixed only after the fact (this document's own "fix: distinguish policy denial..." and credential-provider commits). `createHubSpotCredentialProvider.ts` reads `TEST_HUBSPOT_PRIVATE_APP_TOKEN` directly — the exact name documented in `.env.example` — with no intermediate variable to drift out of sync. Production reads `HUBSPOT_PRIVATE_APP_TOKEN`; if unset outside test mode, `createHubSpotCredentialProvider()` returns `undefined` and `createConnectorRegistry.ts` does not register the HubSpot connector at all, so `hubspot:deal-fetch`/`hubspot:deal-update` simply have no connector to resolve to (`ConnectorSdkRegistry`'s existing "No connector registered for capability" fail-closed error) — the same fail-closed absence behavior as `RAZORPAY_KEY_ID`/`SECRET`, not a startup crash or a fallback to mock credentials.

`MockHubSpotServer` (`packages/connector-hubspot/src/MockHubSpotServer.ts`) is a hermetic, in-memory stand-in for the Deals subset of the CRM Objects API (`GET`/`PATCH /crm/v3/objects/deals/:id`) used by every default test run; it never makes or receives real network traffic beyond localhost.

**Policy** (`policies/hubspot-deal-update/1.0.0/policy.json`, evaluated by the same unmodified `PolicyEngine`): a proposed `dealstage` transition is checked against `isHubSpotStageTransitionAllowed` (`HubSpotDealUpdateSignals.ts`) — forward-only through a fixed default stage order (`HUBSPOT_DEFAULT_STAGE_ORDER`), plus a fixed allowance to move to `closedlost` from any non-terminal stage; any transition out of a terminal stage (`closedwon`/`closedlost`), any backward move, and any move to or from a stage id not in the configured order are all denied. An `amount` change whose absolute delta from the deal's current amount exceeds `HUBSPOT_DEFAULT_AMOUNT_CHANGE_THRESHOLD` (10,000, in the deal's own currency units) is denied unless the caller declares `preAuthorizedForAmountChange: true`. `boundSignals` (`proposedDealStage` → `parameters.dealstage`, `proposedAmount` → `parameters.amount`) is present from this policy's first version — the same `SignalIntentBinder` hardening 3.4 added to `razorpay-refund/1.0.0/policy.json` only after a live demonstration of the amount-mismatch vector (see 3.4's "adversarial-testing hardening session" update) is applied here proactively, before any equivalent gap could be demonstrated.

**Two open decisions this milestone deliberately does not resolve, flagged here rather than silently picked:**

1. **Per-pipeline vs. global stage-transition rules.** `HUBSPOT_DEFAULT_STAGE_ORDER` is one global, hardcoded stage order, not configured per-pipeline. A HubSpot account with multiple pipelines (each with its own stage ids and ordering) is not represented — a `proposedDealStage` that happens to share a stage id with this default order is evaluated against it regardless of which pipeline the deal actually belongs to, and a deal in a genuinely different pipeline with differently-ordered or differently-named stages is not correctly modeled at all. `isHubSpotStageTransitionAllowed` accepts a `stageOrder` parameter and `buildHubSpotDealUpdateSignals`/`HubSpotDealUpdateService` thread it through, so per-pipeline configuration is a real, already-seamed extension point — it is just not wired up to anything pipeline-aware this milestone.
2. **One authorization check vs. two.** `dealstage` and `amount` are evaluated by a single policy pack under a single capability (`hubspot:deal-update`) and a single signed authorization, whether the request changes one property or both — not two independently revocable authorization scopes. This mirrors HubSpot's own API shape (`PATCH` already accepts both properties in one call) and keeps this milestone's authorization surface no larger than the underlying HTTP action, but it means an operator cannot grant "amount changes only" without also granting "dealstage changes," or vice versa, without introducing a second capability. Splitting into `hubspot:deal-update-stage` / `hubspot:deal-update-amount` (each independently authorizable, each requiring its own signed authorization even when a caller wants to change both in what HubSpot would still execute as one PATCH) remains unresolved future work.

A third, narrower point this milestone originally left unresolved: `preAuthorizedForAmountChange` was, at the time, a caller-declared boolean signal with no independent verification. Absent, it defaults to `false` — the safe default: an over-threshold amount change is denied unless a caller declares it pre-authorized.

**Update (TD-23, Phase 3C, now closed):** `preAuthorizedForAmountChange` is no longer trusted verbatim. `HubSpotSignalStateVerifier` (`packages/connector-hubspot/src/HubSpotSignalStateVerifier.ts`), constructed with a real `ApprovalVerifier` (`@parmana/approval`) unconditionally in `packages/api/src/bootstrap/createHubSpotSignalStateVerifier.ts` (that file's own comment: "approvalVerifier is always supplied here (never omitted) -- the production wiring path is where independent verification... becomes a structural invariant rather than an optional, caller-declared signal"), verifies a caller's `preAuthorizedForAmountChange: true` claim against a real, independently-issued, Ed25519-signed Approval Artifact (`SignedApproval`, the Phase 3A approval artifact design, in git history) carried in `signals.approvalArtifact` -- checking issuer identity against a registry, signature validity, expiry, capability/resource scope match, and single-use nonce consumption (`ApprovalVerifier.verify`, `packages/approval/src/ApprovalVerifier.ts`), all before the declared value is trusted. A missing, expired, wrong-scope, replayed, or unsigned artifact is treated as `preAuthorizedForAmountChange: false` regardless of what the caller declared. This closes the gap the Phase 2L authorization exceptions record (in git history) independently re-confirmed still open as of that phase.

**Update (2026-09-28, checked in code):** the list is no longer empty. It holds one entry, `manager-charak1987` (key `manager-charak1987-key-1`), added by commit `8c48ad9` for refund approvals; the paragraph below describes the state before that.

**Operational scope, independently confirmed by Phase 3D:** `createApprovalIssuerRegistry.ts`'s `TRUSTED_APPROVAL_ISSUERS` list shipped **empty by default** — no real business-approver key is provisioned in this deployment. This is the correct fail-closed starting state (every `preAuthorizedForAmountChange` claim is rejected, genuine artifact or not, until an operator adds a real entry and deploys), not a gap in the mechanism above, but it means no over-threshold `hubspot:deal-update` amount change can be legitimately approved in the current deployment as configured — only ever denied. The verification mechanism itself is proven correct by unit and integration test against synthetic issuers (below); it has not yet been exercised against a real, operator-provisioned issuer key in production. See §4.2 and §12.3 of the Phase 3D independent authorization certification (in git history).

**Test posture, in the order specified for this milestone:**

- **Hermetic first, as originally shipped.** `packages/connector-hubspot/tests/unit/` (42 tests, all passing, no network calls beyond localhost): `hubspot-connector.test.ts` (12 — fetch, dealstage-only update, combined dealstage+amount update, deny-by-default property guard before any network call, empty-update rejection, non-2xx/timeout fail-closed, bad-credential-shape rejection, token never leaked into a thrown error or response metadata, placeholder-credential guard against the real endpoint and its mock-server exemption); `hubspot-deal-update-policy.test.ts` (9 — schema validation and every rule branch, including that no rule ever produces `require_override`); `hubspot-deal-update-signals.test.ts` (12 — `isHubSpotStageTransitionAllowed`'s forward/backward/terminal/unrecognized-stage cases, `buildHubSpotDealUpdateSignals`'s delta/threshold arithmetic and boundSignals-safe omission of absent fields); `hubspot-deal-update-harness.test.ts` (9 — the full authorize → verify → execute → confirm chain against `MockHubSpotServer` for approved dealstage-only, combined, and pre-authorized-over-threshold-amount cases; policy replay with no second HTTP call; token isolation from the receipt; `businessTransactionHash` tamper rejection). **Current location, after the Phase 1C migration and TD-23 (see updates above):** `hubspot-connector.test.ts` moved to `packages/execution-gateway/tests/unit/` (12 tests, unchanged); `hubspot-deal-update-harness.test.ts` no longer exists (`HubSpotDealUpdateHarness` was deleted, not migrated); a new `HubSpotSignalStateVerifier.test.ts` (10 tests) covers the TD-23 Approval Artifact verification instead. **Update (independent claims audit, 2026-08-19):** `packages/execution-gateway/tests/unit/credential-non-exposure.test.ts` (2 tests, new) closes the one credential-isolation property that had not previously been asserted by a dedicated test — that a resolved credential is never retained as `GatewayHubSpotAdapter` instance state between calls, rather than merely being true by inspection of the constructor. Every other credential-isolation property this audit checked (redaction to a one-way fingerprint, error-message isolation, response-metadata safety, zero API calls on policy denial) already had real, passing coverage below; this file was added, not to re-prove them, but to close the one genuine gap. Current total: 45 unit tests across the two packages, all passing.
- **Policy-denial-makes-zero-calls.** Proven at two layers. At the connector-execution layer (`packages/execution-gateway/tests/unit/hubspot-connector.test.ts`, following the Phase 1C migration above), a denied stage transition or over-threshold amount change makes zero `PATCH` calls, asserted by reading the deal directly off `MockHubSpotServer` afterward and confirming it is byte-for-byte unchanged — the same assertion style Razorpay's own policy-denial cases use. At the HTTP boundary (`packages/api/tests/integration/hubspot-deal-update.integration.test.ts`, 6 tests, all passing — count corrected 2026-08-24, previously cited as 3), a policy `REJECTED` decision reached through the real, production-wired `POST /execute` — the same generic caller-supplied-signals mechanism the now-deleted `razorpay-refund.integration.test.ts`'s own denial test once exercised — is caught in `ExecutionGate.enforce` before `ExecutionComponent` ever dispatches to the connector: `response.status === 403`, `response.body.code === "POLICY_DENIED"`, and (strengthening beyond Razorpay's own precedent, which only checks the mock server's resulting state) a `fetch` spy asserting literally zero calls reached the mock server's base URL at all, for both a disallowed stage transition and an over-threshold amount change.
- **Gated live suite second — now run live, not merely confirmed to skip.** `packages/api/tests/integration/hubspot-live.integration.test.ts` (3 tests), gated behind `ALLOW_LIVE_HUBSPOT=1` + `TEST_HUBSPOT_PRIVATE_APP_TOKEN` (must start with `pat-`, checked before any network call — mirroring `RAZORPAY_TEST_KEY_ID`'s `rzp_test_` check) + `TEST_HUBSPOT_DEAL_ID` for the third, mutating case, skipped by default so this stays opt-in rather than default `npm test` behavior. An earlier session confirmed only that the suite skips cleanly with no credentials configured; this session ran it live, to completion, against a real HubSpot developer/test account, all **3/3 passing**:

  1. `hubspot:deal-fetch` against a deliberately non-existent deal id (`999999999999`), driven through the full production `POST /execute` chain, reached a real, distinguishable `4xx` HTTP response from `api.hubapi.com` — a genuine round trip, not a network failure (reachability only, mirroring `razorpay-live.integration.test.ts`'s non-existent-payment-id cases). One real call observed against `https://api.hubapi.com/crm/v3/objects/deals/999999999999...`, status ≥ 400.
  2. A policy denial (disallowed dealstage transition, `closedlost` → `qualifiedtobuy`) through the same `POST /execute` path returned `403`/`POLICY_DENIED`, and a `fetch` spy confirmed literally zero calls reached `api.hubapi.com` for the denial — `ExecutionGate.enforce` rejects before `ExecutionComponent` ever dispatches to the connector.
  3. Against the real test deal (`TEST_HUBSPOT_DEAL_ID`, redacted `********0850`): the deal's live `amount` was read via `hubspot:deal-fetch`, nudged by a fixed, small, within-threshold delta of 1 (currency unit) through `hubspot:deal-update` via `POST /execute`, confirmed changed by an independent live `GET` (a test-side oracle bypassing the connector, mirroring `razorpay-live.integration.test.ts`'s `fetchRefundsLive`), then reverted to its original value through a second `POST /execute` call and confirmed reverted by the same independent oracle. The exact real amount value is deliberately not recorded here (this document is not the place to disclose a real CRM record's business data); the assertion that matters — original value read, changed, then restored to the exact original value — passed. Non-destructive by construction, unlike Razorpay's refund (irreversible; its captured payment's remainder depletes by 100 paise per live run), so this case is safe to run repeatedly against the same test deal, and left the deal in the same state it found it.

  One bug was caught and fixed by this live run that the hermetic and HTTP-boundary suites had not caught: the mutating case's test fixture initially omitted the `proposedAmount` signal (only `amountDeltaAbs`/`amountChangeExceedsThreshold` were set), so `boundSignals`' `proposedAmount` → `parameters.amount` check (SignalIntentBinder) rejected the transaction as a signal/intent mismatch before `PolicyEngine` ever ran, surfacing as an unexpected `403` rather than the intended `200`. This was a test-fixture bug, not a connector or policy bug — the same class of mistake `boundSignals` exists to catch, this time catching a test's own signals payload rather than a caller's. Fixed by including `proposedAmount` in both the nudge and revert transactions' signals.

**Update (SDK dogfooding pass): the live suite now drives every request through the real, published `@parmana/sdk` package, not `supertest`.** Until this pass, this suite — like every other test in this repository — talked to `POST /execute` either via `supertest` against an in-process Express `app` object or a direct `fetch`, never through either maintained SDK's own client. Neither SDK's correctness against a real running server had ever actually been exercised this way; both were verified only by their own dedicated SDK test suites, never by anything else in this codebase actually consuming them. This is the one gated live suite this pass rewrote (HubSpot chosen over Razorpay specifically to avoid combining a real refactor with real-money risk; Razorpay's live suite is unchanged).

`hubspot-live.integration.test.ts` now boots the app on a real, OS-assigned TCP port (`app.listen(0, ...)`, not an in-process object) and drives it with `ParmanaClient`/`HttpTransport` imported from `@parmana/sdk` — the actual installable package, built to `typescript/dist/` and resolved through the npm workspace link (`packages/api/package.json` now depends on it), the same way an external consumer would, not a relative import into `typescript/src/`. Every existing assertion and guardrail is unchanged: the `fetch`-spy "zero real HubSpot calls on policy denial" check still filters on `https://api.hubapi.com`, still passes (the SDK's own request to the local server is a different origin and never matches that filter); the non-existent-deal reachability case now asserts the SDK's typed `InternalServerError` instead of a raw `response.status`; the policy-denial case now asserts the SDK's typed `ExecutionRejectedError` instead of `response.body.code`.

**Precise scope of what this proves, and what it does not:** this session verified the rewritten suite type-checks cleanly against `@parmana/sdk`'s real exported types (no `as unknown as` cast anywhere in it, unlike the version it replaced — see the fixture bug below) and skips cleanly with no import or construction error when `ALLOW_LIVE_HUBSPOT` is unset, which is how it actually ran in this session (no live HubSpot credentials were available in this environment). It was **not** re-run live against a real HubSpot account in this session — that reconfirmation, that the rewritten version still passes 3/3 against a real account the way the supertest-based version did (see the live run documented above), is open work for whoever next has `TEST_HUBSPOT_PRIVATE_APP_TOKEN` configured. What the rewrite's correctness does not depend on is untested by this pass, though: `ParmanaClient.execute()`'s HTTP round trip and its error-to-exception mapping (`InternalServerError`, `ExecutionRejectedError`) are the same code paths independently proven, this session, against a real local server by `typescript/test/integration/parmana-client.integration.test.ts` — this suite's live-HubSpot-specific behavior (the actual bytes HubSpot's API returns) is what remains unconfirmed against a real account, not the SDK's own request/response handling.

**A real bug this rewrite found and fixed, the same class of honest disclosure as the fixture bug above:** the suite's own `liveTransaction`/`fetchDealTransaction` helpers built `BusinessTransaction` objects with field names that do not exist on the real schema — `metadata.createdBy`/`metadata.createdAt` instead of `metadata.submittedBy`/`metadata.submittedAt`, `authorization.authorizedAt` instead of `authorization.issuedAt`, plus a `decision` field `BusinessTransaction` does not have at all — forced past the compiler with `as unknown as BusinessTransaction`. Harmless in practice under `supertest` (the server ignores unrecognized fields, and `authorization.issuedAt`'s absence was never validated), which is exactly why it went uncaught: nothing before this pass ever constructed this object against the SDK's real, structurally-checked type. Fixed to the correct field names; the object now satisfies `@parmana/sdk`'s exported `BusinessTransaction` type directly, with no cast.

Evidence

- `packages/execution-gateway/src/connector-execution/GatewayHubSpotAdapter.ts`, `createGatewayHubSpotConnector.ts` (the executable connector; Bearer-auth PATCH to HubSpot's CRM API, the deny-by-default property allowlist check, and the placeholder-credential guard)

- `packages/connector-hubspot/src` (`HubSpotCapabilities`, `HubSpotMetadata`, `MockHubSpotServer`, `HubSpotTypes`, `HubSpotDealUpdateSignals`, `HubSpotDealUpdateReceipt`, `HubSpotCapabilityExecution`, `HubSpotSignalStateVerifier` — TD-23)

- `packages/execution-gateway/tests/unit/hubspot-connector.test.ts` (moved from connector-hubspot in the Phase 1C migration, 12 tests), `packages/connector-hubspot/tests/unit/hubspot-deal-update-policy.test.ts`, `hubspot-deal-update-signals.test.ts`, `HubSpotSignalStateVerifier.test.ts` (TD-23), `packages/execution-gateway/tests/unit/credential-non-exposure.test.ts` (independent claims audit, 2026-08-19, 2 tests: credential lifecycle) — 45 tests total

- `policies/hubspot-deal-update/1.0.0/policy.json`

- `packages/api/src/bootstrap/createHubSpotConnector.ts` (delegates to `createGatewayHubSpotConnector`), `createHubSpotCredentialProvider.ts` (production registration; fails closed, the connector is never registered, when `HUBSPOT_PRIVATE_APP_TOKEN` is unset outside test mode), `createHubSpotSignalStateVerifier.ts` (TD-23), `createConnectorRegistry.ts` (conditional registration), `createConnectorAuthenticator.ts` (hubspot added to the trusted connector identity list)

- `packages/api/tests/integration/hubspot-deal-update.integration.test.ts` (6 tests, count corrected 2026-08-24 — grew via later TD-22/TD-23 work, previously cited as 3): an approved dealstage update through a real `POST /execute` request against the production bootstrap chain (`createExecutionSystem`), landing on `MockHubSpotServer`; a policy-denied stage transition and a policy-denied over-threshold amount change through the same path, each making zero calls to the mock server (`fetch`-spy asserted); a signal/state-verification mismatch rejection; a TD-22 capability/policy-binding-violation rejection; a TD-23 unbacked-pre-authorization rejection

- `packages/api/tests/integration/hubspot-live.integration.test.ts` (3 tests, gated behind `ALLOW_LIVE_HUBSPOT=1` + `TEST_HUBSPOT_PRIVATE_APP_TOKEN` + `TEST_HUBSPOT_DEAL_ID` for the third case; skipped by default) and `packages/api/tests/helpers/hubspot-live-availability.ts` (the gating logic, originally written mirroring the now-deleted `razorpay-live-availability.ts`). Run live in an earlier session with all three variables configured: **3/3 passing** against a real HubSpot developer/test account — reachability, zero-calls-on-denial, and the non-destructive amount nudge-then-revert against the real test deal (redacted `********0850`), all described above.

- SDK dogfooding pass, this session (no live HubSpot credentials available in this environment, so this covers what could actually be checked): `npx tsc --noEmit` against the rewritten file and the full `packages/api/src` project graph, zero errors; `npm run build` in `typescript/` producing `typescript/dist/`, then `node --input-type=module -e "import * as sdk from '@parmana/sdk'; ..."` from the repo root confirming the package resolves through the npm workspace link with every symbol this rewrite imports (`ParmanaClient`, `HttpTransport`, `ExecutionRejectedError`, `InternalServerError`) present; `npx vitest run packages/api/tests/integration/hubspot-live.integration.test.ts` with `ALLOW_LIVE_HUBSPOT` unset, confirming the file imports and skips cleanly (1 file, 3 tests, all skipped — no import, construction, or type error). The live-network-specific assertions above were not re-run.

- `.env.example` (`HUBSPOT_PRIVATE_APP_TOKEN`, `TEST_HUBSPOT_PRIVATE_APP_TOKEN`, `ALLOW_LIVE_HUBSPOT`, `TEST_HUBSPOT_DEAL_ID`, `HUBSPOT_BASE_URL`)

- Full monorepo suite run this session (`npm test`, `TEST_HUBSPOT_PRIVATE_APP_TOKEN`/`ALLOW_LIVE_HUBSPOT`/`TEST_HUBSPOT_DEAL_ID` configured so the HubSpot live suite ran rather than skipped): 710 passed, 35 skipped (the remaining gated live suites this environment did not opt into — Supabase, Razorpay), 0 failed. A separate, prior run of this same suite with no live credentials configured observed 707 passed / 37 skipped, confirming the HubSpot live suite's 3 tests move cleanly from skipped to passing and nothing else regresses. `npm run typecheck` and `npm run lint` both clean in both runs.

**Update (Phase 3D certification follow-up):** `redactHubSpotToken` (`HubSpotTypes.ts`) no longer truncates the literal Private App token (previously: first 12 characters plus an ellipsis — for HubSpot the bearer token _is_ the entire credential, so this was a genuine fragment of the actual secret). It now returns a one-way, truncated SHA-256 fingerprint (`fp_` + 12 hex chars), preserving the operational "same token used across these executions" signal with zero credential bytes reaching `ConnectorResponse.metadata`, the Trust Record, or the `POST /execute` response body. `hubspot-connector.test.ts`'s redaction test now asserts the response body contains no substring of the token at all.

**Update (GitHub connector, §3.17):** the credential-isolation pattern this section describes — provider-resolved, `execute()`-scoped-local, redacted to a one-way fingerprint before it can reach any response or audit record, zero external API calls on policy denial — is no longer HubSpot-specific. §3.17 proves the identical guarantee for `@parmana/connector-github`'s structurally different, ephemeral (per-execution-minted, never cached) credential model, evidence that this pattern is foundational to Parmana's connector architecture rather than a property of any one connector's implementation.

---

## 3.11 Durable, Third-Party-Verifiable Refusal and Audit Records (RFC-0021, Scoped)

Every policy `REJECT` decision reachable through `RuntimeEngine.execute` — an ordinary `PolicyEngine.evaluate` rejection or a `SignalIntentBinder` binding-violation rejection — produces a signed, durable **Refusal Record**, independently third-party-verifiable the same way an Execution Trust Record's signature is, without requiring a caller credential or database access to check. This closes what was previously true of this codebase: an approved execution left cryptographic evidence behind (the Execution Trust Record and its signature); a refused one left only an HTTP response and whatever the caller's own logs happened to capture.

`RefusalRecordBuilder` (`packages/runtime/src/RefusalRecordBuilder.ts`) builds the record from the rejected transaction, its `Decision`, the executed intent's target/parameters, and any `SignalIntentBinder` violations; `RefusalCrypto` (`packages/crypto/src/RefusalCrypto.ts`) hashes and signs it with the same `FileKeyProvider`/`DEFAULT_KEY_ID` signing stack every other artifact in this document uses — one root of trust, not a separate one for refusals. `POST /refusal/verify` (`packages/api/src/routes/refusal-verify.ts`) verifies a submitted Refusal Record's signature and returns `{ valid }`; like `POST /audit/verify` below, it is deliberately mounted ahead of caller-auth middleware — no API key, no lookup by id, nothing but the artifact itself and Parmana's public key, which is precisely what makes a refusal independently checkable by whoever received the rejection, not only by Parmana.

Separately, and closing the analogous gap for caller-authentication audit trails (2.16, 2.19): every event a **production** audit sink writes is now signed at write time with `AuditEventCrypto` (`packages/crypto/src/AuditEventCrypto.ts`, the same signing stack again), stored alongside the event as a `signature_json` column. `POST /audit/verify` (`packages/api/src/routes/audit-verify.ts`) verifies any event matching this generic signed-event shape — `CallerAuditEvent` today — through one route, since `AuditEventCrypto.verify()` operates on canonical bytes and a signature alone, never dispatching on the event's own `type`. **Update (2026-08-24 documentation-currency pass):** this route was originally built to verify both `CallerAuditEvent` and the now-removed `RazorpayWebhookAuditEvent` shape (deleted with the rest of the Razorpay connector on 2026-08-12); the route's own code was always fully generic (it never imported or type-checked against either name specifically) and needed no change, but `RazorpayWebhookAuditEvent` no longer exists as a type anywhere in this codebase and no longer describes anything this system produces.

**Policy content hash (2026-10-06).** A Refusal Record carries `policyContentHash`, the SHA-256 hash of the policy content that decided it, computed by `RuntimeEngine` from the policy that loaded, the same value an Execution Trust Record carries in `transaction.policy.contentHash`. It is inside the signed canonical record (`RefusalCrypto.canonicalRecord`), so changing, removing or adding it fails verification. Refusal Records written before that date have no `policyContentHash`; an absent field is left out of the canonical form, so they hash exactly as before and still verify (pinned in `crypto-verifiers.exact.test.ts`). Stored in `refusal_records.policy_content_hash` (migration `20261006120000_add_refusal_policy_content_hash.sql`, nullable).

**Scope, precisely — two caveats, both load-bearing:**

1. **Refusal Record writing is evidentiary and fails open, deliberately, not fail-closed like caller-auth audit writes (2.19).** `RuntimeEngine.writeRefusalRecord` runs after `Decision` is built but is explicitly barred, by its own comment, from affecting, delaying past that synchronous attempt, or blocking the `executionGate.enforce()` rejection that follows it — a write failure is logged (`refusal_record_write_failed`) and swallowed, never thrown. The rejection itself is unaffected either way: a request that should be denied is still denied, correctly, whether or not its evidentiary record lands. What can be silently missing is the durable proof of _why_, not the correctness of the refusal itself. `RefusalRecordBuilder`/`RefusalRecordRepository` are also optional at construction (`RuntimeFactory`'s `refusalRecords` parameter); when omitted, no Refusal Record is ever written, by design, not by failure. Verified: `packages/runtime/tests/unit/refusal-record-fail-open.test.ts`.

   **Considered and rejected (2026-08-19): making this write atomic/fail-closed with the rejection response** (write the record synchronously before returning to the caller; a storage failure would surface as `500` instead of `403`). Rejected because it does not strengthen the property that actually matters — the request is already unconditionally denied, correctly, the instant `Decision` is built, regardless of whether the evidentiary write ever runs — and it introduces a new one: a Supabase hiccup would turn a _correct_ policy rejection into an opaque server error, a genuine availability regression (and a storage-pressure denial-of-service vector) for zero corresponding security gain. "Fail-closed" is the right discipline for whether a dangerous action executes; the refusal record is evidence _about_ a decision already enforced, not a gate on it. The existing remedy for a durability gap — logging `refusal_record_write_failed` loudly for an operator to reconcile — is the correct one; blocking the caller's response on it is not.

2. **Only production (Supabase) audit sinks sign.** `SupabaseCallerAuditSink` signs every event; `InMemoryCallerAuditSink` (test wiring, `NODE_ENV=test`) does not. This claim is therefore about the production deployment path specifically, not every configuration this codebase can run in. Existing rows written before this capability shipped remain unsigned; `signature_json` is nullable and additive, honestly reflecting that history rather than backfilling a signature that was never actually produced at write time. (At the time this capability shipped, the same split also applied to `SupabaseRazorpayWebhookAuditSink`/`InMemoryRazorpayWebhookAuditSink`; both were deleted along with the rest of the Razorpay connector on 2026-08-12 and no longer exist.)

A third, narrower operational note, not a scope caveat on the claim itself: `SupabaseCallerAuditSink` currently writes via a direct Postgres connection rather than PostgREST. This originated as a narrow workaround for a PostgREST schema-cache issue with one new column (Supabase support ticket SU-437429), but a production-readiness audit (2026-09-09) found the pattern has since been extended deliberately, repo-wide: **8 of the 9** `Supabase*` storage classes now write via `PostgresPoolFactory` rather than PostgREST/supabase-js, per `SupabaseExecutionTrustRecordRepository.ts`'s own comment — "part of removing PostgREST from every Supabase-backed table's failure modes, not just the audit sinks that broke first." This is no longer a single revertible patch pending one support ticket; it is the storage layer's current architecture. `SupabaseClientFactory` (the supabase-js/PostgREST client class this workaround originally planned to revert to) had zero remaining call sites as of that audit and was deleted the same day, along with its now-unused `@supabase/supabase-js` dependency (`docs/VERIFICATION-GAPS.md` G-34) — a revert, if SU-437429 is ever resolved, would mean reintroducing a PostgREST client, not restoring one that still exists.

Evidence

- `packages/crypto/src/RefusalCrypto.ts`, `AuditEventCrypto.ts`

- `packages/runtime/src/RefusalRecordBuilder.ts`, `RuntimeEngine.ts` (`writeRefusalRecord`, fail-open by design)

- `packages/shared/src/domain/refusal-record.ts`, `repositories/refusal-record-repository.ts`

- `packages/storage/src/memory/MemoryRefusalRecordRepository.ts`, `supabase/SupabaseRefusalRecordRepository.ts`

- `packages/api/src/routes/refusal-verify.ts`, `refusal-get.ts`, `audit-verify.ts`

- `packages/api/src/auth/SupabaseCallerAuditSink.ts`, `InMemoryCallerAuditSink.ts` (signs / does not sign, respectively)

- `04-INCIDENTS-LOG.md`, INC-7 ("Audit-sink events were durable but unsigned") — the incident this capability closes, including the PostgREST workaround noted above

- `docs/rfcs/RFC-0021-Refusal-Record.md`

- `packages/api/tests/integration/refusal-record.integration.test.ts` (6 tests), `audit-verify.integration.test.ts` (4 tests, corrected 2026-08-24, previously cited as 5): real `POST /refusal/verify` and `POST /audit/verify` HTTP requests — valid signature accepted, tampered payload rejected, mounted ahead of caller-auth (no credential required)

- `packages/runtime/tests/unit/refusal-record-fail-open.test.ts` (2 tests): a Refusal Record write failure does not affect the returned rejection

- `packages/storage/tests/unit/supabase-refusal-record-repository.test.ts` (4 tests)

---

## 3.12 `@parmana/sign`: Open-Core Extraction of the Signing Primitives (Scoped)

The signing/verification/canonical-hashing primitives this document's cryptography claims (2.13, 2.14, and the hybrid-signing work referenced in `docs/VERIFICATION-GAPS.md` G-4) rest on have a public, independently maintained counterpart: `@parmana/sign` (`github.com/pavancharak/parmana-sign`), an npm package described in its own README as "signing, verification, and canonical hashing primitives with post-quantum (ML-DSA-65/Dilithium3) support, extracted from Parmana." It ships `SignatureProvider`, `Dilithium3SignatureProvider`, `SignatureVerifier`, `ArtifactHasher`, and `CanonicalSerializer` — the same primitives this repository's `@parmana/crypto` package builds on internally, not a reimplementation.

**This is a genuine open-core split, not "the whole platform is open source."** `@parmana/sign` itself is Apache License 2.0, its own README stating it is "fully usable on its own, independent of Parmana." This repository — the policy engine, `SignalIntentBinder`/signal-state verification, the runtime, and everything else that decides what gets signed and why — remains source-available for evaluation, all rights reserved (see `LICENSE`, root of this repo). Only the cryptographic primitives were extracted and opened; the authorization logic was not.

Independently checkable at the time of this writing: the repository carries an OpenSSF Best Practices passing badge (project #13926) and a weekly/on-push OpenSSF Scorecard, and its README states tagged releases carry SLSA Build Level 3 provenance and are signed keylessly with `cosign` via GitHub's OIDC identity.

**Scope, precisely:** this claim is about the existence, license, and stated security posture of an external repository, verified by fetching it directly — not something this repository's own `npm test` run proves, and not something re-verified on every audit pass of this document. Verifying it currently required an external fetch outside the citation discipline the rest of this document uses (a file, a line, or a specific test in _this_ repo); treat this claim as weaker evidentiary footing than every other claim above for that reason. `@parmana/sign`'s `SignatureVerifier` does **not** yet recognize the `signatures`/`schemaVersion` hybrid envelope shape (`docs/VERIFICATION-GAPS.md` G-4's update) — a third-party verifier using this package today checks the legacy single-signature field only, which is by design (that field is still computed identically for hybrid-signed records) but is not a full hybrid-signature check.

**Update (2026-09-11):** independently re-verified via `gh api repos/pavancharak/parmana-sign` as part of that day's PQC production-readiness audit (`docs/VERIFICATION-GAPS.md` gap 51) -- still real, public, Apache-2.0, actively pushed to. Its own README confirms this section's description exactly (canonical serialization, `Dilithium3SignatureProvider`, no key management, no policy logic). The hybrid-envelope gap above still holds: a third party wanting to fully verify a hybrid-signed Execution Trust Record today should use this repository's own `packages/crypto/src/OfflineVerifier.ts` (or its Python counterpart, `python/parmana/crypto/offline_verifier.py`), not `@parmana/sign`, until that external package is separately updated to recognize the `signatures` array -- work this repository's own build cannot perform.

**Update (2026-10-03):** `@parmana/sign` 0.2.0 is published on npm (`npm view @parmana/sign version` returns `0.2.0`; tarball shasum `84f2cdb4…` matches the tarball attached to the signed `v0.2.0` GitHub release, which carries SLSA provenance and a Sigstore bundle; this npm publish has no npm provenance attestation). It now ships `Ed25519SignatureProvider` (including the large-message KMS commitment in `SignatureCommitment.ts`), this repository's Execution Trust Record and Execution Intent canonical field mappings, and `verifyExecutionTrustRecordOffline` / `verifyExecutionIntentOffline`, which also check the hybrid `signatures`/`schemaVersion` envelope. Its compatibility tests (`parmana-compat.test.ts` in that repository) verify fixtures signed by this repository's own `packages/crypto` code (legacy, hybrid, large KMS-committed, large raw, and an Execution Intent), regenerated by that repository's fixture script from a checkout of this one. The hybrid-envelope gap described above is closed as of that version. Same evidentiary footing as the rest of this section: an external repository, not proven by this repository's `npm test`.

Evidence

- `github.com/pavancharak/parmana-sign` (external repository; README, badge row, `LICENSE`)

- `packages/crypto/src/providers/signature/Dilithium3SignatureProvider.ts`, `packages/crypto/src/SignatureVerifier.ts`, `packages/crypto/src/CanonicalSerializer.ts` (this repository's own, internal versions of the primitives `@parmana/sign` ships as `Dilithium3SignatureProvider`/`SignatureVerifier`/`CanonicalSerializer`; corrected 2026-08-24 — `SignatureVerifier.ts`/`CanonicalSerializer.ts` live directly under `packages/crypto/src`, not under `providers/signature/` alongside `Dilithium3SignatureProvider.ts`). `@parmana/sign`'s `ArtifactHasher` has no direct internal equivalent by that name in this repository; the closest analogues are the purpose-specific `TrustRecordHasher.ts`, `ReceiptHasher.ts`, and `ExecutableContentHasher.ts`, each hashing one canonical artifact type rather than one general-purpose hasher covering all of them.

---

## 3.13 Hybrid (Ed25519 + ML-DSA-65) Signing Capability (Scoped)

Trust Records and Receipts can be dual-signed with both Ed25519 and ML-DSA-65 (post-quantum) at once, and verification can require both to independently pass. This is a built, tested capability, not yet a deployment: `CRYPTO_MODE` remains `single` by default, Ed25519 alone, everywhere this codebase runs today, including the production deployment (`parmana-api-real.vercel.app`). This claim is about what exists and is proven correct when explicitly turned on, not about what is currently running.

`HybridSignatureProvider` (`packages/crypto/src/HybridSignatureProvider.ts`) signs an artifact with both algorithms and verifies fail-closed: `verify()` requires exactly one entry matching the primary algorithm and one matching the secondary — a missing, extra, duplicated, or wrong-algorithm entry rejects, never a partial pass. `ExecutionTrustRecord` and `Receipt` (`packages/shared/src/domain/execution-trust-record.ts`, `receipt.ts`) gained two optional fields, `schemaVersion` and `signatures` (an array of `SignatureEntry`, `packages/shared/src/domain/signature-entry.ts`), additive only: the pre-existing single `signature` field is computed exactly as before, over exactly the same canonical content as before, so every record signed before this capability existed — and every record signed after it while `CRYPTO_MODE=single` — verifies completely unchanged. `signatures` is populated, and `schemaVersion` set to `2`, only when `CRYPTO_MODE=hybrid` is active at signing time.

`CRYPTO_MODE` (`packages/shared/src/config/CryptoAlgorithms.ts`'s `CryptoModes`, validated by `parseCryptoMode` in `ConfigValidation.ts` the same way every other config enum in this codebase is — an invalid value now fails closed at startup, rather than the untyped pass-through it was before this capability existed) is read by `VerificationCrypto.signHybrid()` and `ReceiptCrypto.createReceipt()` specifically, not globally: every other signing surface in this codebase (execution authorization, gateway attestation, connector signing) reads only `PRIMARY_SIGNATURE_PROVIDER` and is completely unaffected by `CRYPTO_MODE`, whatever it's set to. `BusinessTrustRecordBuilder` calls `signHybrid()`, in addition to its existing, unchanged `sign()` call, exactly when `CRYPTO_MODE=hybrid`. Verification mirrors this: `VerificationCrypto.verifySignature()` always checks the legacy `signature` field, and additionally, only when a record's `signatures` array is present and non-empty, requires every entry in it to independently verify too — both checks must pass for a hybrid-shaped record; a record with no `signatures` field verifies exactly as it always has.

The secondary (ML-DSA-65) key lives at a distinct keyId, `default-secondary` (`DEFAULT_SECONDARY_KEY_ID`, `packages/crypto/src/KeyProvider.ts`), alongside the existing `default` Ed25519 key under the same `PARMANA_KEY_DIR` — generated with `npm run generate:hybrid-secondary-key`. A missing secondary key file, or `CRYPTO_MODE=hybrid` without `SECONDARY_SIGNATURE_PROVIDER` configured, fails closed (a thrown error, not a silent single-signature fallback) the first time hybrid signing is attempted.

**Update (2026-10-03, audit):** "the first time hybrid signing is attempted" was after the action had been released, so a missing key meant a released action with no Trust Record. The server now refuses to start in `CRYPTO_MODE=hybrid` unless every key pair the hybrid path reads is present (`assertSigningKeyMaterialConfigured`). It also refuses `CRYPTO_MODE=hybrid` with `KEY_PROVIDER=aws-kms`: both entries of the hybrid `signatures` array are signed with local key files, the Ed25519 one included, and under KMS that key has no local file. Evidence: `packages/api/tests/unit/bootstrap/assert-signing-key-material-configured.test.ts` (3 new cases).

**Required caveat, load-bearing:** `@parmana/sign` (3.12), the public SDK used for independent third-party verification, does not yet recognize the `signatures`/`schemaVersion` envelope shape. Today, a third party verifying a hybrid-signed record through `@parmana/sign` checks the legacy `signature` field only — that check is genuinely correct, not a false pass, since the legacy field remains a real, valid Ed25519 signature over the record. But it is a partial verification: it does not check the ML-DSA-65 signature, and therefore does not confirm the full hybrid guarantee this capability is designed to eventually provide. Updating `@parmana/sign` to recognize the new envelope shape is untracked, separate follow-on work, not part of this capability and not a dependency of it (see 3.12).

**Update (2026-10-03):** the caveat above is resolved for `@parmana/sign` 0.2.0 and later (3.12): `verifyExecutionTrustRecordOffline` checks every entry in the `signatures` array as well as the legacy field, and reports `hybridSignaturesValid` separately, so a third party can confirm the full hybrid guarantee through the public package. Earlier versions of `@parmana/sign` still check the legacy field only.

Evidence

- `packages/crypto/src/HybridSignatureProvider.ts`

- `packages/shared/src/domain/signature-entry.ts`, `execution-trust-record.ts`, `receipt.ts` (the additive `schemaVersion`/`signatures` fields)

- `packages/shared/src/config/CryptoAlgorithms.ts` (`CryptoModes`), `ConfigValidation.ts` (`parseCryptoMode`), `Config.ts` (`crypto.mode`)

- `packages/crypto/src/VerificationCrypto.ts` (`signHybrid`, hybrid-aware `verifySignature`/`verify`), `ReceiptCrypto.ts` (hybrid-aware `createReceipt`)

- `packages/crypto/src/KeyProvider.ts` (`DEFAULT_SECONDARY_KEY_ID`), `scripts/generate-keypair.ts` (`--force`-gated overwrite protection), `package.json` (`generate:hybrid-secondary-key`)

- `packages/runtime/src/BusinessTrustRecordBuilder.ts` (calls `signHybrid()` additively when `CRYPTO_MODE=hybrid`)

- `packages/crypto/tests/unit/hybrid-signature-provider.test.ts` (7 tests: sign+verify round trip, tampered second signature rejected, second signature missing entirely rejected — not a silent downgrade to single-signature verification, duplicated single-algorithm array rejected, signature from the wrong keypair rejected, tampered artifact rejected, missing secondary key file fails closed on `sign()`)

- `packages/runtime/tests/unit/verification-service-hybrid.test.ts` (4 tests, through the real `BusinessTrustRecordBuilder` → `VerificationService` path): a hybrid-signed record verifies end to end with two independent signature entries present; a legacy-shaped record with `schemaVersion`/`signatures` stripped still verifies unchanged even while the process runs `CRYPTO_MODE=hybrid`; a hybrid record with a corrupted secondary signature is rejected; a hybrid record with the secondary signature stripped entirely is rejected

- `packages/runtime/tests/integration/receipt-hybrid.integration.test.ts` (2 tests, through the real `ReceiptService` path): a hybrid-signed Receipt's `signatures` independently re-verify via `HybridSignatureProvider` from outside the class that produced them; a tampered hybrid Receipt signature is rejected

- `packages/shared/tests/unit/config-validation.test.ts` (`parseCryptoMode` cases: selects the configured mode, defaults to `single` when unset, throws naming the invalid value)

- `docs/VERIFICATION-GAPS.md` G-4 (the gap-tracking record of exactly which signing surfaces this covers and which it doesn't)

---

## 3.14 Per-Caller Rate Limiting on `/execute` (Scoped)

`POST /execute` — the endpoint that signs and writes to the database on every request — enforces a per-caller rate limit, closing a gap found during live load testing of `parmana-api.fly.dev`: no rate limiting existed anywhere in this codebase at all, confirmed both by code review (no rate-limiting package in any `package.json`) and empirically, by firing several thousand unthrottled requests against the live deployment with zero `429`s at any concurrency level tested. `GET /health` and `GET /ready` carry a separate, far more permissive limit, since both are cheap, unauthenticated, and legitimately polled on a fixed interval by PaaS health-check infrastructure (`fly.toml`'s own check runs every 30s per machine).

The `/execute` limiter is keyed by authenticated caller identity (`req.callerId`, set by caller-auth), not by IP — a design-partner integration commonly calls from a shared backend IP, where an IP-keyed limit would either starve every caller behind it or be loose enough to mean nothing. It is mounted only when caller authentication is enabled (`createApp`'s `callerAuth` option is not `"disabled"`): there is no caller identity to key off when auth is off, and rate-limiting a route with no caller identity by falling back to IP would silently become the exact IP-keyed control this design deliberately avoids. Both limits are configurable (`RATE_LIMIT_EXECUTE_PER_MINUTE`, default 30; `RATE_LIMIT_HEALTH_PER_MINUTE`, default 300 — see `.env.example`), sized for a design-partner evaluation deployment, not high-volume production traffic. A rejected request returns `429` with a clear `{ "error", "code": "RATE_LIMITED" }` body and a `Retry-After` header, and never reaches `BusinessTransactionMapper`, policy evaluation, or `RuntimeAuthorizationSigner` — no nonce is consumed and nothing is signed for a request this middleware rejects, confirmed directly: a rate-limited request produces zero new execution-audit events.

**Scope, precisely, mirroring 3.2's own caveat for `NonceStore`:** the limiter's store is `express-rate-limit`'s default, in-memory, single-process store. When this was written, the deployment ran two Fly machines (production has since moved to Vercel), each counting independently — the effective ceiling for a given caller is `RATE_LIMIT_EXECUTE_PER_MINUTE × machineCount`, not a fleet-wide limit enforced once across every machine. A shared store (Redis or equivalent) would close that gap; none is wired in, and this claim does not represent one as existing.

Evidence

- `packages/api/src/middleware/rate-limit.ts` (`createExecuteRateLimiter`, `createHealthReadyRateLimiter`)
- `packages/api/src/app.ts` (mounting: health/ready limiter shared across both routes; execute limiter conditional on `callerAuth !== "disabled"`, mounted ahead of `createExecuteRouter`)
- `packages/shared/src/config/Config.ts` (`RateLimitConfig`, `RATE_LIMIT_EXECUTE_PER_MINUTE` / `RATE_LIMIT_HEALTH_PER_MINUTE`, defaults 30/300)
- `packages/api/tests/integration/rate-limit.integration.test.ts`: normal traffic under the limit passes unaffected; traffic over the limit gets a clean 429 with `Retry-After` and zero new execution-audit events; a rate-limited caller does not block a different caller's traffic (per-key, not global); the health/ready limiter is shared across both routes; rate limiting is skipped entirely when `callerAuth` is `"disabled"`; an omitted `rateLimit` option falls back to the documented defaults

**Update (2026-09-10):** the fleet-wide scope gap this claim's own "Scope, precisely" paragraph named above is now closable. New `PostgresRateLimitStore` (`packages/storage/src/postgres/PostgresRateLimitStore.ts`), a real `express-rate-limit` `Store` backed by an atomic `INSERT ... ON CONFLICT` upsert against a new `rate_limit_counters` table (`supabase/migrations/20260910120000_add_rate_limit_counters.sql`). `createRateLimitStore.ts` wires it in when `DATABASE_URL` is configured -- both limiters then share counts fleet-wide, closing the `limitPerMinute * machineCount` gap for any deployment that scales past one machine. Deliberately not fail-closed the way `NonceStore`'s `DATABASE_URL` requirement is: without a configured database, both limiters fall back to the in-process default with a loud startup warning rather than refusing to start, since a looser-than-configured capacity ceiling is not the same class of gap as a missing security check. See `docs/VERIFICATION-GAPS.md` G-41. This deployment's current shape (`fly.toml`'s `min_machines_running = 1`) means the gap this update closes was not yet live-exploitable here, but the fix removes the blocker to scaling out.

Evidence (update)

- `packages/storage/src/postgres/PostgresRateLimitStore.ts`, `packages/api/src/bootstrap/createRateLimitStore.ts`
- `packages/storage/tests/unit/postgres-rate-limit-store.test.ts` (7 cases), `packages/api/tests/unit/bootstrap/create-rate-limit-store.test.ts` (3 cases: test / production-without-DATABASE_URL / production-with-DATABASE_URL)

**Update (2026-09-28, G-78):** a third limiter, keyed by IP address, covers the unauthenticated routes that do work: `POST /refusal/verify`, `POST /execution-intents/verify` and `POST /audit/verify` (signature checks) and `/handbook` (a database write), one shared counter, `RATE_LIMIT_PUBLIC_PER_MINUTE`, default 60, with its own `public:` Postgres store when `DATABASE_URL` is set. Static documentation and key discovery (`/keys`, `/.well-known/jwks.json`) are not limited. Evidence: `createPublicRateLimiter` in `packages/api/src/middleware/rate-limit.ts`, `packages/api/tests/integration/rate-limit.integration.test.ts` (3 new: over the limit is `429` before the route runs; one counter across the four routes; it does not count against `/health`). The effective limit behind Vercel depends on how the platform reports client addresses (`trust proxy` is one hop), which was not checked live.

**Update (2026-10-03, audit):** the G-78 limiter above did not cover two unauthenticated paths that do work. Every request with a missing or invalid API key, on any authenticated route, writes a signed `caller.rejected` audit event (a KMS Sign call in production) before answering `401`, with no limit, so anyone could spend the signing capacity real requests need. A fourth limiter, keyed by IP address and mounted in front of caller authentication, now counts only `401` responses (`createAuthFailureRateLimiter`, `RATE_LIMIT_AUTH_FAILURE_PER_MINUTE`, default 30, its own `auth-failure:` Postgres store when `DATABASE_URL` is set); a request with a valid key is not counted. Key discovery (`GET /keys/:keyId`, `GET /.well-known/jwks.json`), which makes KMS calls per request in production, now shares the public limiter. Evidence: `packages/api/tests/integration/rate-limit.integration.test.ts` (4 new: bad keys over the limit get `429` and stop writing `caller.rejected`; valid keys do not count; `GET /keys/:keyId` over the public limit gets `429`; the public limiter does not count authenticated routes).

**Update (2026-10-03, follow up):** `KmsSigner` now caches successful `GetPublicKey` and `DescribeKey` answers in memory for 5 minutes, by region and alias, shared across signer instances in one process, so repeated key discovery and verification no longer cost a KMS call each. Concurrent lookups of one key share a call; a missing key or a failed call is never cached; `Sign` is never cached. Evidence: `packages/crypto/tests/unit/kms-signer.test.ts` (5 new).
---

## 3.15 SDK Dogfooding: Documented Quickstarts Now Proven to Actually Run (Scoped)

**Scope, precisely:** this claim covers the two documented "quickstart" example scripts — `python/examples/quickstart/run.py` and its closest TypeScript equivalent, `typescript/examples/02-execute.ts` — now being proven to actually work by an automated test, plus the real bugs found while proving that. It does **not** cover the other 11 numbered example scripts in `python/examples/`, the other 4 in `typescript/examples/`, or either SDK's full API surface; those remain unexercised by any test, same as before this pass. It is a narrower, complementary claim to 3.10's HubSpot-live-suite-through-the-SDK update above, not a restatement of it — that one is about a _test suite_ driving requests through an SDK; this one is about _documentation examples_ being provably correct, not just plausible-looking code that happens to parse.

Before this pass, both quickstart scripts already imported their respective SDK (`parmana` / `@parmana/sdk`) rather than raw HTTP — that part did not need rewriting. What neither had was anything that actually _ran_ them: `typescript/examples/` is explicitly excluded from `typescript/tsconfig.json`'s own `include` list, so nothing in this repository has ever built, type-checked, or executed it, and no test imported `python/examples/quickstart/run.py` either. Both were, until now, hand-written code that had never been mechanically proven to still work as the surrounding schema evolved.

**What dogfooding this found, checked directly against the current schema and each SDK's actual exported members, not assumed:**

- Every file in `typescript/examples/` (5 example scripts, 2 shared helpers) imported `@parmana/typescript-sdk` — a package name that has never existed anywhere in this repository's history, under any name this workspace has ever had (`@parmana/legacy-reference` before this session's earlier TypeScript-SDK-audit pass, `@parmana/sdk` after it). None of these files could have ever been run as committed.
- `typescript/examples/02-execute.ts` and `typescript/examples/shared/transaction.ts` referenced `AuthorityType.USER` and `BusinessTransactionStatus.RECEIVED` as if they were runtime enum members. This SDK's hand-maintained models type both fields as plain `string`/string-union types with no such runtime enum exported at all (`import * as sdk from "@parmana/sdk"; sdk.AuthorityType` is `undefined`) — both files would have thrown immediately on execution.
- `typescript/examples/04-replay.ts` called `client.replay({ businessTransactionId: "..." })`, an object, where `ParmanaClient.replay()` takes a plain `string` — would have sent a malformed request path.
- `python/examples/quickstart/run.py` passed plain Python strings (`"SERVICE"`, `"RECEIVED"`) where the real generated dataclasses (`Authority.authority_type`, `BusinessTransaction.status`) declare actual `AuthorityType`/`BusinessTransactionStatus` enum types — confirmed by `mypy`, not inferred. Harmless on the wire (a `str, Enum` member and a plain string with the same value serialize identically, so this never caused a wrong request), but a genuine type-safety defect the language's own type checker would have caught immediately had anything ever run it in that mode.

All four fixed. `typescript/examples/02-execute.ts` was additionally refactored into an exported `runExecuteExample(endpoint?)` (previously a bare top-level script with no importable entry point) and `python/examples/quickstart/run.py`'s body into an exported `run_quickstart(endpoint?)` returning the `ExecutionTrustRecord` — both changes made specifically so a test could call them, not a stylistic preference.

**Now proven, present tense, by a real running server each `npm test` / `pytest` run boots:** `typescript/test/integration/examples.integration.test.ts` imports and calls `runExecuteExample` against a real local server and asserts a signed, `APPROVED` Execution Trust Record comes back. `python/tests/test_quickstart_example.py` does the same for `run_quickstart`, additionally asserting the script's own documented printed output (README.md's "Expected output" section) still matches what it actually prints. `python/examples/quickstart/README.md`'s prerequisites and sample output, which still referenced the removed `payments:execute`/`vendor-payment` capability and its `VENDOR_PAYMENT_TOKEN` (docs/VERIFICATION-GAPS.md G-27 removed it entirely, before this pass), were rewritten from a real captured run against `test:fixture-execute`, the fixture this script has actually targeted since that removal.

Evidence

- `typescript/examples/01-health.ts`, `02-execute.ts`, `03-verify.ts`, `04-replay.ts`, `05-policy-validation.ts`, `shared/client.ts`, `shared/transaction.ts` (package-name fix, all 7 files); `02-execute.ts`, `shared/transaction.ts` (enum-misuse fix); `04-replay.ts` (`client.replay()` argument fix)
- `typescript/test/integration/examples.integration.test.ts` (1 test): runs `runExecuteExample` against a real local server, asserts `trustRecordId` present, one `APPROVED` execution, `ed25519` signature
- `python/examples/quickstart/run.py` (`run_quickstart` extraction, `AuthorityType`/`BusinessTransactionStatus` enum fix); `python/examples/quickstart/README.md` (stale prerequisites/output rewritten from a real run)
- `python/tests/test_quickstart_example.py` (1 test): spawns a real local server with caller-auth disabled (matching the documented manual setup exactly, since `run_quickstart` never supplies an `api_key`), runs `run_quickstart` against it, asserts the returned record and the script's own printed output both match
- `mypy examples/quickstart/run.py` (Python): 3 errors before this pass's enum fix (2 real type mismatches plus one pre-existing, unrelated `datetime.UTC` 3.10-compatibility notice, unchanged), 1 after (only the unrelated notice remains)
- `npx tsc --noEmit` against `typescript/examples/**/*.ts` (TypeScript, checked directly — `typescript/tsconfig.json` itself does not cover this directory): clean after all fixes

---

## 3.16 Caller-to-Capability Scoping (Scoped)

Extends `ApiKeyEntry` with an optional `allowedCapabilities` field: the set of capabilities (`Intent.action` values, e.g. `hubspot:deal-update`) a given key may invoke. Checked in `execute.ts`/`transactions.ts` before the transaction ever reaches `application.execute()` — i.e. before `CapabilityPolicyBinder`/`PolicyEngine.evaluate` are reached, neither of which is caller-aware by design (2.24, 2.16's own G-28 note). A caller attempting a capability outside its grant is rejected `403 CAPABILITY_NOT_ALLOWED` and the denial is audited (`caller.capability_denied`, `CallerAuditSink`), never silently. The default is fail-closed and deliberately the opposite of `allowedPrincipalIds`' own default: an unset or empty `allowedCapabilities` denies every capability — there is no "may invoke its own capability" fallback the way there is a "may only assert itself" fallback for principals. The literal string `"*"` is an explicit, auditable wildcard grant, never an implicit default. `GET /callers/me` returns an authenticated caller's own resolved identity and scope (`callerId`, `allowedPrincipalIds`, `allowedCapabilities`, `unrestrictedCapabilities`) — self-lookup only, no key material — as the proof artifact a security review can point to.

**Scope, precisely — this is the load-bearing caveat for this claim:** this mechanism is implemented, tested, and enforced for every caller that authenticates through a caller-auth-enabled path. It does **not** currently apply to the capability actually reachable in production. **Update (2026-08-12): the Razorpay connector was deliberately removed from this codebase** (see the removal commit and CLAIMS.md's historical §3.8/§3.9) — `razorpay:refund-create` and the other Razorpay capabilities no longer exist here at all, not merely "unscoped." `hubspot:deal-fetch` and `hubspot:deal-update` remain the only production-reachable capabilities, and neither is scoped by caller yet: `hubspot-deal-update.integration.test.ts`/`hubspot-live.integration.test.ts` still construct their app with `callerAuth: "disabled"` — no `ApiKeyEntry` exists for that connector path at all, so there is no caller identity for `allowedCapabilities` to scope in the first place. Concretely: **do not read this claim as "Parmana's live CRM-moving (HubSpot) capabilities are now scope-restricted" — they are not, yet.** Today this protects only callers that go through caller-auth-enabled paths, which at present are test and tutorial callers scoped to the single generic `test:fixture-execute` capability (`NODE_ENV=test`-only). Enabling caller-auth on the HubSpot connector integration path itself is the follow-on work that would make this mechanism meaningful for the one capability that actually moves CRM state; that work has not been started (see Future Claims, §4).

Evidence

- `packages/shared/src/config/ApiKeyEntry.ts` (`allowedCapabilities`, fail-closed-by-default doc comment, `"*"` wildcard convention)
- `packages/shared/src/config/ConfigValidation.ts` (`parseApiKeys` validates `allowedCapabilities` the same way as `allowedPrincipalIds`)
- `packages/api/src/auth/isCapabilityAllowed.ts` (fail-closed check, wildcard handling)
- `packages/api/src/routes/execute.ts` / `transactions.ts` (enforced before `application.execute()`; `403 CAPABILITY_NOT_ALLOWED`; denial audited via `recordCallerAuditEvent`)
- `packages/api/src/auth/CallerAuditSink.ts` (`caller.capability_denied` event type, `capability` field)
- `packages/api/src/routes/callers-me.ts` (`GET /callers/me`, resolved identity/scope, no key material)
- `supabase/migrations/20260812120000_add_capability_to_caller_audit_events.sql` (additive `capability` column, widened `type` CHECK constraint; not yet applied to any live project)
- `packages/api/tests/unit/isCapabilityAllowed.test.ts`, `packages/api/tests/integration/caller-capability-scoping.integration.test.ts` (allow/deny/fail-closed-default/wildcard, denial precedes policy evaluation, audit content, `/callers/me` self-lookup and resolved-defaults)
- Repo-wide check confirming zero caller-auth-enabled test or production wiring exists for `hubspot:deal-update`: `hubspot-deal-update.integration.test.ts`, `hubspot-live.integration.test.ts` both construct their app with `callerAuth: "disabled"`. The Razorpay connector this section previously cited the same way no longer exists in this codebase at all (removed 2026-08-12).

---

## 3.17 GitHub Pull Request Merge Connector (Scoped)

`@parmana/connector-github` is a new, standalone workspace package, structurally parallel to `@parmana/connector-hubspot` (3.10): capability identifiers, schemas, and metadata live in the connector package; the executable adapter and credential provider are Gateway-owned (`packages/execution-gateway/src/connector-execution/`), imported back by the connector package's own comments as the reason nothing execution-shaped lives there. It authorizes two GitHub REST API actions this milestone: fetching a pull request's state (`github:pr-fetch`, read-only, used to learn mergeable/head-SHA state) and merging a pull request (`github:pr-merge`, the guarded execution). Anything else GitHub's API surface offers — review submission, comments, other object types, any webhook/event-driven trigger — is out of scope this milestone.

**Credential model, structurally different from every other connector this codebase has had (Razorpay, historical; HubSpot, current): ephemeral, not static.** `GitHubAppCredentialProvider` (`packages/execution-gateway/src/connector-execution/GitHubAppCredentialProvider.ts`) holds a GitHub App's private key, appId, and installationId at construction, and on every `resolve()` call signs a fresh RS256 JWT (`signGitHubAppJwt`, `packages/connector-github/src/GitHubAppJwt.ts` — pure JWT construction with no network call, deliberately the one piece of this connector that stays in the connector package rather than the Gateway, since it makes no execution-shaped call itself) and exchanges it for a short-lived (~1 hour) GitHub App installation access token via a real network call to GitHub's `access_tokens` endpoint. The private key itself never leaves `GitHubAppCredentialProvider`, is never logged, and never appears in any thrown error; only the resulting installation token is returned, and only for the single `execute()` call that requested it — `CredentialProvider.resolve()` is called fresh by the Execution Gateway immediately before each execution, never cached or reused upstream, so "mint a new short-lived token per execution, never store it" required no new mechanism, only an implementation of the same `CredentialProvider` interface HubSpot's static-token model already uses. That is itself evidence the credential-isolation pattern (3.10's own "Pattern: Universal Across Credential Models") generalizes across credential _models_, not merely across connectors that happen to share one.

`GatewayGitHubAdapter` (`packages/execution-gateway/src/connector-execution/GatewayGitHubAdapter.ts`) is deny-by-default and fail-closed with the same discipline as `GatewayHubSpotAdapter`, deliberately: a merge naming any method outside `GITHUB_ALLOWED_MERGE_METHODS` (`merge`/`squash`/`rebase`) is refused before any network call; a non-2xx GitHub response fails closed rather than returning a partial success; and — mirroring 3.10's own "placeholder-credential guard, from day one" lesson learned from the Razorpay incidents — this connector refuses, before any network call, to send `GITHUB_TEST_MODE_PLACEHOLDER_TOKEN` to GitHub's real API (`https://api.github.com`) unless `baseUrl` is explicitly overridden to a mock server, present from this connector's first version. `expectedHeadSha`, when the caller supplies it, is forwarded as GitHub's own `sha` merge parameter — GitHub itself refuses the merge (422) if the PR's actual head has moved since policy evaluated it, closing the same class of stale-decision gap `SignalIntentBinder` closes for amount/target fields elsewhere in this codebase.

`MockGitHubServer` (`packages/connector-github/src/MockGitHubServer.ts`) is a hermetic, in-memory stand-in for the three GitHub REST endpoints this connector uses (`POST /app/installations/:id/access_tokens`, `GET`/`PUT /repos/:owner/:repo/pulls/:number[/merge]`), used by every default test run; it never makes or receives real network traffic beyond localhost. It does not verify the App JWT's signature (only that a non-empty Bearer token was presented) — signature correctness is covered separately, in isolation from any network call, by `GitHubAppJwt.test.ts`.

**Policy** (`policies/github-pr-approval/1.0.0/policy.json`, evaluated by the same unmodified `PolicyEngine`): approves when `repositoryAuthorized`, `requiredReviewsCompleted`, `statusChecksPassed`, and `branchProtected` are all true and `riskScore` is at or below 20; denies otherwise, with dedicated rules for a too high risk score, failed status checks, and an unprotected branch, falling through to a generic deny by default rule. Reused across both `github:pr-fetch` and `github:pr-merge` the same way `hubspot-deal-update/1.0.0` is reused for both HubSpot capabilities in that connector's own integration tests (3.10): policy content and capability identity are independent concepts in this architecture (`packages/api/tests/fixtures/business-transaction.ts`'s own comment). **Update (2026-09-28, G-73):** `github:pr-merge` is bound to `github-pr-approval` 1.1.0, which authorizes a merge only with a signed approval for that pull request, and `github:pr-fetch` to its own `github-pr-read` 1.0.0. The facts above are caller declared and can only refuse a merge now (2.44).

**Wiring gap this milestone closed, not anticipated by the original scaffolding commit:** `createGatewayGitHubConnector` and the GitHub credential-provider factory existed only in `execution-gateway`'s internal `connector-execution/index.ts` barrel after the initial scaffolding commit — never re-exported from the package's public `index.ts` the way `createGatewayHubSpotConnector` already was, so `packages/api` had no legal way to reach them. `createGatewayGitHubCredentialProvider.ts` (new) mirrors `createGatewayGitHubConnector.ts`'s existing factory-wrapper shape; both are now exported from `packages/execution-gateway/src/index.ts` and added to `tests/architecture/execution-boundary.test.ts`'s own generically-enforced allowlist of legitimate public factory files (the same test that would have caught a genuine implementation-class leak). `packages/api/src/bootstrap/createGitHubConnector.ts`/`createGitHubCredentialProvider.ts` mirror `createHubSpotConnector.ts`/`createHubSpotCredentialProvider.ts` exactly, registered into `createConnectorRegistry.ts` conditionally on all three of `GITHUB_APP_ID`/`GITHUB_INSTALLATION_ID`/`GITHUB_APP_PRIVATE_KEY` being set (fails closed to "connector not registered," never a partially-configured provider or a startup crash, matching 3.10's own HubSpot precedent). `github`'s SPIFFE identity was also added to `createConnectorAuthenticator.ts`'s trusted-connector-identity list — required, not optional: omitting it surfaces as `DefaultConnectorPolicy`'s own `"Connector identity is not trusted."` rejection at execution time, not a wiring-time error.

**Test posture, in the order specified for this milestone:**

- **Hermetic first.** 22 unit tests, all passing, no network calls beyond localhost: `packages/connector-github/tests/unit/GitHubAppJwt.test.ts` (4 — RS256 signature correctness against real keypairs, `iat`/`exp` clock-drift backdating); `packages/execution-gateway/tests/unit/github-connector.test.ts` (12 — fetch, merge, stale-head rejection via GitHub's own 422, deny-by-default unsupported merge method before any network call, non-2xx/timeout fail-closed, bad-credential-shape rejection, token never leaked into a thrown error, token never placed in response metadata beyond a one-way fingerprint, placeholder-credential guard against the real endpoint, no credential-shaped instance field at construction, and — the credential-lifecycle property 3.10 needed a dedicated `credential-non-exposure.test.ts` to add after the fact — a test asserting a prior call's credential is never reused across two sequential `execute()` calls with two different tokens, present here from this connector's first version); `packages/execution-gateway/tests/unit/github-app-credential-provider.test.ts` (6 — real JWT-authenticated token mint against the mock server, handle branding, a fresh token minted on every `resolve()` call with no caching, private key never leaked into a thrown error, private key/token never placed in the resolved handle's identifiers, malformed access-token response fails closed without a raw parse error).
- **Policy-denial-makes-zero-calls.** Proven at the HTTP boundary (`packages/api/tests/integration/github-pr-merge.integration.test.ts`, 4 tests, all passing): a real merge through the production-wired `POST /execute` landing on `MockGitHubServer` (the strongest proof — the PR actually merges on the mock server, not just a `200` response); two policy `REJECTED` decisions (failed status checks, excessive risk score) each caught in `ExecutionGate.enforce` before `ExecutionComponent` ever dispatches to the connector — `response.status === 403`, `response.body.code === "POLICY_DENIED"`, and a `fetch` spy asserting literally zero calls reached the mock server's base URL, for _either_ the merge endpoint or the credential-mint (`access_tokens`) exchange; and a credential-isolation check confirming neither the installation token nor any PEM-shaped fragment appears anywhere in the `/execute` response body.
- **Gated live suite, written this milestone, not yet run live.** `packages/api/tests/integration/github-pr-merge-live.integration.test.ts` (2 tests) and `packages/api/tests/helpers/github-live-availability.ts` (the gating logic, mirroring `hubspot-live-availability.ts`), gated behind `ALLOW_LIVE_GITHUB=1` + a real `TEST_GITHUB_APP_ID`/`TEST_GITHUB_INSTALLATION_ID`/`TEST_GITHUB_APP_PRIVATE_KEY` triple. Confirmed this session only that the suite type-checks, lints, and skips cleanly with no import or construction error when these are unset (which is how it actually ran in this environment — the separate `TEST_GITHUB_APP_ID`/`TEST_GITHUB_INSTALLATION_ID`/`TEST_GITHUB_APP_PRIVATE_KEY` triple that actually gates this suite, distinct from the production `GITHUB_*` variables, is unset in this environment's `.env`, so no live credentials were usable regardless of what the production variables happen to contain). It was **not** run live against a real GitHub App installation this session — that is open work for whoever next configures a real `TEST_GITHUB_*` triple. Its design deliberately covers only two, non-destructive cases when it does run: (1) reachability — driving `github:pr-merge` through the real SDK against a real repository but a pull request number guaranteed not to exist, proving the full ephemeral-credential-mint → connector-dispatch chain reaches GitHub's real API without ever being able to merge anything; (2) policy denial making zero real GitHub calls against the production (non-mock) connector. **Deliberately has no mutating (merge) case**, unlike 3.10's own HubSpot live suite's nudge-then-revert amount case: a HubSpot deal's `amount` is a numeric field, safe to nudge and revert to its exact original value, but a GitHub PR merge has no equivalent — the merge commit is already in the base branch's history the instant the merge succeeds, and there is no general, safe "revert a merge" operation to automate (force-pushing the head branch ref back to its pre-merge SHA does not undo the merge commit already on the base branch, and risks destroying unrelated commits if the ref moved since). Proving the real merge path end to end against a real, disposable test PR is left to a deliberate manual live run, not something this suite performs unattended.

Evidence

- `packages/execution-gateway/src/connector-execution/GatewayGitHubAdapter.ts`, `createGatewayGitHubConnector.ts`, `GitHubAppCredentialProvider.ts`, `createGatewayGitHubCredentialProvider.ts` (the executable connector and ephemeral credential provider; Bearer-auth GitHub REST calls, the deny-by-default merge-method allowlist check, the placeholder-credential guard, and the JWT-mint → installation-token exchange)
- `packages/connector-github/src` (`GitHubCapabilities`, `GitHubMetadata`, `GitHubTypes`, `GitHubAppJwt`, `MockGitHubServer`)
- `packages/connector-github/tests/unit/GitHubAppJwt.test.ts` (4), `packages/execution-gateway/tests/unit/github-connector.test.ts` (12), `packages/execution-gateway/tests/unit/github-app-credential-provider.test.ts` (6) — 22 hermetic unit tests total
- `policies/github-pr-approval/1.0.0/policy.json`
- `packages/api/src/bootstrap/createGitHubConnector.ts` (delegates to `createGatewayGitHubConnector`), `createGitHubCredentialProvider.ts` (production registration; fails closed, the connector is never registered, when any of `GITHUB_APP_ID`/`GITHUB_INSTALLATION_ID`/`GITHUB_APP_PRIVATE_KEY` is unset outside test mode), `createConnectorRegistry.ts` (conditional registration), `createConnectorAuthenticator.ts` (`github` added to the trusted connector identity list)
- `packages/api/tests/integration/github-pr-merge.integration.test.ts` (4 tests): an approved merge through a real `POST /execute` request against the production bootstrap chain (`createExecutionSystem`), landing on `MockGitHubServer`; two policy-denied cases, each making zero calls to the mock server (`fetch`-spy asserted); a credential-isolation check on the response body
- `packages/api/tests/integration/github-pr-merge-live.integration.test.ts` (2 tests, gated behind `ALLOW_LIVE_GITHUB=1` + `TEST_GITHUB_APP_ID`/`TEST_GITHUB_INSTALLATION_ID`/`TEST_GITHUB_APP_PRIVATE_KEY`; skipped by default) and `packages/api/tests/helpers/github-live-availability.ts` (the gating logic, mirroring `hubspot-live-availability.ts`). Confirmed this session only to skip cleanly with no live credentials configured — not yet run live against a real GitHub App installation (see test posture above).
- `tests/architecture/execution-boundary.test.ts` (Phase 1D public API boundary check, allowlist extended to cover `createGatewayGitHubConnector`/`createGatewayGitHubCredentialProvider`)
- `.env.example` (`GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`, `TEST_GITHUB_APP_ID`, `TEST_GITHUB_INSTALLATION_ID`, `TEST_GITHUB_APP_PRIVATE_KEY`, `ALLOW_LIVE_GITHUB`, `TEST_GITHUB_REPOSITORY`, `TEST_GITHUB_PULL_NUMBER`, `GITHUB_BASE_URL`)
- Full monorepo suite run this session (`npx vitest run`, no live GitHub credentials configured so the live suite skipped as designed): 1227 passed, 37 skipped, 0 failed. `npx tsc -b` and `eslint .` both clean. Commit: `e0ba416` (wiring + hermetic tests), this session (live-test file + this document update).

**Pattern, stated precisely: credential isolation is now demonstrated across two structurally different credential models, not merely two connectors sharing one.** HubSpot's static, caller-independent, long-lived Private App token and GitHub's ephemeral, per-execution-minted installation token both flow through the same `CredentialProvider`/`execute()`-scoped-local discipline, both redact to a one-way fingerprint before reaching any response or audit record, and both make zero external API calls on policy denial. No actor — AI, human, application, or attacker — ever holds a working execution credential directly for either connector; only Parmana's own systems execute after authorization clears. What remains unvalidated for GitHub specifically, honestly stated: the live round trip against a real GitHub App installation (the mechanism is proven hermetically; the real-network exercise is open work, see above).

---

## 3.18 Deployment Infrastructure Requirements (Scoped)

**Claim:** running Parmana in production requires new infrastructure of its own — a container process, signing key material, and (for anything beyond a single ephemeral instance) a Postgres database via Supabase. Parmana does not read, write, or replace an integrated system's own database, and every connector it can call out to (HubSpot, GitHub — see 3.10/3.17; Paytm — see 3.22) is additive and individually optional: unset its credentials and the connector is simply not registered, with no effect on Parmana's own boot or on the external system itself.

**New, required to run Parmana at all (`docs/site/deployment/production.mdx`, `Dockerfile`):**

- **A container process.** One Docker image (`Dockerfile`), one process per container, running `packages/api/dist/server.js`, deployable to any Docker-based platform — validated with a bare `docker build`/`docker run`, not tied to a specific PaaS's proprietary build system (3.8/3.9's own `fly.io` deployments are one instance of this, not the only supported target).
- **Signing key material.** Two key pairs (`default`, the authorization-signing key; `gateway`, the Execution Gateway's attestation-signing key — deliberately separate, `PARMANA_GATEWAY_KEY_ID` overridable) are required in `PARMANA_KEY_DIR`. Neither is generated automatically, and the image's `keys/` directory ships empty on purpose — key material must never be baked into the image (`Dockerfile`'s own comment). Supplied either as mounted `.pem` files or via `PARMANA_KEY_MATERIAL_JSON`. `assertSigningKeyMaterialConfigured.ts` (`packages/api/src/bootstrap/`) fails closed at boot — before the port binds — if neither is present.
- **A Postgres database, via Supabase, for anything other than a disposable single instance.** `PARMANA_STORAGE=memory` (the default) needs no external database for business-transaction/execution-trust-record data — but the caller-authentication audit trail (`CallerAuditSink`) and the envelope-verifier's replay-protection store (`NonceStore`) are **always** Supabase-backed in any non-test deployment, never falling back to in-memory regardless of `PARMANA_STORAGE`, and both fail closed at boot if `DATABASE_URL` is not configured — via `assertDatabaseUrlConfigured.ts`, called unconditionally from `createCallerAuditSink.ts`/`createNonceStore.ts` (not `assertStorageConfigured.ts`, which validates only business-transaction/execution-trust-record storage, gated on `PARMANA_STORAGE=supabase` or `postgres`; see that file's own doc comment). `SUPABASE_URL` itself is not read by this check — `DATABASE_URL` is the only variable that satisfies it, a documented, temporary substitute pending resolution of Supabase ticket SU-437429. In practice, precisely stated: a real deployment always needs Supabase for the audit trail and nonce store; `PARMANA_STORAGE=supabase` additionally routes business-transaction/execution-trust-record storage through the same database rather than memory. There is no configuration under which a real (non-test) deployment runs with zero external database.
- **The schema applied to that database, manually.** `supabase/migrations/` must be applied to the target Supabase project before a real deployment can serve traffic — either `supabase db push` (Supabase CLI, if linked) or `scripts/apply-all-migrations.sql` (a concatenation of every migration file) via the Dashboard SQL Editor, on an empty database. **Corrected 2026-09-25:** this section used to call the bundle idempotent and safe to run again. It is not safe to run again on a database that holds data (`docs/VERIFICATION-GAPS.md` G-61). The container itself does not migrate at boot. The Docker Compose deployment of 2.40 runs the migrations for it, each once, and since 2026-09-25 `npm run db:migrate` does the same for any Postgres, with `baseline` for a database set up with the bundle (G-61, closed).
- **Caller authentication configuration.** `PARMANA_API_KEYS` (a JSON array of `{callerId, keyHash}` entries) is required; the process refuses to start without it, unless `PARMANA_AUTH_DISABLED=true` is explicitly set for local development only (logs a loud warning on every boot — never set in a real deployment).

**Not new, not replaced:** an integrated business's own operational database, its own audit/SIEM infrastructure, and every external system a connector calls (HubSpot's CRM, GitHub's API, and — one level removed — Paytm's own API, which Parmana never calls directly at all; see 3.22) are untouched by any of the above. Parmana holds no credential for and makes no call to a connector's external system unless that connector is explicitly configured (3.10/3.17's own "fails closed to connector-not-registered, never a partially-configured provider" pattern) — an unconfigured connector has zero footprint against the system it would have integrated with. Parmana's own database (Supabase) stores only Parmana's authorization/audit/execution-trust-record data, never an integrated business's operational records; callers provide business context to Parmana via signals in each request, not the reverse.

**What this claim does not assert:** deployment footprint, cost, or scaling characteristics beyond what `docs/site/deployment/production.mdx` documents (this is a correctness/completeness claim about _what infrastructure is required_, not a capacity or performance claim); a packaged one-command installer, database-schema auto-migration at boot, or a signing-key-generation tool — none of these exist in this repository today (schema application and key generation are both manual operator steps, described above and in `docs/site/deployment/production.mdx`, not automated by anything Parmana ships). **Update 2026-09-25:** for the self hosted Docker Compose deployment, all three now exist and are claimed, scoped, in 2.40: one command start, migrations applied by the `migrate` service, and key and API key generation by the `setup` service. For the image run on its own, this paragraph still holds.

**Update 2026-10-06, server image provenance:** `.github/workflows/server-image.yml` builds this `Dockerfile` when a GitHub release is published, pushes it to `ghcr.io/pavancharak/parmana-api:<release tag>`, and attaches SLSA build provenance (`slsa-github-generator` `generator_container_slsa3.yml`) to the image digest in the registry. Claimed only once a release has run it; until then no published image exists. The provenance covers that image only: the hosted API and the sandbox are built by Vercel, not from this image, and carry no SLSA provenance. It shows which commit and workflow built the image, not that the image is free of defects.

Evidence

- `docs/site/deployment/production.mdx` (the authoritative deployment runbook this claim is drawn from, which replaced the root `DEPLOYMENT.md` on 2026-09-28: required configuration, storage, schema application, caller authentication, health checks, graceful shutdown)
- `Dockerfile` (single-image, single-process build; `keys/` deliberately empty in the image; non-root runtime user)
- `packages/api/src/bootstrap/assertStorageConfigured.ts` (business-transaction/execution-trust-record storage, gated on PARMANA_STORAGE=supabase or postgres), `assertSigningKeyMaterialConfigured.ts` (fail-closed startup validation, before the port binds)
- `packages/api/src/bootstrap/assertDatabaseUrlConfigured.ts`, called unconditionally from `createCallerAuditSink.ts`/`createNonceStore.ts` (the actual fail-closed check for CallerAuditSink/NonceStore described above; checks DATABASE_URL only)
- `packages/shared/src/config/StorageProviders.ts` (`memory`/`postgres`/`supabase`), `packages/shared/src/config/Config.ts` (the sole `process.env` read site for application config)
- `supabase/migrations/` (schema source), `scripts/apply-all-migrations.sql` (manual application path with no CLI link)
- `fly.toml` (3.8's own currently-deployed instance — one concrete instantiation of this deployment shape, not evidence that Fly.io specifically is required). `fly.live.toml` (3.9's own instance) was deleted 2026-08-12 along with the rest of the Razorpay connector it deployed; §3.9 is now historical, so this section cites only the still-current `fly.toml`.
- `createConnectorRegistry.ts` (3.10/3.17: HubSpot/GitHub each registered conditionally on their own credentials; absent, the connector is simply not registered — no partial-configuration state, no effect on Parmana's own boot)

---

## 3.19 Principal-Binding Denial Audit Trail (Scoped)

Extends the caller-binding checks 2.16/G-24's `isPrincipalAllowed` fix and 3.16's `isCapabilityAllowed` both already enforce: when an authenticated caller submits a transaction whose `authority.principalId` it is not permitted to assert, that denial is now itself recorded as a signed, durable audit event — `caller.principal_denied`, a new `CallerAuditEvent` variant (`packages/api/src/auth/CallerAuditSink.ts`) carrying the asserted `principalId` and the authenticated `callerId`, never the raw key. This closes the same class of gap 3.11 (RFC-0021) closed for policy `REJECT`s and 2.19 already closed for every other caller-authentication outcome: before this capability, a principal-binding denial produced only an HTTP `403` response to the caller and, unlike `caller.capability_denied` (3.16, already audited from the same session that added `isCapabilityAllowed`), left no record on Parmana's own side that the attempt happened at all.

`isPrincipalAllowed` (`packages/api/src/auth/isPrincipalAllowed.ts`) itself remains a pure predicate, unchanged — it does not record anything. Both call sites own the audit: `packages/api/src/routes/execute.ts` and `packages/api/src/routes/transactions.ts` each call `recordCallerAuditEvent(auditSink, { type: "caller.principal_denied", ... })` immediately before returning `403`, the identical sequencing 3.16 already established for `caller.capability_denied` (audit write first, HTTP response second, never the reverse). Skipped only when caller-auth itself is disabled (no `req.callerId`), matching every other caller-scoping check's own no-caller-identity posture. In production, this audit write inherits 2.19's existing fail-closed guarantee: `recordCallerAuditEvent` (`packages/api/src/auth/recordCallerAuditEvent.ts`) means a `CallerAuditSink.record()` failure for this event fails the request (`503 AUDIT_UNAVAILABLE`) exactly as it would for any other caller-auth event, rather than silently letting the denial go unrecorded.

Evidence

- `packages/api/src/auth/CallerAuditSink.ts` (`caller.principal_denied` variant, `principalId` field — "the `authority.principalId` a caller attempted to assert but was not permitted to")
- `packages/api/src/routes/execute.ts`, `transactions.ts` (both call sites: `recordCallerAuditEvent` before the `403` response, immediately after `isPrincipalAllowed` returns `false`)
- `packages/api/src/auth/SupabaseCallerAuditSink.ts` (persists the new `principal` column)
- `supabase/migrations/20260816120000_add_principal_to_caller_audit_events.sql` (additive `principal` column; synced into `scripts/apply-all-migrations.sql`)
- `packages/api/tests/integration/caller-principal-scoping.integration.test.ts` (new, 6 tests): a scoped-in principal is allowed and no `caller.principal_denied` event is recorded; an out-of-scope principal is blocked with `403` before `application.execute()` is reached and a `caller.principal_denied` event is recorded carrying the asserted `principalId`/`callerId` and never the raw key; both `POST /execute` and `POST /transactions` covered identically
- `packages/api/tests/unit/supabase-caller-audit-sink.test.ts`, `packages/api/tests/integration/supabase-caller-audit-sink.integration.test.ts` (extended for the new column/event shape)

---

## 3.20 Structural Validation Rejection Audit Trail (G-29, Scoped)

Closes `docs/VERIFICATION-GAPS.md` G-29: before this capability, four admission-time rejection paths — a malformed or oversized request body, a malformed `businessTransactionId`, a structurally invalid Business Transaction (`BusinessTransactionValidationError`), and a duplicate `businessTransactionId` (`DuplicateBusinessTransactionError`) — returned the correct HTTP status (`400`/`409`/`413`) but produced no durable record of any kind, the one remaining rejection category in this codebase neither `RefusalRecord` (3.11, policy `REJECT`s) nor `CallerAuditSink` (2.16/2.19/3.16/3.19, caller-identity denials) covered. All four now write a signed `caller.structural_rejected` `CallerAuditEvent` (`packages/api/src/auth/CallerAuditSink.ts`), carrying `reason` and, when the request got far enough to have one, `businessTransactionId`.

**Two different audit disciplines, deliberately, matching where each rejection actually happens in the request pipeline:**

1. **The UUID-format check and the two errors thrown inside `application.execute()`** (`BusinessTransactionValidationError`, `DuplicateBusinessTransactionError`) all run inside `execute.ts`/`transactions.ts`'s route handler, mounted _after_ caller-auth middleware — the same layer 3.16/3.19's checks already run at. These reuse `recordCallerAuditEvent`'s existing fail-closed discipline (2.19) exactly: audited before the `400`/`409` response, and a write failure itself fails the request (`503 AUDIT_UNAVAILABLE`) rather than letting the rejection go unrecorded.
2. **Malformed/oversized request body** is rejected by `express.json()` itself, _before_ caller-auth middleware — or any route handler — ever runs (`app.ts`'s mounting order: `express.json()` at line 127, caller-auth at line ~172, both ahead of every route). There is no caller identity to protect the accountability of at this point, and `error-handler.ts` is a single-pass terminal middleware, not naturally positioned to fail the response closed the way a route handler can. This one path is therefore deliberately **fail-open**, mirroring RefusalRecord's own reasoning (3.11's first scope caveat) rather than 2.19's: the request is already correctly rejected either way, and failing the response closed on top of a correct `400`/`413` would trade it for an opaque `500` with no corresponding security gain. A write failure here is logged (`structural_rejection_audit_write_failed`), never thrown. `createErrorHandler(auditSink?)` (replacing the former plain `errorHandler` export) is how the audit sink reaches this one file; every other error branch in `error-handler.ts` is unaffected, since each of those is reached only via a route handler that already owns its own audit call.

`callerId` is therefore present on a `caller.structural_rejected` event exactly when caller-auth ran first and identified a caller before the structural check failed — populated for all three route-handler-level checks, absent for the pre-caller-auth malformed-body case.

Evidence

- `packages/api/src/auth/CallerAuditSink.ts` (`caller.structural_rejected` variant, `businessTransactionId` field)
- `packages/api/src/auth/SupabaseCallerAuditSink.ts` (persists the new `business_transaction_id` column)
- `packages/api/src/routes/execute.ts`, `transactions.ts` (UUID-format check: fail-closed audit before `400`; `catch` block around `application.execute()`: fail-closed audit for `BusinessTransactionValidationError`/`DuplicateBusinessTransactionError` before `next(error)`)
- `packages/api/src/middleware/error-handler.ts` (`createErrorHandler(auditSink?)`, `auditStructuralRejectionBestEffort` — fail-open, logs and swallows its own failure)
- `packages/api/src/app.ts` (threads `options.callerAuth.auditSink` into `createErrorHandler`, mirroring how `execute.ts`/`transactions.ts` are already threaded)
- `supabase/migrations/20260824090000_add_structural_rejected_to_caller_audit_events.sql` (widened `type` CHECK constraint; additive `business_transaction_id` column; synced into `scripts/apply-all-migrations.sql`)
- `packages/api/tests/integration/structural-validation-audit.integration.test.ts` (new, 9 tests): malformed `businessTransactionId` audited with the declared value and `callerId`, both `POST /execute` and `POST /transactions`; a non-string `businessTransactionId` leaves the field absent, not a garbage value; a mismatched `metadata.businessTransactionId` (`BusinessTransactionValidationError`) audited with its reason; a resubmitted `businessTransactionId` (`DuplicateBusinessTransactionError`) audited on the second call only, not the first, successful one; malformed JSON and an oversized body each audited with no `callerId` and no `businessTransactionId`; malformed JSON with caller-auth disabled still returns a correct `400` with nothing to assert on the audit side (no sink exists to write to); the valid path records no `caller.structural_rejected` event at all
- `packages/api/tests/unit/supabase-caller-audit-sink.test.ts` (extended, 2 new cases: the new column maps correctly with and without a known caller/businessTransactionId)
- Full repo `npx tsc -b`, `npx eslint . --ext .ts`, and `npm test` (`vitest run`) all clean: 1243 passed, 37 pre-existing skips, 0 failed — no regressions

---

## 3.21 Bulk/Compliance Export of Execution Trust Records (Scoped)

Closes `docs/VERIFICATION-GAPS.md` G-46: before this capability, no dedicated periodic full-export existed for external audit/compliance review. `GET /trust-records/:id` returns one signed record at a time by ID; `GET /transactions` lists raw `BusinessTransaction`s (no execution/verification/receipt/authorization history); neither is a reviewer-facing export path.

New `GET /trust-records` returns the complete signed Execution Trust Record (transaction, executions, verifications, receipts, and the signed execution authorization) for every transaction on the requested page, not just the raw transaction `GET /transactions` returns. Scoping and pagination deliberately mirror `GET /transactions`'s own established shape exactly: `page`/`pageSize` query params over the same underlying `BusinessTransactionService.list()`, the same post-fetch `submittedBy` ownership filter (an authenticated caller sees only their own transactions), and the same bare-array, no-pagination-envelope response shape. Adds `since`/`until` (ISO 8601) to filter by `transaction.createdAt`, for a bounded date-range export rather than requiring a caller to page through their entire history.

**Scope, precisely:** this is a request/response export over HTTP, not a scheduled/automated export job, a CSV or regulator-specific report format, or an admin-only bulk-dump distinct from the ownership scoping every other route in this codebase already applies. A caller sees exactly the Trust Records they would already be entitled to fetch one at a time via `GET /trust-records/:id`. This capability makes fetching many of them at once practical; it does not widen who can see what.

Evidence

- `packages/api/src/routes/trust-records.ts` (`GET /trust-records`)
- `packages/runtime/src/ExecutionTrustApplication.ts` (`listTrustRecords()`): paginates the existing `BusinessTransactionService.list()` and resolves each page entry via the existing `ExecutionTrustRecordRepository.findByTransactionId()`, deliberately not a new repository-level `list()` method, since every transaction has exactly one Trust Record and this avoids requiring every repository implementation (in-memory, Supabase, and any future one) to grow new query surface
- `openapi/openapi.yaml` (`operationId: listTrustRecords`), `schemas/responses/trust-records-list-response.schema.json`
- `packages/api/tests/unit/trust-record-api.test.ts`: 3 new cases (empty before any execution; the full record matches the `/execute` response's own `trustRecordId` after one; `since`/`until` date-range filtering)

---

## 3.22 Paytm Refund Connector: Remote, Out-of-Process Execution (Scoped)

`@parmana/connector-paytm` is a new, standalone workspace package, structurally parallel to `@parmana/connector-hubspot`/`@parmana/connector-github` (3.10/3.17) with one deliberate architectural difference from both: it is a **remote** connector. `GatewayHubSpotAdapter`/`GatewayGitHubAdapter` call the vendor's real API in-process, from inside this codebase; `GatewayPaytmAdapter` (`packages/execution-gateway/src/connector-execution/GatewayPaytmAdapter.ts`) never calls Paytm's own API at all — it forwards an already Parmana-authorized `paytm:refund` `ConnectorRequest` over HTTPS to a separate, trusted, out-of-process service (`parmana-paytm-agent`, `PAYTM_CONNECTOR_URL`), which is the only thing that ever holds a real Paytm merchant key or speaks Paytm's own checksum-authenticated wire protocol. This codebase never has access to, and never needs, that repository's source.

**Path enforced, both directions:**

```
AI Agent -> POST /execute -> customer-refund@1.0.0 policy -> APPROVED
  -> Execution Gateway -> GatewayPaytmAdapter -> HTTPS -> PAYTM_CONNECTOR_URL/connector/paytm-refund
  -> (parmana-paytm-agent, out of this repo's scope) -> Paytm /refund/apply

AI Agent -> POST /execute -> customer-refund@1.0.0 policy -> DENIED -> STOP
  (Paytm connector invocation count: 0)
```

The connector endpoint the remote service exposes is never `/execute` and never re-enters Parmana's own authorization path — there is no recursive-authorization loop by construction, since `GatewayPaytmAdapter` only ever originates one outbound HTTPS call per `execute()` invocation, to one fixed path.

**Two authentication layers, deliberately distinct, matching this milestone's own requirement not to conflate them:** (1) **Parmana authorization** — the existing, unmodified policy engine, `SignalIntentBinder` (`boundSignals: { "refundAmount": "parameters.amount" }`, `policies/customer-refund/1.0.0/policy.json`, pre-existing, unmodified by this milestone), `CapabilityPolicyBinder` (new binding, see below), and `SignedTokenConnectorAuthenticator`/`ExecutionControlService`'s existing session-credential machinery — decides whether a refund executes at all; nothing about Paytm's own API changes any of it. (2) **Transport authentication to the connector service** — `PAYTM_CONNECTOR_SHARED_SECRET`, sent as a Bearer token on the one HTTPS call `GatewayPaytmAdapter` makes, resolved through a dedicated `PaytmEnvironmentCredentialProvider` (`packages/api/src/bootstrap/createPaytmCredentialProvider.ts`) exactly like every other connector's credential. It authenticates Parmana's gateway to its own connector service; it is never Paytm's merchant key/checksum (which this codebase never holds) and never substitutes for (1). A caller cannot invoke Paytm directly under any authentication outcome of (2) alone — (1) always gates first, at `POST /execute`, before `GatewayPaytmAdapter` is ever reached.

**`GatewayPaytmAdapter`** is deny-by-default and fail-closed with the same discipline as 3.10/3.17: a request naming any parameter outside `PAYTM_ALLOWED_REFUND_PARAMETERS` (`orderId`, `transactionId`, `amount`, `refundReason`) is refused before any network call; HTTPS is required for `PAYTM_CONNECTOR_URL` outside `NODE_ENV=test`, enforced at construction (fails to even register, not merely at first request); the built-in test-mode placeholder secret (`PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET`) is refused outright against any non-local endpoint, present from this connector's first version (3.10's own "placeholder-credential guard, from day one" lesson); a non-2xx response or a timeout both fail closed. **Response-validation, novel to this connector because it is remote:** every identifying field the connector service echoes back (`businessTransactionId`, `capability`, `orderId`, `transactionId`) must match exactly what was sent, or the response is refused as a binding-validation failure — this connector never accepts a response at face value as proof it corresponds to the request that produced it, closing the "malformed connector response" / "misrouted or forged response" case this milestone's own review explicitly asked for.

**Correction (same session, after gaining access to the real `parmana-paytm-agent` repository):** this section originally described an invented `{businessTransactionId, capability, action, target, parameters}` wire request and a `completed`/`ambiguous`/`failed` response status enum, neither of which the real connector service implements. Verified against that repository's actual `POST /connector/paytm-refund` handler (`src/server/index.ts`, `executeAuthorizedConnectorRequest`), the real contract is a `{transaction: {businessTransactionId, intent: {action: "paytm-refund", target, parameters: {orderId, txnId, refId, amount}}}, authorization: {payload: {businessTransactionId, grantedCapability}}}` request envelope and a `{businessTransactionId, action, target, parameters, success, executedAt, metadata}` response — no status enum, only a boolean `success`. `GatewayPaytmAdapter`, `PaytmTypes.ts` (`connector-paytm`), `MockPaytmConnectorServer`, and all three Paytm test files were corrected to match this real contract before this document was updated; the earlier, incorrect version was never deployed or exercised against the real service. Parmana's own internal capability id stays the namespaced `paytm:refund` everywhere except the one outbound wire body, which uses the real service's hyphenated `"paytm-refund"` (`PAYTM_AGENT_WIRE_ACTION`).

**Idempotency, no second authoritative store introduced, and no ambiguous-status enum to lean on:** the real connector service does not derive `refId` itself and has no server-side idempotency store wired into this route (a `RefundIdempotencyStore` exists in that codebase but is unused there) — it is the _caller's_ responsibility to supply a stable `refId`. `GatewayPaytmAdapter` closes that gap: `deriveDeterministicPaytmRefId(orderId, transactionId)` (`connector-paytm/src/PaytmTypes.ts`) is a pure SHA-256-based hash, no `Date.now()`/`Math.random()`, so a retried request for the same `(orderId, transactionId)` always derives and sends the identical `refId`, regardless of Parmana's own `businessTransactionId` (which differs across distinct authorization attempts for the same logical refund). A non-success response (`success: false`, covering both a definite Paytm decline and anything less certain) is returned as a clean, non-throwing `ConnectorResponse` — never an exception, which upstream code could otherwise treat as transient and retry with a fresh `refId`. Replay protection for the Parmana side of a retry is the existing, unmodified nonce/trust-record machinery every other capability already relies on; this milestone adds no parallel transaction store.

**Capability and policy binding:** exactly one capability, `paytm:refund` (`PAYTM_REFUND_CAPABILITY`, `packages/connector-paytm/src/PaytmCapabilities.ts`) — no `paytm:*` wildcard, no other Paytm action. Bound in `CANONICAL_CAPABILITY_POLICY_BINDINGS` (`packages/capability-registry/src/CapabilityPolicyBinding.ts`) to `customer-refund@1.0.0` — a pre-existing policy this milestone did not need to modify (`policies/customer-refund/1.0.0/policy.json`: approves when `refundEligible`/`managerApproved`/`fraudCheckPassed` are all true and `refundAmount` (bound to `parameters.amount`) is at or below 10000; rejects an excessive amount, a failed fraud check, or anything else via an unconditional `reject-default` fallback). Not added to `INTENTIONALLY_UNBOUND_CAPABILITIES` — this milestone's own explicit instruction — so `assertConnectorCapabilitiesBound.ts`'s fail-closed startup guardrail actively protects it, exactly like `hubspot:*`/`github:*`.

**Trusted connector identity:** `paytm` / `spiffe://parmana/connectors/paytm-refund`, added to `createConnectorAuthenticator.ts`'s trusted-identity list passed into the existing, unmodified `SignedTokenConnectorAuthenticator` — the Paytm connector is subject to the exact same gateway-issued, signed-attestation authentication as every other connector; nothing about this milestone weakens or bypasses it.

**Startup configuration, fail-closed on partial configuration specifically (new failure mode this connector introduces, absent from 3.10/3.17 since HubSpot/GitHub's required variables have no analogous "must both be set or both unset" pairing):** `assertPaytmConnectorConfigured.ts`, called from `server.ts` alongside `assertStorageConfigured`/`assertSigningKeyMaterialConfigured`, refuses to start if exactly one of `PAYTM_CONNECTOR_URL`/`PAYTM_CONNECTOR_SHARED_SECRET` is set (never registers a connector that can authenticate but has nowhere to reach, or reaches somewhere but cannot authenticate), and refuses a non-HTTPS `PAYTM_CONNECTOR_URL` outside `NODE_ENV=test`. Neither set: the connector is simply not registered — the same fail-closed-absence shape 3.10/3.17 already established, never a startup crash for an unrelated deployment that has no Paytm integration at all.

**Test posture, in the order specified for this milestone:**

- **Hermetic first.** 51 unit tests, all passing, no network calls beyond localhost: `packages/connector-paytm/tests/unit/paytm-types.test.ts` (32 — credential-shape guard, one-way secret redaction never containing a literal substring, the deny-by-default parameter allowlist, `deriveDeterministicPaytmRefId`'s determinism/independence-from-businessTransactionId, `PaytmAgentRefundExecutionResult`'s shape guard across the real response fields and every malformed variant); `packages/execution-gateway/tests/unit/paytm-connector.test.ts` (19 — approved forward with the mock's own Paytm-invocation counter at exactly 1, the real wire contract's exact field names/action string, deny-by-default before any network call, capability mismatch, bad-credential-shape rejection, invalid connector authentication (401) with the mock's Paytm-invocation counter at exactly 0, non-2xx/timeout fail-closed, malformed-response rejection, response-binding-mismatch cases (top-level `businessTransactionId`/`action` and nested `parameters.orderId`/`parameters.txnId`), non-throwing `success: false` handling with the raw Paytm result code surfaced and no internal retry, same-`refId`-on-retry idempotency, secret redaction in both response metadata and thrown-error messages, the placeholder-credential guard, and the HTTPS-required-outside-test guard).
- **Policy-denial-makes-zero-calls, proven at the HTTP boundary**, mirroring 3.10/3.17's own "reads the mock server's/mock connector's state directly afterward" discipline exactly: `packages/api/tests/integration/paytm-refund.integration.test.ts` (6 tests) — Scenario B (an approved refund, `amount: 500`/`managerApproved: true`/`refundEligible: true`/`fraudCheckPassed: true`) reaches `POST /connector/paytm-refund` on the mock connector service exactly once; Scenario A (`amount: 50000`/`managerApproved: false`) is rejected with `403`/`POLICY_DENIED` with a `fetch`-spy-confirmed zero calls to the mock connector's base URL and the mock's own Paytm-invocation counter at `0`; an excessive-amount case and a failed-fraud-check case, both zero-call; the authorized-amount-vs-executed-amount binding-tamper case (`refundAmount: 500` declared against `parameters.amount: 50000` actually in the Intent) caught by the pre-existing, unmodified `SignalIntentBinder` before `PolicyEngine.evaluate` ever runs, zero-call; and the capability/policy substitution case (`paytm:refund` paired with `hubspot-deal-update/1.0.0`, a real, loadable policy with no `boundSignals` for it) caught by `CapabilityPolicyBinder`, zero-call. All six use the identical `customer-refund@1.0.0` policy reference — the different outcomes come entirely from the payload/signals, per this milestone's own explicit requirement.
- **No gated live suite exists this milestone**, honestly stated rather than glossed over: unlike 3.10/3.17's `ALLOW_LIVE_HUBSPOT`/`ALLOW_LIVE_GITHUB` suites, there is no `ALLOW_LIVE_PAYTM` suite, because this milestone has no reachable `parmana-paytm-agent` deployment to run it against. Building and running a live suite against a real deployment of that service is open work for whoever next has one reachable. **This does not mean that repository is unmaintained or unaudited — see the 2026-09-14 correction below.**

**Correction (2026-09-14, GAP-3 remediation — see `GAPS.md` and `docs/VERIFICATION-GAPS.md` G-43):** two claims above are now out of date, not because anything in this milestone's own scope was wrong, but because a real gap was found and closed in `parmana-paytm-agent` itself. Line-1913's "This codebase never has access to, and never needs, that repository's source" and line-1946's "that repository is out of this codebase's scope entirely" were both true as _architectural_ statements (this repository still never holds a Paytm merchant key and never calls Paytm's API directly) but were read, incorrectly, as implying that repository's own audit posture was permanently someone else's problem. An independent audit (GAPS.md, GAP-3) found `parmana-paytm-agent`'s `executeAuthorizedConnectorRequest` (`src/server/handler.ts`) recorded nothing — not even a console log — for either a successful or a rejected refund on its side of the trust boundary, despite already correctly verifying the Ed25519 authorization signature (ADR-0009 Phase 2B) before ever calling Paytm. Closed directly in that repository: `src/parmana/audit.ts` (new; `pg` is that repository's first-ever runtime dependency) now records `authorization.verified` immediately after signature verification succeeds, then `execution.completed`/`execution.rejected` after the Paytm call resolves — two rows, not one, so a crash between verification and execution remains visible rather than silently unrecorded. These rows land in the _same_ `execution_audit_events` table this codebase's own `SupabaseExecutionAuditSink` writes to (`packages/storage/src/supabase/SupabaseExecutionAuditSink.ts`, new — see §2.16 for the analogous durability fix already made to `CallerAuditSink`, and `docs/VERIFICATION-GAPS.md` G-42 for this side's own writeup), correlated by `businessTransactionId` — the one identifier both services actually share, since Parmana's own `authorizationId` is never forwarded across this wire boundary (see the correction two paragraphs above). `parmana-paytm-agent`'s rows are deliberately unsigned and unchained (`signature_json`/`chain_hash`/`chain_position` NULL): that service holds Parmana's public key only, never a private signing key. Verified: `parmana-paytm-agent`'s own test suite, 40/40 passing including 3 new cases asserting the exact event sequence and reasons recorded (success, verification-failure, and Paytm-decline paths); this repository's monorepo suite, 592/592 passing from repo root.

Evidence

- `packages/connector-paytm/src` (`PaytmCapabilities`, `PaytmMetadata`, `PaytmTypes`, `MockPaytmConnectorServer`) — passive capability/schema definitions and the hermetic connector-service stand-in
- `packages/execution-gateway/src/connector-execution/GatewayPaytmAdapter.ts`, `createGatewayPaytmConnector.ts` — the executable, remote-forwarding connector; added to `tests/unit/public-api-boundary.test.ts`'s "must not be exported from the public package entry" list alongside `GatewayHubSpotAdapter`/`GatewayHttpAdapter`
- `packages/connector-paytm/tests/unit/paytm-types.test.ts` (32), `packages/execution-gateway/tests/unit/paytm-connector.test.ts` (19) — 51 hermetic unit tests total
- `policies/customer-refund/1.0.0/policy.json` (pre-existing, unmodified)
- `packages/capability-registry/src/CapabilityPolicyBinding.ts` (`paytm:refund` -> `customer-refund@1.0.0`), `packages/capability-registry/tests/unit/CapabilityPolicyBinder.test.ts` (hand-maintained bound-capability set updated to include `paytm:refund`)
- `packages/api/src/bootstrap/createPaytmConnector.ts`, `createPaytmCredentialProvider.ts`, `assertPaytmConnectorConfigured.ts` (fail-closed partial-configuration guard, called from `server.ts`), `createConnectorRegistry.ts` (conditional registration, `PAYTM_CONNECTOR_TIMEOUT_MS`-derived per-registration timeout), `createConnectorAuthenticator.ts` (`paytm` / `spiffe://parmana/connectors/paytm-refund` added to the trusted connector identity list)
- `packages/api/tests/integration/paytm-refund.integration.test.ts` (6 tests): Scenario A/B, excessive-amount, failed-fraud-check, binding-tamper, and capability/policy-substitution cases, each zero-call-on-denial proven by both a `fetch` spy and the mock connector service's own call/invocation counters
- `docs/connectors/PAYTM_CONNECTOR.md` (architecture, environment variables, the two-authentication-layer distinction, denied/approved flow, replay/idempotency and ambiguous-status handling, audit trail, staging -> production setup)
- `.env.example` (`PAYTM_CONNECTOR_URL`, `PAYTM_CONNECTOR_SHARED_SECRET`, `PAYTM_CONNECTOR_TIMEOUT_MS`, `TEST_PAYTM_CONNECTOR_SHARED_SECRET`)
- **2026-09-14 audit-trail correction (GAP-1/GAP-3):** `packages/storage/src/supabase/SupabaseExecutionAuditSink.ts` (new), `supabase/migrations/20260914120000_add_execution_audit_events.sql`, `20260914130000_add_business_transaction_correlation_to_execution_audit_events.sql`, `20260914140000_add_authorization_verified_to_execution_audit_events.sql` (new), `packages/api/src/bootstrap/createExecutionAuditSink.ts` (updated), `packages/execution-control/src/types.ts`/`ExecutionControlService.ts` (`businessTransactionId` + `authorization.verified` type added) — this repository's side; `parmana-paytm-agent`'s own `src/parmana/audit.ts` (new) and `tests/unit/execute-authorized-connector-request.test.ts` (3 new cases) — that repository's side, out of this repo but directly modified and verified this session
- Full monorepo suite run this session (`npx vitest run`): all new tests passing; `npx tsc -b` clean.

**Scope, precisely:** one capability (`paytm:refund`) forwarding to one fixed remote endpoint (`POST /connector/paytm-refund`) on the configured connector service. Not in scope: any other Paytm API (charge, payout, settlement query), a webhook/event-driven confirmation path analogous to the historical Razorpay connector's (§3.8/§3.9), a `PaytmSignalStateVerifier` independently re-deriving `refundEligible`/`managerApproved`/`fraudCheckPassed` (`customer-refund/1.0.0`'s own `unboundSignalReasons` already document these as independent-system facts the Intent cannot express — no analogous "read capability" exists to re-verify them against, unlike HubSpot's deal-fetch), and — stated plainly, not glossed over — the actual `parmana-paytm-agent` service and its own idempotent-`refId`/checksum-verification implementation, which live entirely outside this repository and were not built, run, or verified by this milestone. What this milestone verifies is Parmana's side of the contract: it authorizes correctly, forwards exactly what was authorized and nothing else, validates what comes back before trusting it, and never calls anything when denied.

**Update (2026-09-27):** `paytm:refund` is now bound to `customer-refund` 1.1.0, and `managerApproved` is verified against a signed approval (2.42). The scenarios above that used 1.0.0 were moved to 1.1.0 in the same test file. `refundEligible` and `fraudCheckPassed` are still not re-derived.

**Correction (2026-09-28, G-70):** this section's claim holds for Parmana's side, and it does not make "Parmana calls Paytm once" true end to end. `parmana-paytm-agent` also exposes `/agent/refunds`, where an agent asks that service, which asks Parmana `POST /execute`. When Parmana approved, it released the refund through the path above, and then `/agent/refunds` called Paytm itself as well, with a different refId, so an approved refund could be paid twice. Possible before 2026-09-27 wherever `PAYTM_CONNECTOR_URL` pointed at the agent; dormant after, because the agent declared 1.0.0 and every refund was refused. Fixed in `parmana-paytm-agent` PR #6: `/agent/refunds` has no Paytm client and returns the Paytm result from the Trust Record's execution evidence. PR #6 was merged and deployed on 2026-09-28 (`8504b57`), and a refusal through the agent was verified in production. **Not claimed yet:** an approved refund observed live making exactly one Paytm call; that is covered by the agent's tests only. Also found (G-71): one refund per Paytm transaction can go through Parmana (the refId is derived from `orderId` and `transactionId` only), and `refundReason`, although allowed, is not sent to the connector service. **Fixed and deployed (G-71, 2026-09-28, Parmana #59 and agent #7; the agent sends its `refId` as the reference):** an optional `refundReference` Intent parameter makes the refId per refund (`deriveDeterministicPaytmRefId(orderId, transactionId, refundReference)`), with the old derivation unchanged when it is absent, and `refundReason` is sent to the connector service as `reason`, which passes it to Paytm. Verified by tests through `POST /execute` against the mock connector service; how Paytm itself answers a second refund of one transaction was not checked.

## 3.23 Listed as a TRACE External Evidence Source in the AgenTrust Integrations Repository (Scoped, 2026-10-12)

Parmana's signed records can be mapped to TRACE, AgenTrust's format for evidence about an agent execution, and that
mapping is listed in the AgenTrust integrations repository. [agentrust-io/integrations#294](https://github.com/agentrust-io/integrations/pull/294),
"Add Parmana as a TRACE external evidence source", was approved by an AgenTrust maintainer and merged into that
repository's `main` (merge commit `6de4cb9`) on 2026-10-12. It adds `integrations/parmana-server` (tier `community`,
integrates with `trace`) and a Parmana row to that repository's integration index.

**What was reviewed:** the maintainer re-ran the integration's 18 tests in a clean environment at `b5d91ec`, reproduced
the committed `fixtures/references.json` exactly with `examples/emit_references.py`, and checked that both key
fixtures are public keys only. The mapping follows the maintainer's answers in the review: Parmana is an external
evidence source with no TRACE conformance level; its own signatures are the evidence; `authorized-intent` and
`approval-outcome` references; refusals as their own unit. The evidence package on this side is
`docs/evaluation/agentrust-refund/README.md` (`npm run evaluate:agentrust-refund`).

**Scope, precisely:** a community listing of an evidence mapping, not a certification and not a conformance level.
The maintainer did not run `slsa-verifier` against an image. The fixtures come from the evaluation package, where
every connector result is a mock result and `refundEligible` and `fraudCheckPassed` are declared by the caller. The
integration code lives in the AgenTrust repository, not in this one; this repository holds the evaluation package that
produced its fixtures.

**Update (2026-10-13): Verified tier requested, not granted.** A follow-up PR from branch `parmana-verified` asks the
AgenTrust maintainers for the Verified tier, which they grant only after running an integration end to end against
released packages. It pins the released `parmana` SDK 1.6.0 (was 1.5.0) and adds exact reproduction steps; no code
changed. Run by us on a clean environment with released packages only: `references.json` reproduced byte for byte,
18 tests passed. Until a maintainer sets the tier, the listing stays `community`, and nothing here claims Verified.

**Update (2026-10-14): independently reproduced, tier change pending.** On the Verified request
([agentrust-io/integrations#313](https://github.com/agentrust-io/integrations/pull/313)), an AgenTrust maintainer approved
and reported reproducing it at `80c3a92` in a clean environment with the released `parmana` 1.6.0 and
`agentrust-trace` 0.11.0: `emit_references.py` printed the four references, `references.json` regenerated byte for
byte, and 18 tests passed. The maintainer stated that the tier change follows in a separate maintainer PR. Until that
PR is merged, the tier is `community`, and nothing here claims Verified. #313 itself was merged into AgenTrust's `main` as `1aac6c8` on 2026-10-14, still at tier `community`.

**Where the replay refusal is checked.** The `replay` case (the approval from `valid-approval`, sent again with a new request) is refused with HTTP 403 `POLICY_DENIED`, zero connector invocations, and a Refusal Record whose `matchedRuleId` is `signal-state-verification-violation`, with the reason `managerApproved=true != verified managerApproved=false`: the approval is spent, so its verified state is false. The same run is in the AgenTrust integration merged as [integrations#294](https://github.com/agentrust-io/integrations/pull/294) (commit `6de4cb9`):

- Fixture: [`fixtures/03-replay.refusal-record.json` line 46](https://github.com/agentrust-io/integrations/blob/6de4cb9/integrations/parmana-server/fixtures/03-replay.refusal-record.json#L46), `matchedRuleId`.
- Test: [`tests/test_parmana_evidence.py` line 131](https://github.com/agentrust-io/integrations/blob/6de4cb9/integrations/parmana-server/tests/test_parmana_evidence.py#L131), `replay` has zero connector invocations. Run with `pip install -e ".[test]"` and `python -m pytest tests` in `integrations/parmana-server`.
- Its README row for this file says "refused, already used" ([line 30](https://github.com/agentrust-io/integrations/blob/6de4cb9/integrations/parmana-server/README.md#L30)). That wording is not the rule the fixture records, so it is not used here.
- In this repository: `evaluations/agentrust-refund/fixtures/03-replay.refusal-record.json` (line 46) and `report.json`, case `replay`. That report is from the Paytm scenario at commit `ac22a7e` (2026-10-10), not the Razorpay demo.
- Test here: `packages/api/tests/integration/agentrust-refund-evaluation.integration.test.ts`, lines 294 to 297 and 314 to 316. Run with `npx vitest run packages/api/tests/integration/agentrust-refund-evaluation.integration.test.ts`.
- Live demo: `examples/razorpay-refund/send.ts --case replay` (README, request 4). It is not a hermetic test, and it needs the production key.

---

# Maturity Assessment (TRL)

This is the repo owner's own maturity assessment, layered on the evidence already cited above. It is not a new technical claim in the sense sections 2 and 3 use that word, and it does not carry its own separate test evidence — it is an interpretation of evidence that does.

**Historical**: Parmana reached **Technology Readiness Level 7** (system prototype demonstration in an operational environment) as of 2026-07-20, on the strength of §3.8/§3.9 — a real refund, a real Razorpay-initiated webhook delivery to a standing public endpoint, settled end to end, in both Razorpay test mode and live mode. That evidence is now historical (§3.8/§3.9 above, both marked "Historical: Razorpay connector removed 2026-08-12"; `docs/site/trust-and-claims/trl7-verification.mdx`; `docs/site/changelog.mdx`) — the connector was deliberately removed 2026-08-12, and TRL 7's defining element here (an external party closing the loop against a standing public deployment) has no current equivalent in this codebase.

**Current assessment, without relying on removed evidence: Technology Readiness Level 6** (system/subsystem model or prototype demonstration in a relevant environment). Basis: §3.10's HubSpot connector is proven correct against a real, relevant external system — HubSpot's actual production API, including a real, non-destructive read-nudge-revert mutation on a real account (§3.10's live suite, most recently confirmed 3/3 passing in an earlier session; not re-confirmed live in the most recent SDK-dogfooding pass — see that section's own caveat). What's missing relative to TRL 7: HubSpot's live proof runs through a locally-booted test server, not Parmana's actual public Fly deployment (no HubSpot deployment was ever documented in the deployment runbook), and HubSpot has no webhook — there is no case, current or historical, of an external party initiating a delivery against a standing Parmana public endpoint for HubSpot the way Razorpay's webhook did.

Not claimed by this assessment: sustained volume, load-bearing traffic, high availability, multi-tenant production operation, or any current standing-public-endpoint proof for any capability.

---

# 4. Future Claims (Pending Evidence)

The following claims are planned but are intentionally withheld until supported by implementation, testing, audit, and documented proof.

- [FUTURE] HubSpot Contacts and Companies objects: no implementation exists. The HubSpot connector (3.10) covers Deal `dealstage`/`amount` update only.

- [FUTURE] HubSpot deal delete/archive: no implementation exists; deny-by-default this milestone touches only `dealstage`/`amount` on existing deals.

- [FUTURE] HubSpot webhook/event-driven trigger: no implementation exists. This milestone is request-response only (`POST /execute` → connector PATCH); there is no asynchronous confirmation loop analogous to the webhook-receipt/settlement-closure mechanism the now-removed Razorpay connector had (see historical §3.8/§3.9; that mechanism took several scoped milestones to build for Razorpay while the connector existed, and none of that has been started for HubSpot, nor would it be, for a connector that no longer exists — the corrected pointer, replacing this item's own previously-broken `(3.5)`/`(3.6/3.7)` section references, which named sections that do not exist anywhere in this document).

- [FUTURE] Caller-auth enabled on the HubSpot and GitHub connector integration paths: not started for either. 3.16's caller-to-capability scoping mechanism is implemented and tested, but both connectors' integration tests construct their app with `callerAuth: "disabled"` and no `ApiKeyEntry` (`github-pr-merge.integration.test.ts`, `github-pr-merge-live.integration.test.ts`, same as HubSpot's), so neither `hubspot:deal-update` nor `github:pr-merge` — the capabilities actually reachable in production today (2.23's 2026-08-25 update) — is scoped by caller yet. This is the specific follow-on work that would make 3.16 meaningful for real CRM-moving and PR-merging traffic, not merely test fixtures. (Corrected 2026-08-25: this item previously named `hubspot:deal-update` as "the only capability actually reachable in production," missing `github:pr-merge`'s addition on 2026-08-19 — the same miscount §2.25's 2026-08-25 update and `docs/VERIFICATION-GAPS.md` G-30 trace in full.)

- [FUTURE] HubSpot multi-object transactions: no implementation exists; each `hubspot:deal-update` call is a single Deal PATCH, not a coordinated multi-object write.

- [FUTURE] HubSpot per-pipeline stage-transition configuration: `HUBSPOT_DEFAULT_STAGE_ORDER` (3.10) is one global stage order; `isHubSpotStageTransitionAllowed` accepts a `stageOrder` override but nothing wires it to a deal's actual `pipeline` property yet — see 3.10's "open decisions" for what this would take.

- [FUTURE] Stripe connector: no implementation exists; would implement @parmana/connector-sdk's Connector interface.

- [FUTURE] GitHub connector live verification: superseded by §3.17 — the connector itself is implemented, hermetically tested (22 unit + 4 integration tests), and wired into production. What remains open is a live run against a real GitHub App installation (the gated suite is written and confirmed to skip cleanly, but has not yet been run with real credentials in any session), and any capability beyond `github:pr-fetch`/`github:pr-merge` (review submission, comments, other object types, webhooks).

- [FUTURE] Salesforce connector: no implementation exists.

- [FUTURE] SAP connector: no implementation exists.

- [FUTURE] ServiceNow connector: no implementation exists.

- [FUTURE] Workday connector: no implementation exists.

- [FUTURE] Slack connector: **superseded (2026-10-11):** a Slack connector exists and is claimed in 2.44 and 2.47. What stays future: its use configured and observed in production.

- [FUTURE] Jira connector: no implementation exists.

- [FUTURE] Database connector: no implementation exists.

- [FUTURE] Cloud credential providers: HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, and Google Secret Manager CredentialProvider implementations. Only the CredentialProvider interface seam exists today (StaticCredentialProvider, EnvironmentCredentialProvider); no cloud SDK dependency has been added.

- [FUTURE] A customer running the self hosted deployment (recorded 2026-09-25, narrowed the same day): not claimed. The deployment itself, its one command start and enforcement with no internet route are now claimed, scoped, in 2.40, after a recorded offline run. What stays future: any customer, bank, fintech or government body running it, on its own infrastructure, with its own people approving its policies. Promote this only with a record from that deployment: its own start, decisions recorded in its audit trail, and Trust Records it produced verified with only its public keys.

- Every production Runtime enforces the canonical trust pipeline.

- Every production API request executes through the canonical runtime. **Reconciliation note (not a promotion — remains withheld pending whatever broader evidence standard this section applies):** Phase 3D's Property C bypass search (§5.2 of the Phase 3D independent authorization certification, in git history) traced every route `packages/api/src/app.ts` mounts and confirmed only `POST /execute` reaches `application.execute()`/`RuntimeEngine`; every other route is read-only, verification-only, or a passive audit sink that never calls `executionSystem.execute()` or any connector. This is direct, current evidence bearing on this specific claim, scoped to the routes and connectors that exist today — flagged here so it isn't lost, without this reconciliation pass itself deciding whether it now meets this section's bar for promotion to §2.

- Replay semantically verifies every trust artifact.

- Every guarantee is fully proven through conformance testing.

- Every guarantee includes complete independent verification evidence.

- A general, named credential-brokering _mechanism_ — a formal product capability letting an arbitrary future connector class (e.g. third-party cloud credentials via AWS STS, per the July roadmap, removed 2026-09-28) prove "AI never possesses execution credentials" without bespoke per-connector work — does not exist; only the `CredentialProvider`/session-credential-vault pattern each connector individually implements does. **Narrowed by Phase 3D (2.22/2.23):** for the connectors covered by that certification (Razorpay, HubSpot, at the time it was performed — Razorpay was removed from this codebase 2026-08-12, HubSpot remains the one production-reachable connector today), the underlying property this future item describes — the AI-facing `/execute` request path never comes into possession of the raw connector credential, which is resolved only after authorization is fully decided, confined to the connector-execution layer — was independently traced end-to-end and verified true (§3 of the Phase 3D independent authorization certification, in git history). What remains genuinely future is only the generalized, connector-class-agnostic mechanism, not the property itself for these two connectors. (Certification's own disclosed caveat, 2.23: a short, non-functional fingerprint of the credential, not the credential itself, reaches the caller-visible response — see 3.4/3.10.)

- Enterprise-grade key custody: current key storage is local PEM files read by FileKeyProvider; no KMS, HSM, or cloud key vault integration exists. **Narrowed (2026-09-15):** AWS KMS integration now exists and is verified end-to-end for the gateway signing key (see the 2026-09-15 update on the G-40 entry in this document, §3.22, and `docs/adr/ADR-0009-KMS-Secrets-And-Connector-Signature-Hardening.md`) — but it is not the default (`KEY_PROVIDER=local` remains the default; a deployment must explicitly opt into `KEY_PROVIDER=aws-kms`), production Vercel→AWS OIDC federation is not yet provisioned, and HSM/Azure Key Vault/GCP KMS remain entirely unimplemented. The "no KMS integration exists" framing above is accurate only for a default, unconfigured deployment.

- Authority, Intent, and Evidence verification checks in verification-service.ts. Only integrity, signature, and authorization binding are implemented today (2.15). The prior six-stage pipeline package (@parmana/verification) was retired in Session 5; it had no real implementation and no real test coverage; its stage architecture is not being resurrected. Authority/Intent/Evidence checks, if built, will be added directly to verification-service.ts. Tracked for Session 6.

- Algorithm migration: re-keying from one signature provider to another (for example Ed25519 to ML-DSA-65) while retaining the ability to verify previously-signed records. AuthorizationVerifier does not dispatch verification based on the envelope's algorithm field; a verifying process supports exactly one configured SIGNATURE_PROVIDER at a time.

- [FUTURE] `CRYPTO_MODE=hybrid` running anywhere in staging or production: the capability described in 3.13 is built and tested but not wired into any deployed environment. `PRIMARY_SIGNATURE_PROVIDER=ed25519` alone remains the configuration everywhere this codebase currently runs, including `parmana-api-live.fly.dev` (3.9).

These claims will be promoted to the Supported Technical Claims section only after the required evidence is complete.

---

# 5. Claims We Intentionally Do Not Make

Parmana intentionally avoids claims that exceed the available implementation evidence.

Examples include:

- Execution is impossible to bypass under all circumstances.

- Mathematical proof of execution correctness.

- Cryptographic proof of every aspect of runtime behavior.

- Guaranteed regulatory compliance.

- Absolute prevention of all unauthorized execution.

- Tamper-proof operation in every deployment environment.

- Elimination of all software defects or operational risks.

- "Non-bypassable" or "the single execution authority" as an unscoped, system-wide claim. Envelope verification (@parmana/envelope-verifier) is opt-in per receiving endpoint and enforces nothing at the network level; see Conditional Claim 3.1 for the scoped version of this claim that is actually supported.

- Deterministic signature output for post-quantum (ML-DSA-65) signing. ML-DSA-65 signatures are randomized by design: signing the same message twice with the same key produces two different, independently valid signatures. Only signature verification is deterministic. Determinism-of-output claims (2.8) apply to Ed25519 only.

- That a refused decision escalates to a person who can approve it. A refusal is final and nothing notifies anyone. People can review refusals in the Refusal Records (3.11), and a manager can sign an approval that lets a new request for a large refund run (2.42), and one approver key, `manager-charak1987`, is trusted in `TRUSTED_APPROVAL_ISSUERS` (`packages/api/src/bootstrap/createApprovalIssuerRegistry.ts`).

- That rule violations are structurally impossible, as an unscoped claim. The supported version: an action routed through Parmana does not execute unless the policy bound to it (2.22), approved through governance (2.35), approves it. An agent that holds its own credentials to a system is outside that, and a signal nothing verifies is only as true as the caller says (G-51).

- That enforcement adds no overhead. Each request adds policy evaluation, signing, a nonce check, storage writes and a network hop.

Such claims depend on deployment environments, operational controls, and assumptions beyond the scope of the reference implementation.

---

# Claim Lifecycle

Every technical claim follows the same lifecycle.

Idea

↓

Implementation

↓

Automated Tests

↓

Audit

↓

Documented Proof

↓

Public Claim

A claim SHOULD NOT be published before completing this lifecycle.

---

# Engineering Principle

Parmana favors evidence-backed engineering claims over marketing claims.

Every public technical claim should be traceable to:

- implementation

- automated tests

- audit evidence

- documented proofs

- independent verification (where applicable)

This discipline ensures that Parmana's public positioning remains aligned with its implementation and verifiable technical capabilities.

## 3.24 Policy Approval Scan and Governance UI Fail Closed (Scoped, 2026-10-15)

**Claim.** Two gates that decide whether a deployment or a human-facing tool can be trusted now fail closed instead of passing silently:

1. The full policy approval scan (`scripts/verify-policy-changes-approved.ts --full-scan`) reports failure when the policies directory cannot be read, and when it finds no policy files to check. A read error is no longer treated as an empty directory, so a scan can no longer pass having checked nothing.
2. The governance UI refuses an API base URL that would send its bearer key in clear text. `https://` is required. `http://` is accepted only for `localhost`, `127.0.0.1` and `[::1]` and only outside `NODE_ENV=production`. A URL that embeds credentials is refused.

**Evidence.**

- scripts/verify-policy-changes-approved.ts: `findAllPolicyFiles` no longer swallows `readdir` errors; `main` exits 1 when a full scan finds zero policy files.
- scripts/tests/verify-policy-full-scan.test.ts: lists policy files; rejects a missing policies directory.
- packages/governance-ui/src/config.ts: `assertSafeApiBaseUrl()`, called from `loadGovernanceUiConfig()`.
- packages/governance-ui/tests/unit/config.test.ts: https accepted; loopback http accepted outside production and refused in production; remote http refused; embedded credentials refused; non-URL refused.

**Limits.**

- The scan checks the files it can list. A policy file that is present, readable and not approved is still caught by the content-hash comparison, which this change does not alter.
- The governance UI check validates the URL's shape only. It does not check which host the URL names. Choosing the right API host remains an operator decision.
- Status: fixed on local branch `fix/policy-scan-and-governance-url` (commit `a8ac2961`). Not yet pushed or merged. See G-96 and G-97 in `docs/VERIFICATION-GAPS.md`.

## 3.25 Vercel Entry Applies the Startup Refusals; POST /transactions Binds metadata.tenantId (Scoped, 2026-10-15)

**Claim.** Two checks that already held on the other entry points now hold on every entry point:

1. The Vercel serverless entry (`api/index.ts`) refuses to serve when the Policy Governance integrity check finds a mismatch or cannot run, as `packages/api/src/server.ts` does, and it runs the Paytm connector HTTPS and consistency guard at startup. Previously it ran the periodic check fail-open and skipped the Paytm guard.
2. `POST /transactions` refuses a `metadata.tenantId` that the caller's key does not list, with `TENANT_NOT_ALLOWED`, as `POST /execute` already did. The tenant id selects the signing key (`tenant.<id>`), so an unchecked id let a caller have an authorization signed under another tenant's key.

**Evidence.**

- api/index.ts: `buildApp()` awaits `assertPolicyGovernanceIntegrityAtStartup()` before building the app. `assertPaytmConnectorConfigured()` runs at module load.
- packages/api/src/routes/transactions.ts: tenant check placed with the principal and capability checks, before `application.execute()`.
- packages/api/tests/integration/caller-capability-scoping.integration.test.ts: "POST /transactions" refuses a tenantId the key does not list.
- `packages/api` test suite: 698 passed, 36 skipped.

**Limits.**

- In a serverless function a process exit is not available. A mismatch makes every request fail with a 500 rather than refusing the process. The failed build is retried on the next request, so each request re-runs the check until the mismatch is fixed.
- The entry imported `runPolicyGovernanceIntegrityCheckAtStartup` from `packages/api/dist`, a module with no source in `packages/api/src`. The import now points at the module the source builds.
- Status: fixed on branch `fix/policy-scan-and-governance-url`. See G-98 and G-99 in `docs/VERIFICATION-GAPS.md`.

## 3.26 Audit Follow-up: Connector Endpoints, Client Guards, Strict Results and Smaller Leaks (Scoped, 2026-10-15)

**Claim.** The following hold on the current branch. Each was reported by the 2026-10-15 read-only audit and checked against the code before it was fixed.

1. Connector base-URL overrides (`HUBSPOT_BASE_URL`, `GITHUB_BASE_URL`, `SLACK_BASE_URL`) must use `https://`, or `http://` for loopback. Embedded credentials are refused. The GitHub credential provider applies the same rule.
2. A GitHub or HubSpot response with a 2xx status and a body that is not JSON fails the action. It is no longer recorded as success with empty evidence.
3. A step-up envelope whose `authorizedAt` is more than 60 seconds in the future is not valid. Previously only the expiry was checked.
4. The TypeScript SDK refuses an endpoint that is not `https://` (or loopback `http://`) and refuses embedded credentials, as the Python SDK already did. Its client no longer prints the API key in `console.log` or `JSON.stringify`.
5. The TypeScript and Python SDKs percent-encode the business transaction id in every path segment, so `../` or `?` cannot re-route a request made with the caller's key.
6. The TypeScript and Python SDKs return the server's `valid` only when it is the boolean `true`. A string `"false"` is not accepted.
7. The Python connector SDK `CredentialHandle` omits its value from `repr`.
8. `GET /ready` returns "storage unavailable" to the public. The database error text goes to the server log only.
9. The governance UI's API calls time out after 10 seconds.
10. `scripts/verify-policy-changes-approved.ts` scans the directory `PARMANA_POLICY_DIR` names, as CI sets it, and walks symlinked directories, since the runtime follows them.
11. Scripts with a `main()` entry point run it unless vitest is running (`VITEST` set). They no longer depend on `NODE_ENV`, so a `NODE_ENV=test` line in a committed `.env` cannot switch the policy gate off.
12. `scripts/rotate-caller-key.mjs` validates `--caller-id` with the key-id allowlist, so `../` cannot write outside the secrets directory.
13. `scripts/generate-fly-secrets.mjs` refuses to run when `secrets.env` exists unless `--force` is passed, since a re-run would replace the signing keys.
14. `rate_limit_counters` has row level security enabled with no policy, so the Supabase Data API's anon and authenticated roles get no access. The application connects as the table owner and is unaffected.
15. The Razorpay example's error path no longer says "endpoint misconfigured" for a failure that can come after Razorpay created the refund. It reports the outcome as unknown.
16. The runtime's `replay()` is documented as an integrity re-verification, not a re-run of the decision.

**Evidence.**

- Connector guard: `packages/api/src/bootstrap/readConnectorBaseUrl.ts`, used by the three connector factories and the GitHub credential provider.
- Non-JSON 2xx: `packages/execution-gateway/src/connector-execution/GatewayHubSpotAdapter.ts`, `GatewayGitHubAdapter.ts`.
- Step-up: `packages/crypto/src/PolicyChangeStepUpAuthorizationCrypto.ts`, `STEP_UP_CLOCK_SKEW_MS`.
- TypeScript SDK: `typescript/src/config/assertSafeEndpoint.ts`, `typescript/test/EndpointGuard.test.ts`; `typescript/src/client/ParmanaClient.ts`.
- Path encoding and `valid`: `typescript/src/client/*.ts`, `python/parmana/api/*.py`.
- Test results: `packages/api` 698 passed; `packages/crypto`, `packages/execution-gateway`, `packages/runtime`, `packages/shared`, `packages/storage`, `packages/policy`, `packages/approval`, connector packages and root `tests` all passed, except the two generated-file checks, which were regenerated; the Python SDK 190 passed; the Python connector SDK 34 passed; the TypeScript SDK's new endpoint test passed. Eight TypeScript SDK test files fail to load with "No test suite found" both with and without these changes; that is a pre-existing problem with the SDK's test setup, not this change.

**Limits.** Items that change the signed evidence format, add a policy flag, or need an outside check are not in this claim. They are listed in `docs/REMAINING-WORK.md` section N.
