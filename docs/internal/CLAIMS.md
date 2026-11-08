# Parmana Technical Claims

Version: 1.0

Status: Public 1.0

---

# Key Compromise Notice

The default signing key (`keys/default.private.pem` / `keys/default.public.pem`) was publicly exposed in a Parmana Systems GitHub repository prior to 2026-07-05 (incident record: `04-INCIDENTS-LOG.md`, INC-1). This repository's own commit history does not carry that exposure (no `.pem` private key was ever committed here), but the key itself must still be treated as permanently compromised regardless of which repository exposed it.

All signatures produced by that key are void for authenticity purposes, regardless of when the signed artifact was created.

The key pair was rotated on 2026-07-05.

---

> Building a new connector? Read [BUILDING_A_CONNECTOR.md](connectors/BUILDING_A_CONNECTOR.md) first: the files to add, credential guards, bound signals, test order and reversible live tests.

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

**Update (2026-11-07, G-157).** A request must send every fact the policy's rules depend on. If a rule's outcome depends on a fact the request did not send, the decision is REJECT with `matchedRuleId: "missing-fact"`, and its reason names the missing facts. A rule that matches, or that does not read the missing fact, is decided as before. Every decision names the method that produced its verdict and that method's version: `evaluationMethod: { id: "deterministic-rules", version: "2" }`, set from `POLICY_EVALUATION_METHOD` in `packages/policy`. The version is `"2"` from this change; it was `"1"` from 2026-11-05 (G-148). The inputs are recorded with the verdict as `signals`. Decisions recorded before 2026-11-05 have no `evaluationMethod`. Decisions recorded at `"1"` for requests that omitted a fact may replay to a different verdict (G-160). Replay rule: a version 1 verdict is checked against its recorded signals under the rules that produced it, not under version 2. Those approvals are kept as recorded.

Parmana deterministically evaluates business policies using sequential rule evaluation with first-match semantics.

Evaluation records include:

- matched rule

- decision reason

- evaluation trace

Evidence

- PolicyEngine (`packages/policy/src/PolicyEngine.ts`)
- Missing-fact tests (`packages/policy/tests/unit/PolicyEngine.missing-fact.test.ts`)

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

- ExecutionComponent, ExecutionEvidenceBuilder (packages/runtime/src/{components/ExecutionComponent,ExecutionEvidenceBuilder}.ts) — the live pipeline stage that builds and attaches ExecutionEvidence to every Execution, called by RuntimeFactory-constructed Runtimes; not to be confused with ExecutionEvidenceComponent, a same-named-in-spirit stub confirmed unwired and deleted (docs/internal/VERIFICATION-GAPS.md G-26)

- ReceiptService (packages/runtime/src/services/receipt-service.ts), called directly by ExecutionTrustApplication.execute() on every successful execution

- VerificationCrypto

- ReceiptCrypto

- packages/runtime/tests/integration/receipt.integration.test.ts, receipt-hybrid.integration.test.ts

**Structured decision trace (2026-09-15, docs/internal/VERIFICATION-GAPS.md G-44).** The signed
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
locally-running instance (see docs/internal/VERIFICATION-GAPS.md G-44).

**Vendor-confirmation visibility (2026-09-15, docs/internal/VERIFICATION-GAPS.md G-46).**
`ConnectorEvidence` (packages/execution-gateway/src/connector-execution/ConnectorEvidence.ts)
gained `vendorConfirmationVerified: boolean`, defaulting to `false` and folded into
`connectorEvidenceHash`. Confirmed by grep before adding it: no connector in this codebase independently verifies a vendor-originated cryptographic confirmation. This makes that architectural limitation
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

**Scope note (2026-10-27):** single use prevents a second external effect. A replay of an authorization whose execution completed returns the recorded result, and the connector is not called again. A replay while the first attempt is in flight, or after it stopped without recording completion, is refused as unknown (`OUTCOME_UNKNOWN`). Recording covers the gateway path. Known gaps, such as a failure before the connector runs on the `executionControl` path, are listed in `docs/internal/VERIFICATION-GAPS.md` G-125. Part 1 is implemented; provider idempotency keys and reconciliation are not yet built.

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

**Claim.** The signing algorithm can be set to ML-DSA-65 (FIPS 204) as an alternative to Ed25519, through `PRIMARY_SIGNATURE_PROVIDER` (and `SECONDARY_SIGNATURE_PROVIDER` for hybrid signing). The `ml-dsa-65` name is accepted as an alias for the internal identifier `dilithium3`, which is kept unchanged for existing deployments.

**Scope.** Selecting ML-DSA-65 uses the same PEM key mechanism as the default Ed25519 provider (`FileKeyProvider`, key ID `default`). It requires Node.js 24 or later, for native `ml-dsa-65` support in `node:crypto`. Missing or mismatched key material fails closed: the process does not generate a replacement key or substitute another one.

**Crypto agility.** The same canonical record can be signed and verified by Ed25519 and by ML-DSA-65 as two separate single-algorithm operations, each with its own key pair, and with no hybrid envelope involved. `packages/crypto/examples/crypto-agility-proof.ts` runs this check by hand (`npx tsx packages/crypto/examples/crypto-agility-proof.ts`).

**Independent verification.** An offline verifier for the signed records is in `packages/crypto/src/OfflineVerifier.ts`, with a Python counterpart. The public keys are served at `GET /keys/:keyId` and `GET /.well-known/jwks.json`. Key IDs for verification can be rotated with `PARMANA_VERIFICATION_KEY_ID` and `PARMANA_VERIFICATION_SECONDARY_KEY_ID`. With `HYBRID_SIGNATURE_REQUIRED=true`, a hybrid record whose ML-DSA-65 signature is missing is refused rather than accepted as Ed25519-only.

**Limits.** As of 2026-10-20, production runs `CRYPTO_MODE=single`, so its records carry only the Ed25519 signature. No deployment was running hybrid signing on that date, and no live hybrid record had been verified through the API. Enabling hybrid signing in production is an operator decision that depends on key material (G-119 in `docs/internal/VERIFICATION-GAPS.md`). The statements above describe what is built and tested, not what runs in production.

Evidence

- `Dilithium3SignatureProvider`
- `FileKeyProvider`
- `scripts/generate-keypair.ts` (`--algorithm dilithium3` or `ml-dsa-65`)
- `packages/crypto/tests/unit/dilithium3-signature-provider.test.ts`
- `packages/crypto/tests/unit/dilithium3-cross-instance.test.ts`
- `packages/crypto/examples/crypto-agility-proof.ts`
- `packages/crypto/src/OfflineVerifier.ts`

Dated updates for this claim are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.15 Authorization-Binding Verification

Every APPROVED execution in a verified Execution Trust Record must carry a non-empty authorizationId in its metadata; absence fails verification and names the execution. REJECTED-decision executions are not required to carry one. All checks (integrity, signature, authorization binding) run unconditionally and independently: a single failure never suppresses reporting of the others.

Evidence

- VerificationService (packages/runtime/src/services/verification-service.ts)

- packages/runtime/tests/unit/verification-service.test.ts: all 8 cases

- packages/runtime/tests/unit/verification-negative.test.ts: always-running, in-memory: fails on a mutated transaction payload field, a mutated signature value, and a mutated executions hash-chain-array element

- packages/api/tests/integration/verification-negative.integration.test.ts: "reports FAILED when the persisted record is tampered after execution" (additional citation; Supabase-gated, does not run without live credentials)

---

## 2.16 Caller Authentication at the API Boundary

Every route requires a valid caller credential, except a short list of routes that are public on purpose.

**Public routes.** These routes need no credential:

- Probes and documentation: `/health`, `/ready`, `/openapi.yaml`, `/openapi.json`, `/api-manifest.json`, `/documentation`, and `/reference`.
- Third-party verification: `POST /refusal/verify`, `POST /audit/verify`, and `POST /execution-intents/verify`. Each checks a signature from the request body and reads no caller data.
- Public-key discovery: `GET /keys/:keyId` and `GET /.well-known/jwks.json`, so that a third party can verify a signature without holding a Parmana credential.
- Handbook download: `/handbook`, which captures a download lead from a visitor who has no credential.

The verification, key-discovery and handbook routes are rate limited.

Every other route, including `/` and `/version`, sits behind caller authentication.

**Fails closed.** `createApp` requires its `callerAuth` option. The option is either an authenticator with an audit sink, or the string `"disabled"`, so every call site says which it means. There is no default that silently disables authentication.

**Startup refusal.** `createCallerAuthenticator.ts` refuses to start when no caller keys are configured, unless `PARMANA_AUTH_DISABLED=true` is set explicitly.

**Revocation takes effect on the next request.** Each request checks the revocation store (`caller_key_revocations`, which holds only the SHA-256 hash of each revoked key). A revoked key is refused without a restart. A store error counts as revoked, so the request is refused. The interface has a revoke operation and no un-revoke operation.

**Identity and audit.** A key that is valid for one caller does not establish another caller's identity. Every accept and reject outcome is audited, and the audit record never holds the raw key. In production the audit sink writes to the `caller_audit_events` Postgres table through `DATABASE_URL`. It fails closed at startup when `DATABASE_URL` is not set, rather than falling back to memory. `InMemoryCallerAuditSink` is for tests only.

**Scope of `PARMANA_AUTH_DISABLED=true`.** When set, this flag removes caller identity and accountability. It does not change action-level authorization. The runtime, the policy engine, the capability policy binder and the signal verifiers never read the caller's identity, so each capability is still checked against its policy. The flag affects only knowing who asked.

**Observability.** While the flag is set, `GET /ready` returns `authDisabled: true` with a warning, as well as logging a line at startup. When the flag is not set, `authDisabled` is `false` and no warning is returned.

**Scope and limits.**

- Public routes are unauthenticated by design. Their rate limits, not authentication, protect them.

**Evidence.**

- `packages/api/src/app.ts` (the public routes, the required `callerAuth` option, the rate limits on the public routes)
- `packages/api/src/bootstrap/createCallerAuthenticator.ts` (the startup refusal)
- `packages/api/src/auth/StaticKeyAuthenticator.ts` (revocation check, fail closed on a store error)
- `packages/shared/src/repositories/caller-key-revocation-repository.ts` (the revoke and lookup interface)
- `supabase/migrations/20261030120000_add_caller_key_revocations.sql` (the table; holds hashes only)
- `packages/api/src/bootstrap/createCallerAuditSink.ts` and `assertDatabaseUrlConfigured.ts` (production wiring, fails closed without `DATABASE_URL`)
- `packages/api/src/auth/InMemoryCallerAuditSink.ts`
- `packages/api/src/routes/ready.ts` (the `authDisabled` field and warning)
- `packages/api/tests/integration/caller-auth.integration.test.ts` (valid, missing and invalid credentials, scoping, revocation, audit content never holds the raw key, the route inventory)
- `packages/api/tests/integration/supabase-caller-audit-sink.integration.test.ts` (a recorded event is read back through a second client)
- `packages/api/tests/unit/bootstrap/create-caller-authenticator.test.ts`
- `packages/api/tests/unit/routes/ready.test.ts` (`authDisabled` true with a warning, and false without one)

Dated updates, including the change to the example configuration and the earlier revocation gap, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

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

Two behaviours protect the key layer. First, a key identifier cannot be used to escape the key directory. Second, a configured key custody model that is not implemented fails at startup rather than falling back silently.

**Path traversal is refused.** `FileKeyProvider` rejects any key ID that does not match `^[A-Za-z0-9._-]+$` before it builds a file path from it. A crafted key ID such as `../` is refused before the filesystem is touched.

**Unimplemented custody is refused.** `KEY_PROVIDER` accepts `local`, `aws-kms`, `azure-key-vault`, `gcp-kms`, and `hsm`. Only two of these have an implementation:

- `local` uses `FileKeyProvider`, which reads keys from `PARMANA_KEY_DIR`.
- `aws-kms` uses `KmsSigner` (ADR-0009) for signing. `SignerBootstrap.create()` resolves it.

`SignerBootstrap.create()` throws at startup for `azure-key-vault`, `gcp-kms`, and `hsm`, and names the value. The older `KeyBootstrap.create()` throws for every value other than `local`. No value of `KEY_PROVIDER` makes Parmana fall back to file-based keys without saying so.

**The AWS KMS signer maps key IDs safely.** `KmsSigner` turns a logical key ID into a KMS alias. A bare ID such as `default` becomes `alias/default`, and a dotted tenant ID such as `tenant.acme` becomes `alias/tenant/acme`, because KMS alias names cannot contain dots. It refuses any ID that would land under AWS's reserved `alias/aws/` prefix. It refuses a full key ARN, because an ARN can name a key in another AWS account. It treats a UUID-shaped ID as an alias name in the configured account, never as a raw key ID.

**Credentials.** `KmsSigner` uses no static AWS access keys. When `AWS_ROLE_ARN` is set, it exchanges Vercel's OIDC token for short-lived credentials. Whether that role is provisioned in a given deployment is an operator step, and this claim does not verify it.

**Scope and limits.**

- Azure Key Vault, GCP KMS, and HSM are not implemented. Configuring any of them fails at startup.
- The path check covers the file-based provider only. It does not check the KMS key ID beyond the rules above.
- Each refusal is covered by a test case, and the bootstrap tests check each non-local value.

**Evidence.**

- `packages/crypto/src/providers/key/FileKeyProvider.ts` (`assertValidKeyId`)
- `packages/crypto/tests/unit/file-key-provider.test.ts` (path-traversal key IDs rejected in `getPrivateKey`, `getPublicKey`, and `hasKey`)
- `packages/crypto/src/SignerBootstrap.ts` (`aws-kms` resolves `KmsSigner`; other non-local values throw)
- `packages/crypto/tests/unit/signer-bootstrap.test.ts`
- `packages/crypto/src/KeyBootstrap.ts` (throws for any value other than `local`)
- `packages/crypto/tests/unit/key-bootstrap.test.ts` (refusal for each non-local value)
- `packages/crypto/src/providers/signer/KmsSigner.ts` (key ID mapping, ARN and reserved-prefix refusal, `AWS_ROLE_ARN` exchange)
- `packages/crypto/tests/unit/kms-signer.test.ts` (key ID mapping cases, signing, public key, metadata, caching)
- `packages/shared/src/config/KeyProviders.ts` (the accepted values)

Dated updates, including the 2026 fix that made `KmsSigner` map key IDs to aliases and the live check against a real AWS KMS key, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

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

**Scope note (`docs/internal/VERIFICATION-GAPS.md` G-29, RESOLVED):** this claim is about the correctness of the rejection — the transaction is never lost, corrupted, or double-accepted; that remains exactly as stated above. A duplicate-ID submission's rejection _attempt_ is now also durably audited (§3.20, `caller.structural_rejected`) — G-29 originally found, and this note originally documented, that it was not.

Evidence

- packages/storage/src/memory/MemoryBusinessTransactionRepository.ts

- packages/storage/src/supabase/SupabaseBusinessTransactionRepository.ts (isUniqueViolation mapping)

- packages/shared/src/errors/duplicate-business-transaction-error.ts

- packages/storage/tests/unit/memory-business-transaction-repository.test.ts: two simultaneous `create()` calls with the same id and different content: exactly one succeeds, the other rejects with `DuplicateBusinessTransactionError`, and the stored record is exactly the winner's

- packages/storage/tests/unit/business-transaction-repository-duplicate-consistency.test.ts: both repository implementations throw the identical error class and message for a duplicate

- packages/storage/tests/integration/supabase-business-transaction-duplicate.integration.test.ts: the same concurrent-race proof against a real Postgres database (Supabase-gated)

---

## 2.21 Distinguishable HTTP Status for Policy Denial and Replay

Three failures return three different responses, so a caller can tell them apart:

- A policy `REJECTED` decision returns `HTTP 403` with `code: "POLICY_DENIED"`.
- An execution request whose authorization was already consumed returns `HTTP 409` with `code: "NONCE_ALREADY_CONSUMED"`. This is raised only when every other gateway check passed, or was not applicable, and only the nonce check failed.
- Any other gateway verification failure, such as a forged signature, an expired envelope or tampered content, returns a plain, uncoded error with `HTTP 500`.

Only the status code and response body change. The authorization logic and the underlying checks are unchanged.

**Scope.**

- The `409` replay path is reached today only when a caller invokes `@parmana/execution-gateway`'s `ExecutionGateway.execute()` directly with an already-consumed authorization.
- It is not reached through `POST /execute` or `POST /transactions`. A resubmitted `businessTransactionId` is refused earlier, with the `409` `DuplicateBusinessTransactionError` described in 2.20. That refusal happens before the runtime, policy evaluation or the gateway run.
- The `403` `POLICY_DENIED` response is returned through the HTTP API.

**Evidence.**

- `packages/runtime/src/ExecutionGate.ts` (`RuntimeError` with `status: 403` and `code: "POLICY_DENIED"`)
- `packages/shared/src/errors/nonce-already-consumed-error.ts` (`NonceAlreadyConsumedError`, `status: 409`, `code: "NONCE_ALREADY_CONSUMED"`)
- `packages/execution-gateway/src/ExecutionGateway.ts` (`isSoleFailureNonceReplay` decides when to throw `NonceAlreadyConsumedError`; any other combination of failed checks throws the unchanged uncoded `Error`)
- `packages/api/src/middleware/error-handler.ts` (the `NonceAlreadyConsumedError` branch, and the `RuntimeError` branch that reads `status` and `code`)
- `packages/execution-gateway/tests/unit/execution-gateway.test.ts` and `execution-gateway.dilithium3.test.ts` (a replayed request is rejected without being released twice, as `NonceAlreadyConsumedError` with status 409)
- `packages/runtime/tests/unit/execution-authorization-wiring.test.ts` ("rejected transaction produces no authorization")
- `packages/api/tests/integration/caller-auth.integration.test.ts` (a policy-rejected transaction through `POST /execute` returns 403 with `POLICY_DENIED`)
- `typescript/src/transport/mapHttpErrorResponse.ts` and `typescript/test/Errors.test.ts`, `HttpTransport.test.ts` (the TypeScript SDK maps `POLICY_DENIED` to `ExecutionRejectedError`, ahead of the generic 403 mapping)
- `examples/tutorials/102-distinguishable-http-status/run.ts` (all three failure shapes side by side)

Dated updates, including the removal of the connector tests that once also covered this path, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.22 Canonical Capability-to-Policy Binding

**Claim.** Each capability in the canonical table is governed by one policy name, fixed by the table. The caller cannot choose a different policy for it. A request that pairs a bound capability with any other policy is refused as a policy denial, before any rule is evaluated.

**Why it matters.** Policies are loaded by the name and version the request declares. Without the binding, a caller could pair a capability that changes real state with an unrelated policy that does not protect it, and run that capability's parameters under the weaker rules. The binding closes that route.

**Scope.** The table (`CANONICAL_CAPABILITY_POLICY_BINDINGS`) binds no capability in this version, because every built in connector has moved out of core (ADR-0018). The mechanism applies to any capability added to the table later. Reads have their own policy, so that each approval covers only what it reads. The table pins the policy name. Where policy governance is enforced, the version is the one most recently approved for that name (see 2.43).

**Where it runs.** `CapabilityPolicyBinder` is in `packages/capability-registry`. `RuntimeBuilder` constructs it on every build and passes it to the runtime engine, which runs the check before signal binding and policy evaluation.

**Connectors.** Core no longer registers the vendor connectors for these capabilities. They are moving to the `parmana-connectors` repository (ADR-0018, still being migrated). The table stays in core, so a request for one of these capabilities is still checked against its policy name.

Evidence

- `packages/capability-registry/src/CapabilityPolicyBinding.ts`
- `packages/runtime/src/RuntimeBuilder.ts` (the binder is always constructed and passed to the engine)
- `packages/runtime/src/RuntimeEngine.ts` (the binder check runs before signal binding and policy evaluation)
- `packages/capability-registry/tests/unit/` (the binder's tests)

Dated updates for this claim are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.45 Approver Keys Are Added and Revoked Through Maker Checker, With No Deploy (Scoped, 2026-09-29)

**Claim:** a key trusted to sign approvals can be added or revoked without a code change or deploy, and only when one human credential proposes it and a different human credential approves it with a step up authorization.

**Backed by:** `packages/api/src/routes/approval-issuers.ts` (human callers only, maker is not checker, step up on approve and reject, shared with policy changes in `auth/governanceGuards.ts`); migration `20260929120000_add_approval_issuers.sql` (check constraints: maker is not checker, an add carries a key, a key is revoked only with a change behind it; one open change per key); `SupabaseApprovalIssuerRepository.approveChange` (locks the change, applies it and resolves it in one transaction); `GovernedApprovalIssuerRegistry` (code list first, then the table on every approval, fails closed on a read error). Tests: `approval-issuers-governance.integration.test.ts` (through the HTTP boundary, including a refund authorized with a newly added key and refused after its revocation), `governed-approval-issuer-registry.test.ts`, and `supabase-approval-issuer-repository.integration.test.ts` against real Postgres in the Docker image workflow (including two concurrent approvals of one change).

**Scope:** distinct credentials, not proven distinct people. Keys listed in code still change only by deploy. An operator with database access can bypass the API. Not live until the migration is applied in production.

## 2.46 An Approver Is Notified When a Request Waits Only for Their Approval

**Claim.** When a request is refused only because a signed approval is missing, Parmana can notify an approver. It sends one `approval.needed` event that names what to sign. A failed notification never changes the refusal.

**Behaviour.**

- The engine notifies only after a refusal by the policy's own rules, or by an approval that did not verify. It does not notify for a binding, governance or business-validation failure, because an approval cannot cure those.
- The event is sent only when the same policy, evaluated with the declared approval signals set to true, would approve. The check is `findNeededApprovals`.
- The event carries the business transaction, the decision, the action, the target, the policy and version, the reason, the submitting caller when known, and the approvals needed.
- Delivery is best effort: one attempt, no retry. Any error is logged and never rethrown.

**Webhook.** Set `APPROVAL_WEBHOOK_URL` and `APPROVAL_WEBHOOK_SECRET`. The URL must be `https` outside `test` and `development`. Requests do not follow redirects and time out after 3 seconds. Each request is signed with HMAC SHA256 over `<timestamp>.<body>`, keyed with the secret, and sent in the `parmana-webhook-signature` header.

**Email.** Set `APPROVAL_EMAIL_TO` to send the same event by email through Resend, alone or alongside the webhook. Each refusal uses one idempotency key, `approval-needed/<decisionId>`. The sender address must be on a domain verified in Resend.

**Scope and limits.**

- Notification is advisory. It does not approve anything, and a receiver that ignores it changes nothing.
- No test in this repository runs the engine path end to end. The unit tests cover the finder and the bootstrap wiring. The claim about when the engine notifies is stated from the code.

**Evidence.**

- `packages/runtime/src/ApprovalNeededNotifier.ts` (`findNeededApprovals`, the event shape)
- `packages/runtime/src/RuntimeEngine.ts` (`notifyApprovalNeeded` and its conditions; errors logged, not rethrown)
- `packages/runtime/tests/unit/findNeededApprovals.test.ts` (names the approval when it is the only thing missing; undefined when another rule refuses; undefined for a policy without approval signals; leaves out what the Intent does not declare)
- `packages/api/src/bootstrap/createApprovalNeededNotifier.ts` (the webhook: https, no redirects, 3-second timeout, the signature)
- `packages/api/tests/unit/bootstrap/create-approval-needed-notifier.test.ts`
- `packages/api/src/bootstrap/createEmailApprovalNeededNotifier.ts` (Resend delivery and the idempotency key)
- `packages/api/tests/unit/bootstrap/create-email-approval-needed-notifier.test.ts`

Dated updates are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.47 No Action Is Authorized Without a Signed Human Approval, Reads Included

**Update (2026-11-05, G-149).** An authorization with no `signalsHash` is refused at release when the signal state verifier is configured, so its approval is no longer accepted without a check at release.

**Claim.** Parmana authorizes no action without a signed approval from a trusted person, for that action and that resource. This holds for every policy, not only connector actions, and for reads as well as writes.

**How it is enforced.**

- **At policy load.** `PolicyValidator.validateEveryApprovalNeedsSignedApproval` refuses any policy with an approve rule that does not require a fact declared in `approvalSignals` with `is_true`. The fact must be the rule's whole condition, or sit directly inside its top-level `all`. An `any`, a nested `all`, or `eq true` does not count. `PolicyRouter` validates every policy it loads, so such a policy refuses every request. The policy-change endpoint validates every proposal, so such a policy cannot pass maker checker either.
- **At decision.** `ApprovalSignalVerifier` (2.42) counts an approval signal as true only with a valid signed approval. The approval must be from a trusted, unrevoked approver, with a valid Ed25519 signature, and must match the action, the resource, the amount where declared, the expiry, and single use. The Execution Gateway checks it again at release. `RuntimeEngine` refuses an approve decision when no approval verifier is configured (`approval-verifier-not-configured`), so a runtime built without one cannot trust a caller's `true`.

**Policies bound to capabilities.** The binding table (`CANONICAL_CAPABILITY_POLICY_BINDINGS`) is empty in this version. The reference policies also require a signed approval. For example, `vendor-payment` 2.1.0 and `expense-reimbursement` 1.1.0 need `humanApproved` for the Intent's target, and the amount is covered by the approval.

**Scope and limits.**

- **An approval covers the action and the resource, not every parameter.** Payment, expense and refund approvals do cover the amount.
- **Superseded versions remain in `policies/` as history.** Each one fails to load.
- **There is no automatic path.** An action cannot be authorized by server checks alone. This is the rule, not a missing feature (G-80).
- **Who approves is limited to the trusted approver list** (2.42, 2.45). The list is short, so in practice one person can approve every agent action at present.
- The claim holds for actions routed through Parmana (3.1).

**Evidence.**

- `packages/policy/src/PolicyValidator.ts` (`validateEveryApprovalNeedsSignedApproval`)
- `packages/runtime/src/RuntimeEngine.ts` (`approval-verifier-not-configured`)
- `packages/capability-registry/src/CapabilityPolicyBinding.ts` (the binding table)
- `packages/policy/tests/unit/PolicyValidator.test.ts` (the load rule, including the forms it refuses)
- `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts` (each approval-backed policy: the approval fact is required, the most permissive caller facts are refused without it, and a version that approves without a person is refused)
- `packages/policy/tests/unit/ReferencePolicies.test.ts` (every policy in `policies/` loads, or is refused only for approving without a person)
- `packages/runtime/tests/unit/runtime.test.ts` (a runtime with no approval verifier refuses an approval)
- `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` (a policy that approves without a person cannot be proposed)
- `test-support/approvals.ts` (the hermetic test approver used by the test suite)
- `examples/tutorials/120-no-action-without-approval` and `examples/tutorials/121-approval-for-a-read`
- `docs/site/concepts/human-approval.mdx`
- `docs/internal/VERIFICATION-GAPS.md`, G-80

Dated updates, the production history of these policies, and the approver records are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.48 The Server Tells an Agent What a Request Must Carry (Scoped, 2026-09-30)

**Claim:** `GET /policies/in-effect?capability=...` returns, with the policy to declare, what a request under it must carry: every fact the policy's rules read, their declared types, the signals that must equal a value of the Intent, and the signals that need a signed approval with where the approval's resource and amount are in the request. An agent can build a request from the server's answer, without a copy of the policy and without asking the operator.

Scope, stated plainly:

- **Rule conditions are not returned.** The answer carries the policy's `description`, the author's own text, which may mention a limit; the server decides with the rules.
- **Same authorization as before.** Only a caller whose key may invoke the capability, or a human caller.
- **Fails closed.** If the policy in effect cannot be read, the answer is `503 POLICY_VERSION_UNAVAILABLE`, never a partial answer.
- **SDKs:** `policyInEffect()` in TypeScript and `policy_in_effect()` in Python are in the repository, not yet published (1.4.0 on the registries does not have them). **Update:** published in SDK 1.5.0 (2026-10-04).
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; production runs `main` at `4fdc2c2` (#100) and answers `GET /health` `UP` and `GET /ready` `READY`.

Verification

- `packages/policy/tests/unit/policySignalRequirements.test.ts`: facts collected from nested `all` and `any`, sorted, once; empty objects when a policy declares none.
- `typescript/test/Alignment.test.ts`, `python/tests/test_sdk_alignment.py`: the SDK methods call the endpoint and return the answer; Python keeps signal names unconverted.

Evidence

- `packages/api/src/routes/policy-in-effect.ts`; `packages/policy/src/policySignalRequirements.ts` (also used by `PolicyValidator`)
- `openapi/openapi.yaml` (`getPolicyInEffect`); `docs/site/agents/integrate.mdx` step 3

## 2.51 A Public Sandbox Runs the Same Governance With a Published Demo Key (Scoped)

**Claim.** The public sandbox runs the same code as production with `PARMANA_SANDBOX=true`. It has its own database, its own signing keys and its own approver. A visitor with the published demo key, which is allowed only `sandbox:receipt`, gets the same governance as production:

- A request with no signed approval is refused.
- A demo approval from `POST /sandbox/approvals` lets one request be released to the sandbox receipt endpoint, where it is signed.
- The signed record verifies offline.
- The same approval, reused, is refused.
- The sandbox policy refuses an overlong note.

The demo approver signs only for `sandbox:receipt`, and only the documentation site may call the API from a browser. This is ADR-0014.

**What the code enforces.**

- With `PARMANA_SANDBOX=true`, the server refuses to start if any built-in connector variable is set, even an empty one. The demo approver's variables are refused outside sandbox mode.
- `PARMANA_SANDBOX=true` is refused when `NODE_ENV=production`.
- `POST /sandbox/approvals` exists only in sandbox mode. It is behind caller authentication, signs only `sandbox:receipt`, and each approval expires after 300 seconds.
- Browser access is limited to the origins listed in `PARMANA_CORS_ORIGINS`. Other origins receive no CORS header.

**Scope and limits.**

- **The sandbox acts on nothing.** Its one capability releases to an endpoint that returns a receipt. No connector to a real system can be configured while sandbox mode is on.
- **Anyone can approve in the sandbox.** That is its purpose. It shows how a signed approval is used, not who may give one. In production only registered approvers sign.
- **The sandbox policy, the deployment scripts and the live check records are not in this repository.** The sandbox policy and its deployment are operated outside this repository, so this claim does not verify them. The code-level enforcement above is verified here.
- **Distinct credentials, not distinct people.** The sandbox maker and checker keys can be held by one person, as elsewhere in this document.
- **Retention.** The sandbox's record-retention job is operated outside this repository, and this claim does not verify it.

**Evidence.**

- `packages/api/src/bootstrap/createSandboxOptions.ts` (the sandbox-mode checks, the connector-variable refusal, the `NODE_ENV=production` refusal)
- `packages/api/src/routes/sandbox-approvals.ts` (`POST /sandbox/approvals`, the `sandbox:receipt` restriction, the 300-second expiry)
- `packages/api/src/app.ts` (the route is mounted only in sandbox mode)
- `packages/api/src/middleware/cors.ts` (`PARMANA_CORS_ORIGINS`)
- `packages/api/tests/unit/createSandboxOptions.test.ts` (the sandbox-mode checks)
- `packages/api/tests/integration/sandbox.integration.test.ts` (the approval route behind the key; the CORS behaviour; the route does not exist outside sandbox mode; the approval is accepted once and only for its resource)

Dated operational records for the sandbox are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.52 A Request Whose Signals Do Not Have the Declared Types Is Refused (Scoped, 2026-10-05)

**Claim:** before any rule runs, every signal a policy declares in `signalsSchema` must have the declared type (`boolean`, `number` or `string`). A request that sends one with another type, such as an amount as text (`"150000"`), `null`, an array, `NaN` or `Infinity` for a number, is refused with `matchedRuleId` `signal-type-violation`, a reason naming each mismatching signal, and no rule evaluated. A policy whose `signalsSchema` declares any other type fails validation.

Why: numeric operators are false for a value that is not a number, so without this check a rule written as "reject if amount gt X, otherwise approve" would not fire for an amount sent as text. Mutation testing surfaced it (docs/internal/testing/MUTATION-TESTING.md); no shipped policy was found to approve such a request, since each also needs a signed approval.

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
- **The digest proves what Parmana observed, not what the source said.** A source's own proof is carried verbatim in `integrityProof.sourceProof` and verified for a source registered with a key (2.54, `sourceProofVerified`). A source registered without a key has no proof.
- **Execution statuses for approved actions** remain the Trust Record's executions; `EXECUTION_UNKNOWN` and conditional execution are phase 4. **Update (2026-10-11):** built.
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; production runs `main` at `4fdc2c2` (#100) and answers `GET /health` `UP` and `GET /ready` `READY`.

Verification

- `packages/runtime/tests/unit/trusted-signal-resolver.test.ts` (19): no sources is `NOT_EVALUATED`; the source is asked about the Intent's object; the signal's digest recomputes; a contradicting proposal is `INVALID`; a missing object, `not_found` and a wrong type are `MISSING_DATA`; `conflicting` is `CONFLICTING_DATA`; no registry, an unregistered source, a throw, a timeout, no identity, an invalid or future time are `SOURCE_UNAVAILABLE`; an old answer or a past `validUntil` is `VALIDATION_EXPIRED`; one failing fact of several refuses and every failure is reported.
- `packages/runtime/tests/unit/business-validation.test.ts` (9), through the real `RuntimeEngine` with a signed approval: execution when both hold, deciding on the source's value; `INVALID` with nothing executed when the proposal contradicts the source; the assessment signed into the Refusal Record, verifying after a JSON round trip and failing when a status is changed; the policy refusing on the source's value when the caller sent none; `SOURCE_UNAVAILABLE` with no source or a failing one; `MISSING_DATA`; no source asked when authority is `NOT_AUTHORIZED`; `NOT_EVALUATED` under a policy without sources.
- `packages/policy/tests/unit/PolicyValidator-signalSources.test.ts` (19): valid declarations load and count as covered; malformed or contradictory ones are refused; `GET /policies/in-effect` lists them as `sourced`.

Evidence

- `packages/shared/src/domain/business-validation.ts`, `packages/shared/src/domain/decision.ts` (`assessment`)
- `packages/runtime/src/business-validation/`, `packages/runtime/src/RuntimeEngine.ts`, `packages/runtime/src/DecisionBuilder.ts`
- `packages/policy/src/types/Policy.ts` (`signalSources`), `packages/policy/src/PolicyValidator.ts` (`validateSignalSources`)
- `docs/internal/rfcs/RFC-0023-Business-Validation.md`

**Update (2026-10-11):** the first scope bullet is superseded by 2.54: business systems can now be registered as sources through maker checker, and a source registered with a key must sign its answers, which Parmana verifies (`sourceProofVerified`). The fourth bullet holds only for sources registered without a key. The second bullet is superseded by 2.55 for a policy with `requireAuthorityGrant`: authority then also needs the caller's grant, and `AUTHORITY_EXPIRED` is produced.

---

## 2.54 Any Business System Can Be a Trusted Signal Source: Registered Through Maker Checker, Asked With a Signed Query, Answers Verified (Scoped, 2026-10-11)

**Claim:** a business system that owns facts a policy needs (an ERP, an order system, a CRM, a ledger) is registered under a name through maker checker: a human proposes `register` with an HTTPS endpoint and, optionally, the Ed25519 public key it signs answers with, and a different human approves with a step up authorization. Only then do policies that name it in `signalSources` get answers from it. Parmana asks it with a query signed by Parmana's default key, naming the source, the endpoint as audience, the claim, the business object, the action, the transaction and a fresh nonce, valid 60 seconds. The endpoint's address is checked as public on proposal, on approval and before every query, and the query is sent to that address with redirects refused and the answer limited to 16 KiB. Parmana trusts an answer only when it is HTTP 200, version 1, and echoes the query's source, nonce, signal key, claim and subject; and, for a source registered with a key, only when it carries a valid Ed25519 signature over the canonical answer under that key (and the registered `keyId`, when given). Anything else is `SOURCE_UNAVAILABLE` and refuses the request. A verified answer is recorded in the Trusted Signal with `sourceProof`, `sourceKeyId` and `sourceProofVerified: true`, inside the signed Execution Trust Record or Refusal Record. Revoking a source makes every policy that names it refuse from the next request.

Scope, stated plainly:

- **Not deployed** until this change is merged and deployed, and **no real business system has been connected.** Every test runs against in-process endpoints, including the example endpoint the docs give operators. **Update (2026-10-11):** deployed; `GET /business-signal-sources` answers in production. Still no real business system connected and no source registered there. **Live check, passed in production 2026-10-11** (`examples/live-checks/business-signal-source`): with the demo source `livecheck-erp` (a deployed endpoint answering from a fixed table, registered with an Ed25519 key) and test policy `livecheck-signal`, a request for a paid invoice was approved on the source's signed answer (`sourceProofVerified: true`, released, verifies offline), an unpaid one was refused by the policy on the source's `false`, the agent's `true` against the source's `false` was refused as `INVALID`, and an unknown invoice as `MISSING_DATA`. Transactions `d736681f-8d86-4e24-bcf3-66debfa6ac23`, `266278b4-7683-43fd-97e7-aa724c6cca9a`, `1fd2274c-65e2-47c4-bda5-4dd57b198277` and `173c6f4f-f9d7-46e0-a712-9d9f39a274cd`. No real business system is connected yet.
- **Parmana proves the source said it, not that it is right.** A source answers for its own records.
- **A source registered without a key** is trusted on the pinned HTTPS connection alone; its Trusted Signal has no `sourceProof`. Registering a key is recommended, not required.
- **Checked once, at decision time.** `validUntil` is not re-checked at release; conditional execution is phase 4. **Update (2026-10-11):** re-checked at release, and carried to external systems as conditions.
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
- `docs/internal/rfcs/RFC-0023-Business-Validation.md` (Business signal sources, Wire protocol), `docs/site/guides/connect-a-business-signal-source.mdx`

---

## 2.55 Per-Agent Authority: Grants With Limits and Expiry, Made Through Maker Checker, Checked Before Anything Is Asked (Scoped, 2026-10-11)

**Claim:** a policy with `requireAuthorityGrant` decides a request only when its authenticated caller (`metadata.submittedBy`, which the server sets from the API key) holds an authority grant in force for the action and the request is within the grant's limits. A grant names one caller, one capability, optional limits by Intent path (`min` and `max` for a number, `oneOf` for allowed values), and an expiry at most 366 days away; it is made and revoked through maker checker (`/authority-grants`): a human proposes, a different human approves with a step up authorization, and neither may be the grantee. No grant, a revoked one, one not yet in force, a request outside a limit (or with the limited value missing or of another type), or no authenticated caller is `NOT_AUTHORIZED`; a grant past its `validUntil` is `AUTHORITY_EXPIRED`; grants that cannot be read, or no grant registry, are `AUTHORITY_UNCLEAR`. Each refuses the request before business validation, so no business system is asked, with a Refusal Record (`authority-not-authorized`, `authority-expired`, `authority-unclear`) that a signed approval cannot cure. The grant checked is recorded in `assessment.authority.grant`, signed in the record. `GET /policies/in-effect` answers `authorityGrantRequired: true` for such a policy.

Scope, stated plainly:

- **Opt in per policy, and no shipped policy opts in.** A policy without `requireAuthorityGrant` keeps the authority of 2.53.
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; `GET /authority-grants` answers in production. No grant has been made there and no production policy requires one. **Live check, passed in production 2026-10-11** (`examples/live-checks/authority-grant`): under test policy `livecheck-grant` with `requireAuthorityGrant`, each request with a valid signed approval, a request before any grant was refused (`authority-not-authorized`), one within grant `4b60507f-adb8-4fe0-82b3-a83c41e09022` (max 100) was approved, released and verified offline with the grant in the signed record, one for 500 was refused as above the granted maximum, and one after the revoke was refused. Transactions `8a75374c-150d-4cea-b57a-abb3a92bcac6`, `da96002b-66ec-44cf-88da-0f29997e4711`, `87770ab4-ac7c-4768-94a9-46df2367782b` and `41ec047d-bf64-48f4-b718-a419c7575e8d`. No production policy for a real action requires a grant yet.
- **Limits are per request.** Cumulative limits ("100000 per day") are not built.
- **The grantee is a caller id the server does not check exists.** A grant to a key that does not exist has no effect.
- **Checked at decision time.** Not re-checked at release (phase 4); the authorization's short TTL bounds the window. **Update (2026-10-11):** re-checked at release.
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
- `docs/internal/rfcs/RFC-0023-Business-Validation.md` (Authority grants), `docs/site/guides/grant-an-agent-authority.mdx`

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
2. **Execution requires a valid, current proof.** A missing,
   forged, expired, revoked, mismatched or denied-decision proof each reaches the external endpoint zero
   times. A control with an approved decision reaches it once. Not all paths are covered yet (G-115).
3. **A proof authorizes only the parameters it was issued for.**
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
version could be overwritten) and claim 5 (tail truncation). The fixes and their residuals are recorded in `docs/internal/VERIFICATION-GAPS.md`, G-103 to G-118.
The first-run measurements are not published in this repository.

**Coverage after the follow-up fixes.** The Postgres nonce store runs on PostgreSQL semantics
(Test 6). The startup governance integrity check runs against a signed approval record (Test 4). Not yet
covered: KMS signing, a live external connector endpoint (G-133), and the caller
authorization scoping (the API harness disables caller authentication, as the existing integration tests do).
These are listed as open in `docs/internal/REMAINING-WORK.md` section M.

**Evidence.** `test10-execution-audit.test.ts`; `packages/api/src/bootstrap/createReleaseVerifier.ts`;
`packages/execution-control/src/ExecutionControlService.ts`; `packages/execution-gateway/src/ExecutionGateway.ts`
(`decisionApproved`); `packages/policy/src/FilePolicyRepository.ts` (`save`, `PolicyVersionImmutableError`);
`packages/crypto/src/CallerAuditChainVerifier.ts` (`verifyChain`, the `anchor` argument).

## 2.58 An Operator Can Stop All Execution, and the Stop Survives Restarts

**Claim.** An operator can trip a kill switch that refuses new execution, new transactions, policy-change approvals and sandbox approvals, before any of them run. The stop is stored in Postgres, so a restart does not clear it. A stored state that cannot be read counts as tripped. When `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR=true`, a reset needs a second, different operator.

**Verified by tests.**

- A trip refuses `/execute` with `503 KILL_SWITCH_ACTIVE`, and a reset lets the next request through (`packages/api/tests/integration/kill-switch.integration.test.ts`).
- The trip, status and probe routes stay reachable while the switch is tripped. A key without the trip, reset or probe capability is refused with `403`.
- A reset by one operator is held as pending (`202`). A second, different operator completes it (`200`). The same operator is refused (`409`).
- A failure to read the state reports the switch as tripped (`packages/api/tests/unit/KillSwitchService.test.ts`).
- Against a real PostgreSQL 16 server, the stop survives a new connection pool, and two concurrent trips end at the same version (`packages/api/tests/integration/postgres-kill-switch.integration.test.ts`).

**Production.** On 2026-10-20, with the switch enabled and not tripped, the status endpoint reported it as inactive and echoed the request nonce. The switch has not been tripped in production. An external probe is scheduled to run every 15 minutes. Its runs are recorded in `kill_switch_probe`; this claim does not assert the outcome of each run.

**Limits.**

1. A stop does not recall an action already released. Calls admitted before the trip can still complete.
2. A tool an agent reaches directly, bypassing Parmana, is not stopped.
3. The status response and the audit events are not signed (G-118). A status response shows the switch's state, not a signed proof of it.
4. The external probe's results are recorded in `kill_switch_probe`, but they are not signed.
5. Two-person reset has not been exercised in production with two real operator keys.
6. The switch stops every caller at once. It cannot halt one agent.
7. A third-party check on a non-production deployment has not been done.

**Evidence.**

- `packages/api/tests/integration/kill-switch.integration.test.ts`
- `packages/api/tests/unit/KillSwitchService.test.ts`
- `packages/api/tests/integration/postgres-kill-switch.integration.test.ts`
- `packages/api/src/bootstrap/createKillSwitch.ts`
- `docs/internal/runbooks/KILL-SWITCH-OPERATIONS.md` (operations)

The gap record is G-122 in `docs/internal/VERIFICATION-GAPS.md`.

## 2.59 A Policy Change Is Approved in Production Only by a Listed Checker, and the Approved Version Is Stored Durably (Scoped, 2026-10-21)

**Claim.** A policy change takes effect only when a human caller who is listed for that policy approves it, with a single-use step-up signature, and the approved version is saved to the policy store. A caller who is not listed is refused with `403 CHECKER_NOT_IN_SCOPE`. An unset scope lists no one, so nothing is approved.

**Verified by tests.** The approve route checks the caller against `POLICY_CHANGE_CHECKERS` (`packages/api/src/governance/policyChangeCheckers.ts`, tested in `packages/api/tests/unit/policyChangeCheckers.test.ts`). `tests/architecture/vercel-entry-policy-checkers.test.ts` checks that both `server.ts` and `api/index.ts` pass the scope. The test was confirmed to fail on the unfixed `api/index.ts`.

**Checked in production, once.** On 2026-10-21 a maker key for `maker-wiring-check` proposed version `1.0.0` of the unused policy `checker-wiring-check`, and the checker `pavancharak` approved it with a signed step-up. The response showed `status: APPROVED`, `resolvedBy: pavancharak`, `resolvedAt: 2026-10-21T04:29:57.273Z`. The approved version is stored in the `policies` table.

**Not claimed.**

1. That a caller who is not listed is refused on production. That is tested in unit tests only, and was not tried on production.
2. That approved versions survive a restart of production. Storage is the database path, and no restart was tested.
3. That approval issuers, which sign approvals for agent actions, are scoped per policy. They are not (G-50, still open).
4. That a second person is required beyond the rule that the maker cannot approve their own change. There is no quorum.
5. That the checker is a separate person. Both keys were created by one operator on one machine. This check shows the wiring works, not that duties are separated (REMAINING-WORK, section A).

Gaps: G-50 (partly fixed) and G-123 (fixed).

## 2.24 Authorization Is Caller-Type-Agnostic

The authorization pipeline's outcome depends only on the requested action, the governing policy, and the independently-verified facts bearing on it — never on what kind of system, model, or entity submitted the request. This is the source-code basis for the positioning claim that Parmana protects institutional authority against execution risk from any source (AI agents, humans, applications, automated systems, third-party systems, compromised systems), not only AI: the mechanism does not special-case any of them, including ones it has no name for.

Directly validated, not inferred from the absence of AI-specific code: `BusinessTransactionMapper.fromRequest` (`packages/api/src/mappers/BusinessTransactionMapper.ts:28`) casts the caller-declared `authority` field with no runtime validation against the `AuthorityType` enum (`USER | ROLE | SERVICE | ORGANIZATION`, `packages/shared/src/domain/authority.ts`) — an arbitrary string reaches the runtime unfiltered. `RuntimeEngine`, `PolicyEngine`, `SignalIntentBinder`, and `CapabilityPolicyBinder` contain zero references to `authority` or caller identity anywhere in their source (confirmed by direct grep across all four files). A regression test submits two transactions through the real `POST /execute` route, identical in every field except `authority.authorityType` — one declaring the conventional `"USER"`, the other declaring `"FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE"`, a value that is not a member of the enum at all — and asserts byte-identical decisions (`outcome`, `matchedRuleId`, and, for the rejection case, the exact error text) on both the APPROVE and REJECT paths.

Independently confirmed by the Strategic Positioning source-code validation audit (2026-08-09, read-only): the caller-authentication layer (`StaticKeyAuthenticator`, `packages/api/src/auth/StaticKeyAuthenticator.ts`) authenticates by opaque API-key hash comparison only, with no concept of caller category either — the same identity mechanism a human operator, a script, an AI agent, or a third-party integration would all use identically.

**Scope, precisely:** this claim covers the general-purpose pipeline mechanism itself, which the regression test below exercises independently of any specific capability. The mechanism's caller-agnosticism does not depend on which capability is invoked (2.24's own evidence is about `RuntimeEngine`/`PolicyEngine`/`SignalIntentBinder`/`CapabilityPolicyBinder` never reading caller identity at all, not about per-capability behavior), so this claim's substance is unaffected by G-30 — G-30 is about policy _binding_ coverage, not caller-type discrimination. It does not claim that a non-AI caller has actually been exercised against a live production deployment — only that the mechanism contains no code path that could distinguish one caller kind from another to begin with.

Evidence

- packages/api/tests/integration/authority-type-agnostic-execution.integration.test.ts (2 cases: identical APPROVE, identical REJECT, across a conventional and a non-enum `authorityType`)

- packages/api/src/mappers/BusinessTransactionMapper.ts (unvalidated `authority` cast)

- packages/shared/src/domain/authority.ts (`AuthorityType` enum)

- packages/api/src/auth/StaticKeyAuthenticator.ts (caller-type-agnostic authentication)

- Repo-wide grep confirming zero `authority`/caller-identity references in RuntimeEngine.ts, PolicyEngine.ts, SignalIntentBinder.ts, CapabilityPolicyBinding.ts (as of this check, 2026-08-09, the last file lived at `packages/policy/src/`; moved to `packages/capability-registry/src/` 2026-08-26 — same file content, unaffected by the move)

- examples/tutorials/100-authorization-caller-type-agnostic/run.ts (runnable narrative, library-level: `"USER"` vs. `"FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE"` produce byte-identical outcomes and reasons on both the APPROVE and REJECT paths)

---

## 2.25 Only Authorized Actions Take Effect: Status of the Internal Review

**Claim.** Parmana authorizes an action only when the conditions in 2.47 are met: a signed approval from a trusted person for that action and resource, checked at policy load and at decision. This section records how that claim was reviewed, and what the review did and did not cover.

**Review.** The project team reviewed the source four times, each pass run fresh, without relying on the earlier passes' conclusions. The first three passes found one capability that would have violated the claim if it had ever been enabled: `payments:execute` (vendor payment), which had no connector gated by its own authorization. The fourth pass found that capability had been removed from the repository (`docs/internal/VERIFICATION-GAPS.md`, G-27), and found no capability in the current repository that could execute without an approval.

**What the review did not cover.** The reviews were internal, not by an independent third party. The last pass re-ran two of the ten negative tests cited across the reviews; the others were checked by reading code paths that the removal did not change. Multi-tenant authority isolation, and the case where an operator with direct database access bypasses the API, were not re-traced in that pass.

Evidence

- `packages/api/tests/integration/action-without-human-approval.integration.test.ts` (the invariant, through the HTTP API)
- No current test asserts that `payments:execute` has no connector. The earlier test that did was removed with the connector migration, so this point rests on the removal recorded in G-27.
- `docs/internal/VERIFICATION-GAPS.md`, G-27

Dated updates for this claim, and the detail of each review pass, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.26 Policy Changes Need a Human Maker and a Different Human Checker

**Claim.** A change to a policy's content takes effect only after a human checker approves it, and the maker and checker are different people. The approval is recorded durably and signed. Before this, a caller with write access to `policies/` could change what a policy allows, with no second party and no signed record of who approved it.

**How it works.**

- **Lifecycle.** A change moves from `PENDING_APPROVAL` to `APPROVED` or `REJECTED`, once, and never back (`packages/shared/src/domain/pending-policy-change.ts`).
- **Four endpoints** (`packages/api/src/routes/pending-policy-changes.ts`): propose (`POST /:name/:version/pending-changes`), list with the diff (`GET /pending-changes`), approve (`POST /pending-changes/:id/approve`), and reject (`POST /pending-changes/:id/reject`). Each one requires a human caller (`isHumanCaller`). A service or organization credential is refused.
- **Maker is not checker.** The API refuses an approve or reject by the same caller who proposed the change (`SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`).
- **Approval is signed at the checker's own machine.** Approve and reject need a step-up authorization, signed by the checker's own key with `scripts/sign-policy-change-step-up.ts`. The key does not leave that machine.
- **Startup integrity check.** At startup, the server compares each approved policy's file against its approval record. If an approved policy's file does not match (missing, changed content, invalid signature, or broken chain), or the records cannot be read, the server does not start (`policy_governance_integrity_startup_refused`). A database with no approval records starts normally. A periodic re-check logs drift during uptime, and does not stop the server.
- **Content hash at decision.** The approval records the policy's content hash at the time it was decided. `PolicyGovernanceAnchorResolver` checks the policy's most recent approval record and reports its status on each execution's trust record. It never blocks an execution. With `POLICY_EXECUTION_VERIFICATION_ENFORCED=true`, `PolicyGovernanceExecutionVerifier` refuses execution when the check fails. This flag is off by default.

**The governance UI is read-only.** `packages/governance-ui` lists pending changes and shows their diffs. It has no route that approves or rejects. The checker approves on the command line, as above. The UI holds the API key it was given only in server-side session memory, never in a page. Its login is rate limited.

**Scope and limits.**

- **Deployment is not part of this claim.** The claim is about what the code does, and what the tests cover. It does not say which environment is running which version.
- **Enforcement is off by default.** Until `POLICY_EXECUTION_VERIFICATION_ENFORCED` is on, a mismatch is recorded, not refused.
- **A database outage at startup stops the server,** because the integrity check cannot run without the records.
- **Maker and checker are separate credentials, not proven separate people.** One person can hold both (2.45).

**Evidence.**

- `packages/api/src/routes/pending-policy-changes.ts`
- `packages/api/src/auth/isHumanCaller.ts` and `packages/api/tests/unit/isHumanCaller.test.ts`
- `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts` (non-human denial on each endpoint, and maker is not checker)
- `packages/api/src/governance/verifyPolicyGovernanceIntegrityAtStartup.ts`, and `packages/api/src/server.ts` (the startup call is awaited before the server listens)
- `packages/api/tests/unit/verifyPolicyGovernanceIntegrityAtStartup.test.ts`
- `packages/api/src/governance/PolicyGovernanceAnchorResolver.ts` and `packages/api/src/governance/PolicyGovernanceExecutionVerifier.ts`
- `scripts/sign-policy-change-step-up.ts`
- `packages/governance-ui/tests/integration/app.integration.test.ts`

Dated updates for this claim, including the change from a background check to a startup check, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

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

## 2.28 Key Resolution by Key ID, with Expiry and Revocation

**Claim.** The verifier resolves the signing key for each authorization by its `keyId`, rather than always using one configured key. A key can be marked with an expiry time or revoked, and a verification that depends on such a key fails closed. The same mechanism lets more than one key be valid during a rotation, without a restart.

**How it works.** `EnvelopeVerifier` takes optional `keyProvider` and `keyExpiryStore` options. With `keyProvider` set, each authorization's `keyId` is looked up through it. With `keyExpiryStore` also set, the key is checked first: a revoked key, or one whose expiry time has passed, is refused before its key material is read. A key that cannot be found, read, or checked is refused the same way. The verifier does not fall back to the static key in these cases. Without `keyProvider`, verification uses the single configured public key, as before, and key resolution is not part of its checks.

`FileKeyExpiryStore` is the reference store. It reads `key-expiry.json` from the key directory. A key ID that is not in the file is treated as valid with no expiry. A malformed file stops verification rather than being read as "no expiry".

**Tenant keys (opt-in).** When a transaction carries a tenant ID, `FileTenantKeyResolver` can sign its authorization with a dedicated `tenant.<id>` key, if that key has been provisioned. A transaction without a tenant ID, or for a tenant with no key, is signed with the shared `default` key. An API key may only name the tenants in its `allowedTenantIds` list; a request for another tenant is refused with `TENANT_NOT_ALLOWED`. Under `KEY_PROVIDER=aws-kms`, tenant key IDs map to KMS aliases (`tenant.<id>` becomes `alias/tenant/<id>`); a key ID that would fall under AWS's reserved `alias/aws/` prefix is refused. This mapping has been tested with unit tests and an example, not against a live AWS account.

**Limits.** Tenant keys are provisioned by hand (`scripts/generate-keypair.ts --key-id tenant.<id>`). There is no automatic rotation, and no KMS or HSM support for the expiry file. The durable evidence records (Trust Records, Refusal Records and Audit Events) take their key IDs from `PARMANA_VERIFICATION_KEY_ID` and `PARMANA_VERIFICATION_SECONDARY_KEY_ID`, which is how they rotate. See `docs/internal/VERIFICATION-GAPS.md`, gaps 32 and 53.

Evidence

- `packages/envelope-verifier/src/EnvelopeVerifier.ts` (`keyProvider` and `keyExpiryStore` options, `keyValid` check)
- `packages/execution-gateway/src/ExecutionGateway.ts` (passes both options to its verifier)
- `packages/crypto/src/KeyExpiry.ts` (`KeyExpiryStore`, `FileKeyExpiryStore`)
- `packages/crypto/tests/unit/key-expiry.test.ts`
- `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts` (key resolution, expiry, revocation, and the unchanged static-key behaviour)
- `packages/runtime/src/TenantKeyResolver.ts` (`FileTenantKeyResolver`)
- `packages/runtime/tests/unit/tenant-key-resolver.test.ts`
- `packages/crypto/src/providers/signer/KmsSigner.ts` (`resolveKmsKeyId`)

Dated updates for this claim are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.29 Signal-Freshness Enforcement at Execution Time (G-31)

A signed Execution Authorization is also bound to the exact runtime signals its decision rested on, not merely the policy and content it approved: `RuntimeEngine.execute()` computes `signalsHash` — a canonical hash of the `PolicySignals` object evaluated for that decision, via the same `TrustRecordHasher` idiom 2.27's `policyContentHash` uses — and includes it inside the signed `ExecutionAuthorizationPayload` (`packages/runtime/src/RuntimeEngine.ts`). This closes the one gap 2.27 left open: policy content was already re-checked at the execution boundary, but the vendor status, risk exposure, market conditions, or other real-world facts a policy's `boundSignals`/`SignalStateVerifier` cares about were verified once, pre-authorization, and never again.

`ExecutionRequest` carries the same `signals` the authorization was signed under (`packages/execution-system/src/ExecutionRequest.ts`, populated by `ExecutionRequestBuilder` from the persisted `BusinessTransaction.signals`), and `ExecutionGateway` optionally accepts a `SignalStateVerifier` (`ExecutionGatewayOptions.signalStateVerifier` — the same port `@parmana/policy` already defines and `RuntimeEngine` already uses pre-authorization, reused here rather than reimplemented). When supplied, and when the authorization carries a `signalsHash` and the request carries `signals` (older authorizations signed before this check existed carry neither), the gateway recomputes the signals hash and compares it to the signed value — a mismatch sets `signalsStillCurrent: false` and is reported in `GatewayVerificationResult.signalsHashMismatch`. When the hash matches, the gateway independently re-verifies those signals against real-world state via `SignalStateVerifier.findViolations` — any divergence also sets `signalsStillCurrent: false`, reported in `GatewayVerificationResult.signalDivergence`, and fails `verify()` before the connector is ever invoked, in the same ordered check sequence `policyStillCurrent` sits in (`packages/execution-gateway/src/ExecutionGateway.ts`).

This check is opt-in and additive, not a behavior change for existing deployments: omitting `signalStateVerifier`, or verifying an authorization signed before `signalsHash` existed, leaves `signalsStillCurrent` absent (not failed) — the same "absent means skipped" convention `policyStillCurrent` already uses — and `isSoleFailureNonceReplay` treats an absent/undefined check as passing, so it does not spuriously reclassify a stale-signals rejection as a nonce replay. In production, only capabilities with a configured `SignalStateVerifier` get a real re-verification, and none is configured in this version; every action's `findViolations` call returns an empty array (nothing to check), the same discipline every capability-scoped `SignalStateVerifier` implementation already follows. The check also only has effect when decision and execution are actually separated in time; this codebase's own `RuntimeEngine`/`ExecutionGateway` wiring runs both synchronously in one call today, so its practical value is for a `SignedExecutionAuthorization` handed to a decoupled downstream receiver (e.g. an `HttpExecutionSystem`-based deployment) that verifies and executes independently, potentially much later, up to `maxTtlSeconds` — exactly the use this authorization type's own "receiving systems" doc comment describes as supported.

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

- `docs/internal/VERIFICATION-GAPS.md` G-31 (full narrative, including what this does and does not close)

- `examples/tutorials/98-signal-freshness-enforcement/run.ts` (runnable narrative: one authorization, two independent receiving systems — one whose live re-check finds nothing changed and executes, one that finds the vendor blocked since authorization and is rejected with the divergence named, before its connector is ever invoked)

---

**Update (2026-10-03, follow up):** a request with no `signals` used to skip this check even when the authorization carried a `signalsHash`. It is now checked as `{}`, the value `RuntimeEngine` hashes for a transaction with no signals, so omitting signals passes only against an authorization signed over no signals, and is then still re-verified by the `SignalStateVerifier`. Evidence: `signal-freshness.test.ts` (the two new cases above).

## 2.30 Policy-Authoring and Deployment Observability Warnings

Three checks make gaps visible that were previously silent: a rule fact that is not bound, two rules that can match the same input, and a runtime started without optional protections.

**Every rule fact is bound or acknowledged, or the policy does not load.** `boundSignals` (2.11) verifies only the signals a policy lists. `PolicyValidator.findUncoveredFacts(policy)` walks every rule condition, including nested `all` and `any`, and returns each fact that has neither a `boundSignals` entry nor an `unboundSignalReasons` entry. `PolicyValidator.validate()` throws for any such fact, and `PolicyRouter.load()` calls it, so an unacknowledged uncovered fact stops the policy from loading. A policy author acknowledges a fact that has no Intent-side equivalent by giving a non-empty reason for it in `unboundSignalReasons`. A reason is a documented claim that the fact cannot be bound. It is not proof, and reviewers still have to judge it.

**Rule conflicts are reported, not blocked.** `PolicyValidator.findRuleConflicts(policy)` looks for rules whose conditions can both match the same input. Under first-match-wins, the later rule can then be partly or wholly unreachable. `PolicyRouter.load()` logs `policy_rule_conflict_detected` through `console.warn` and does not throw, because an overlap is a judgment call and the checker does not claim to catch every condition shape. The results also appear as `ruleConflicts` in the policy-change review in `packages/api/src/routes/pending-policy-changes.ts`, next to `coverageWarnings`.

**Optional protections are logged at construction.** `RuntimeEngine`'s constructor logs `runtime_engine_constructed` once. It records whether each optional dependency is configured: `signalStateVerifier`, `capabilityPolicyBinder`, policy execution verification, the governance anchor resolver, signing readiness, execution intents, and refusal recording. The log is written once per instance, not per request. An operator can see from the log which protections a deployment is running with.

**Scope and limits.**

- The coverage check only sees facts a rule references. A fact that a rule never reads is not checked.
- The conflict check is heuristic. A clean result does not prove that no two rules overlap.
- The construction log says which dependencies were supplied. It does not say that a supplied dependency is correctly configured.

**Evidence.**

- `packages/policy/src/PolicyValidator.ts` (`validate`, `findUncoveredFacts`, `findRuleConflicts`)
- `packages/policy/src/PolicyRouter.ts` (`load`, the `policy_rule_conflict_detected` warning)
- `packages/api/src/routes/pending-policy-changes.ts` (`coverageWarnings`, `ruleConflicts` in the review output)
- `packages/policy/tests/unit/PolicyValidator.test.ts` and `PolicyValidator.exact.test.ts` (uncovered facts, acknowledged facts, nested conditions, and rule conflicts)
- `packages/policy/tests/unit/PolicyRouter-boundSignals-coverage.test.ts` (loads when every fact is bound or acknowledged, and throws naming the policy and the fact when neither applies)
- `packages/runtime/src/RuntimeEngine.ts` (`runtime_engine_constructed`)
- `packages/runtime/tests/unit/optional-protections-logging.test.ts` (the logged flags for each protection on its own and when none is supplied)

Dated updates, including the policy changes that closed the gaps and the 2026 coverage and conflict findings, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.31 Signed Caller-Capability Claim, Checked at the Connector Layer

The capability that let a caller submit an action is carried in the signed authorization, and the connector layer checks it against the action being run.

**What is signed.** `ExecutionAuthorizationPayload` has two optional signed fields:

- `submittedBy` is the caller ID.
- `grantedCapability` is the capability the caller was cleared for at the API edge (`isCapabilityAllowed()`).

Both are optional, so authorizations issued before they existed still verify unchanged. The server sets both from the caller's own check, not from client input. `POST /execute` and `POST /transactions` both set them, and both write a `caller.capability_granted` audit event for each grant.

**What the connector layer checks.** `DefaultConnectorPolicy.assertAllowed()` (`packages/execution-control/src/ConnectorPolicy.ts`) rejects a request when `grantedCapability` is present and does not equal the action being executed. This check runs before the gateway session is consumed. When `grantedCapability` is absent, the check is skipped, not failed open. That case means caller authentication was disabled, not that every action is granted.

**Scope and limits.**

- This is defense in depth. `ExecutionGateway.verify()` already verifies the authorization signature before `ExecutionGateway.execute()` is called, and today that is the only route to `assertAllowed()`. The new check does not verify the signature again. It checks that a value inside an already-verified payload matches the action.
- The check protects against a future code path that reaches `assertAllowed()` without the current verified route. It does not protect against a party who already controls in-process code and internal wiring. That party can set `grantedCapability` as easily as the existing `verifiedTransaction` booleans.
- A signed `grantedCapability` shows what the caller was cleared for at the time of the check. It does not show that the caller still holds the capability.

**Audit storage.** The `caller_audit_events` table accepts the `caller.capability_granted` event type (migration `20260911090000_add_capability_granted_to_caller_audit_events.sql`). Without that migration, every authenticated request that writes this event fails closed when the audit write fails (2.19). The migration must be applied before this version is deployed.

**Evidence.**

- `packages/shared/src/domain/execution-authorization.ts` (`submittedBy`, `grantedCapability` on `ExecutionAuthorizationPayload`)
- `packages/shared/src/domain/metadata.ts` (`grantedCapability` on `TransactionMetadata`)
- `packages/api/src/routes/execute.ts` and `packages/api/src/routes/transactions.ts` (both set `grantedCapability` and write `caller.capability_granted`)
- `packages/crypto/src/AuthorizationSigner.ts` and `packages/runtime/src/RuntimeAuthorizationSigner.ts`, `RuntimeEngine.ts` (the fields are carried into the signed payload)
- `packages/execution-control/src/ConnectorPolicy.ts` (the consistency check in `assertAllowed()`)
- `packages/crypto/tests/unit/authorization-envelope.test.ts` (the fields are included when supplied and omitted when not, and a tampered `grantedCapability` fails verification)
- `packages/runtime/tests/unit/execution-authorization-wiring.test.ts` (the fields are passed from transaction metadata through the runtime wiring)
- `packages/execution-control/tests/unit/connector-policy-granted-capability.test.ts` (allowed when the action matches or the field is absent, rejected on a mismatch)
- `packages/api/tests/integration/caller-auth.integration.test.ts` (`POST /transactions` and `POST /execute` produce the same signed `grantedCapability` for the same caller)

Dated updates, including the parity fix for `POST /transactions` and the audit constraint fix found in a real deployment, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

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

- This binds execution to the policy a human checker approved. It does not prove the policy is correct or wise, and it does not model per policy or per role approver authority. Any provisioned human checker with a step up key can approve any policy (see G-50 in `docs/internal/VERIFICATION-GAPS.md`).
- Signals such as `fraudCheckPassed` are caller declared unless a `SignalStateVerifier` covers that capability. For any signal a policy declares in `approvalSignals`, `ApprovalSignalVerifier` (2.42) is wired; other signals are only as true as the caller says (G-51). Since 2026-09-28 the policies for LLM tool calls need a signed approval, so their caller declared facts cannot authorize on their own (2.44).
- The claim holds for execution routed through the gateway. A request that never reaches the gateway is not covered (see 3.1).
- Direct edits to the policy store outside the API are prevented from executing (hash mismatch against the approval record) but are still only detected, not blocked, at the storage layer.

Evidence

- `packages/execution-gateway/src/ExecutionGateway.ts`, `GatewayVerificationResult.ts` (`policyGovernanceVerified`, `policyGovernanceViolation`, `allowUnverifiedPolicy`)
- `packages/execution-gateway/tests/unit/policy-binding-fail-closed.test.ts` (10 cases: all hashes agree, construction refused without repository or verifier, no `policyContentHash`, policy edited after authorization, no approval record, stale approval hash, verifier error, policy missing, nonce not burned, explicit legacy opt out; each failure asserts zero connector calls)
- `packages/api/src/bootstrap/createPolicyExecutionVerifier.ts`, `createExecutionGateway.ts`
- `packages/api/tests/unit/bootstrap/create-policy-execution-verifier.test.ts`
- Full repo `npx tsc -b` clean and `npx vitest run`: 1871 passed, 42 skipped, 0 failed

## 2.37 Large Message Signing Under AWS KMS (Commitment Scheme)

An Execution Trust Record, an execution authorization, or any other artifact whose canonical form is longer than 4096 bytes can be signed with a KMS held Ed25519 key and verified independently. AWS KMS refuses a raw Ed25519 message over 4096 bytes, so a larger artifact is signed through a fixed-size commitment.

The decision is recorded in `docs/internal/adr/ADR-0010-Large-Message-Signing-Under-KMS.md`:

- A message of 4096 bytes or fewer is signed and verified raw, exactly as before, so every signature issued before this change stays valid.
- A longer message is signed by the KMS signer as a fixed 97 byte commitment, the prefix `PARMANA-ED25519-LARGE-MESSAGE-V1` and a NUL byte followed by the SHA-512 digest of the message. The signature is an ordinary Ed25519 signature.
- The scheme depends only on message length, so no marker or schema change is stored on any record.
- A verifier accepts a raw signature for any message, and additionally the commitment form only for a message over 4096 bytes. A commitment signature over a message at or below the limit is rejected, so a small message cannot be downgraded to the commitment form.

Scope, stated plainly:

- The TypeScript packages and the Python SDK implement the rule. A third party verifier must implement it to verify a large KMS signed artifact. It is fully specified in the ADR and the Python module is a compact reference.
- This makes signing possible. It does not change the ordering in which a request is processed. The connector can still be called before the trust record is signed, so a signing failure after the connector call leaves an executed action without a signed record (G-52 in `docs/internal/VERIFICATION-GAPS.md`).

Evidence

- `packages/crypto/src/SignatureCommitment.ts`, `providers/signer/KmsSigner.ts`, `providers/signature/Ed25519SignatureProvider.ts`
- `packages/crypto/tests/unit/signature-commitment.test.ts` (boundary at 4096 and 4097 bytes, tamper, wrong key, wrong message, no downgrade, raw backward compatibility, end to end sign and verify of a 30,000 byte artifact through a signer that enforces the KMS limit, and a naive signer that fails on the same artifact)
- `packages/crypto/tests/unit/kms-signer.test.ts` (exactly 4096 bytes sent raw, longer sent as the 97 byte commitment and never raw)
- Live evidence, 2026-09-20, production commit 333786a: canonical record 4965 bytes, raw signature check false, commitment signature check true, offline verifier `valid: true` against `GET /keys/default`, `verifications[0].status` `VERIFIED`, no `ValidationException` in the runtime log
- `python/parmana/crypto/offline_verifier.py`, `python/tests/test_offline_verifier.py` (TypeScript signs a large record as a commitment and the independent Python verifier accepts it, rejects a tampered copy, and rejects a commitment signature over a small message), `scripts/generate-offline-verifier-fixture.ts`

## 2.38 Signing Readiness Before Release, Explicit Failure After Release

Before an action is released to a connector, the runtime proves that the evidence signing path can currently produce a signature that verifies. If it cannot, the request is refused with `503 SIGNING_UNAVAILABLE` and nothing is executed. If the action was released and the signed Execution Trust Record then cannot be produced or persisted, the failure is reported as `500 EXECUTION_RECORD_INCOMPLETE`, naming the `businessTransactionId` and `authorizationId`, with a critical log event, instead of a generic `500` that reads as "nothing happened". The decision is recorded in `docs/internal/adr/ADR-0011-Signing-Readiness-And-Explicit-Post-Release-Failure.md`.

- The probe (`VerificationCrypto.probeSigning()`) signs a synthetic artifact over 4096 bytes through the same signer and key id used for trust records and verifies it against the public key the same signer publishes. It catches a missing, disabled or denied key, a KMS or network outage, a signing and verification key mismatch, and the KMS size limit.
- A success is cached for 60 seconds, a failure is never cached, and concurrent requests share one probe.
- It is enforced everywhere except when `NODE_ENV` is exactly `test` or `development`, and no environment variable can switch it off in production.
- A failure before release, such as a policy rejection, is not reclassified as a released action.

Scope, stated plainly:

- This does not guarantee that every executed action has a signed trust record. A transient failure between the readiness check and the real signing, or a database failure after release, still leaves an executed action with no signed record. It narrows the window and makes the failure explicit and reconcilable. **Superseded on 2026-09-21 by section 2.39:** a signed Execution Intent is now stored before release, and a missing record can be rebuilt.
- There was no two phase record and no rebuild path for a missing record (G-53 in `docs/internal/VERIFICATION-GAPS.md`) when this section was written. Section 2.39 adds both, with the limits stated there.
- Verified in tests. The failure responses (`503 SIGNING_UNAVAILABLE`, `500 EXECUTION_RECORD_INCOMPLETE`) are proven in unit tests, not by live fault injection.

Evidence

- `packages/runtime/src/SigningReadiness.ts`, `RuntimeEngine.ts`, `Runtime.ts`, `errors/SigningUnavailableError.ts`, `errors/ExecutionRecordIncompleteError.ts`
- `packages/crypto/src/VerificationCrypto.ts` (`probeSigning`), `packages/api/src/bootstrap/createSigningReadiness.ts`, `packages/api/src/application.ts`
- `packages/runtime/tests/unit/signing-readiness.test.ts` and `execution-record-incomplete.test.ts` (readiness failure leaves the release counter at zero, failure after release is `EXECUTION_RECORD_INCOMPLETE` with the identifiers and a critical log, a persistence failure is reported the same way, a policy rejection before release is not reclassified)
- `packages/crypto/tests/unit/signing-probe.test.ts` (matching key passes, missing key fails, mismatched public key fails)
- `packages/api/tests/unit/bootstrap/create-signing-readiness.test.ts`

---

## 2.39 Execution Intents: Signed Evidence Before Release, and a Repair Path

**Claim.** Before an action is released to a connector, the runtime signs an Execution Intent and stores it. If the intent cannot be signed or stored, nothing is released, and the caller gets `503 EXECUTION_INTENT_UNAVAILABLE`. So every released action has a signed intent that was stored before the release. If the signed Execution Trust Record cannot then be produced or stored, it can be rebuilt from the execution context saved after release, with `POST /execution-intents/{businessTransactionId}/finalize`. Finalize never calls the connector. The decision is recorded in `docs/internal/adr/ADR-0012-Signed-Execution-Intent-Before-Release.md`.

**What the intent contains.**

- The intent is a separate record, in its own table (`execution_intents`). The Execution Trust Record keeps its format, and both SDK verifiers verify it unchanged.
- It signs the identifiers, the policy reference and its content hash, the signal and business transaction hashes copied from the signed authorization, the action, the target, the submitter, the granted capability and the creation time. It never signs the execution result, or the raw intent parameters.
- The signature uses the same key as the Trust Record. It can be verified with the public key alone, through `POST /execution-intents/verify` (no credential) or offline with `scripts/verify-execution-intent.ts`.
- The operational state (`PREPARED`, `RELEASED`, `FINALIZED`, `ERRORED`) is stored beside the intent and is not signed. Status updates after release are best effort. They never throw, and they log at critical severity if they fail.

**Finalize.** Finalize is idempotent and safe under concurrent calls. An existing record is returned, and nothing is rebuilt. It verifies the record and generates the receipt. Once an intent is `FINALIZED`, the saved execution context is deleted, because the Trust Record holds it. `finalize` and `GET /execution-intents/unfinalized` need a credential for a verified human. Any other caller is refused with `403 NON_HUMAN_CALLER_DENIED`.

**Enforcement.** Intents are required everywhere except when `NODE_ENV` is exactly `test` or `development`, where `EXECUTION_INTENTS_CHECK=true` turns them on. No environment variable switches them off in production. `GET /ready` reports `NOT_READY` when the table is missing.

**Scope and limits.**

- **An intent proves what was about to be released.** It does not prove that the action was released, or what its result was. An intent in `PREPARED` or `ERRORED` means the action may or may not have run. Only the connector can say which.
- **Every released action does not always get a signed Trust Record.** `EXECUTION_RECORD_INCOMPLETE` is still possible. It can be repaired when the execution context was saved (state `RELEASED`). When that save also failed (state `PREPARED`), finalize refuses with `409 EXECUTION_INTENT_RESULT_NOT_RECORDED`, and the outcome has to be established from the connector by hand.
- **An operator can close an intent by hand** with `POST /execution-intents/{businessTransactionId}/resolve`, after reconciling it at the connector (G-54). The record of this is an attributed statement of what the operator found (`NOT_EXECUTED` or `EXECUTED`), with a required note. It is not signed, is not tamper evident, and does not create a Trust Record. It never calls a connector, and it refuses a `RELEASED` intent (finalize applies to those), a `FINALIZED` intent, and any transaction that already has a Trust Record.
- **SDK methods.** The TypeScript and Python SDKs have methods for the intent routes (G-55). The Python SDK includes an offline intent verifier. Check the SDK changelog for the version that includes each method.
- **Earlier transactions.** Transactions created before this change have no intent, and their behaviour is unchanged.
- **Migration first.** Deploying this version without the migration `supabase/migrations/20260921120000_add_execution_intents.sql` makes every execution fail closed with `503 EXECUTION_INTENT_UNAVAILABLE`. That is by design, and `GET /ready` reports it first.

**Live check.** On 2026-09-21, against a production build, a real PostgreSQL, a real KMS signing key and a real agent, with a staging payment connector using fake credentials, the check ran four scenarios: a normal request, a released action whose record could not be stored and was then rebuilt by finalize, an intent that could not be stored (refused without calling the connector), and a connector failure that was closed by hand. The run passed, 37 of 37 checks. Its details are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md). Not verified: signing from a Vercel deployment, latency from Vercel, and a real payment.

**Evidence.**

- `packages/shared/src/domain/execution-intent.ts`
- `packages/crypto/src/ExecutionIntentCrypto.ts`, `ExecutionIntentCanonicalView.ts`, and `OfflineVerifier.ts` (`verifyExecutionIntentOffline`); `scripts/verify-execution-intent.ts`
- `packages/runtime/src/ExecutionIntentBuilder.ts`, `ExecutionIntentService.ts`, `ExecutionIntentFinalizer.ts`, and `RuntimeEngine.ts`
- `packages/storage/src/supabase/SupabaseExecutionIntentRepository.ts`; `supabase/migrations/20260921120000_add_execution_intents.sql`
- `packages/api/src/routes/execution-intents.ts`; `packages/api/src/bootstrap/createExecutionIntents.ts`; `packages/api/src/routes/ready.ts`
- `packages/runtime/tests/unit/execution-intent.test.ts` (intent signed and stored before release; a failed store releases nothing; finalize rebuilds a verifiable record without a second release; idempotent and race safe)
- `packages/crypto/tests/unit/execution-intent-crypto.test.ts` (offline verification, tamper detection)
- `packages/api/tests/integration/execution-intents.integration.test.ts` (the routes, the authorization rules, and the repair over HTTP)
- `docs/site/concepts/execution-intents.mdx` (the operator procedure)

Dated updates and the live-check detail are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.40 Self Hosted Deployment: One Command Start, Enforcement With No Internet Route (Scoped)

A customer can run Parmana on its own infrastructure with one command, `docker compose up -d --build --wait`, and that deployment authorizes, refuses, executes and signs evidence with no route to the internet and no call to the hosted service. Decisions, signatures, the audit trail and the Trust Records stay in the deployment's own Postgres, and a Trust Record it produces verifies anywhere with only the public keys.

- The start needs only Docker on the host. `setup` makes the two Ed25519 key pairs and an API key inside the image and keeps them on every later start. `migrate` creates the roles the migrations expect and applies each migration once, recorded in `parmana_schema_migrations`. `seed` copies the shipped policies into the database without overwriting any version already there. `api` is the unchanged production image, run with `PARMANA_STORAGE=postgres`.
- `PARMANA_STORAGE=postgres` selects the same Postgres storage as `supabase` (G-57). `supabase` is unchanged for existing deployments.
- Every production rule is kept, none is relaxed for the self hosted path: caller authentication, the rule that a key acts only for its own principal, policy governance before a policy may authorize, the HTTPS only connector URL, Execution Intents, signing readiness and refusal recording.

Scope, stated plainly:

- **A new deployment authorizes nothing until its own people approve the policies they use** through policy governance (2.26, 2.35). `seed` does not approve them. API keys for the proposer and approver are issued inside the image (`docker/local/api-keys.mjs`). Signing the approval no longer needs the repository: the TypeScript SDK 1.3.0, published on npm on 2026-09-25, signs it (2.41, `docs/internal/VERIFICATION-GAPS.md` G-62, closed). The Python SDK 1.3.0, published on PyPI the same day, signs it too.
- An authorized action whose connector cannot be reached, times out or answers with an error returns `502 EXECUTION_OUTCOME_UNKNOWN` with the transaction's identifiers, matching the Execution Intent's `ERRORED` state (G-63, closed 2026-09-25; before, a bare `500`).
- Verified on Docker Desktop 29.8.0 on Windows 11 and on Linux in CI run 36113024609 (`.github/workflows/docker-image.yml`, job `self-hosted`, 2026-09-25, on the merge commit `a14bc5c`). CI repeats it on every change to the deployment files, and also runs every command of the quickstart page and compares the output (`docker/local/quickstart-check.sh`).
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
- `packages/shared/src/config/StorageProviders.ts` (`isPostgresStorage`), `packages/storage/src/StorageFactory.ts`, `packages/api/src/bootstrap/assertStorageConfigured.ts`, `packages/api/src/routes/ready.ts`
- `packages/storage/tests/unit/storage-factory.test.ts`, `packages/api/tests/unit/bootstrap/assert-storage-configured.test.ts`, `packages/api/tests/unit/routes/ready.test.ts`, `packages/shared/tests/unit/config-validation.test.ts`
- `.github/workflows/docker-image.yml`, job `self-hosted`
- `docs/site/self-hosted/` (the operator guide: overview, quickstart, policy approval, API keys, connectors, offline verification, operations, configuration, troubleshooting), `docker/local/api-keys.mjs`, `docker/local/examples/refund-request.mjs`, `docker/local/quickstart-check.sh`; `docs/internal/VERIFICATION-GAPS.md` G-56 to G-63

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
- `docs/site/sdks/api-coverage.mdx`, `docs/site/sdks/typescript.mdx`, `docs/site/sdks/python.mdx`; `docs/internal/VERIFICATION-GAPS.md` G-62 and G-64

## 2.42 A Signed Human Approval Is Required Where a Policy Declares It

**Update (2026-11-05, G-149).** At release, the execution gateway refuses an authorization that has no `signalsHash` when the signal state verifier is configured. Before this change such an authorization skipped the release-time signal check and counted as a pass. Only authorizations issued before the hash was added are refused.

**Claim.** A policy can require a signed approval from a trusted approver before an action runs. Such an approval is for one order or resource, covers one amount, and is used once. A request whose declared facts say an approval was given, but with no signed approval behind that statement, is refused at any amount.

**How it works.**

- A policy lists the facts that need a signed approval, in `approvalSignals`, with dot paths to the resource (or the Intent's `target`) and, optionally, the value in the Intent. No code is needed per action.
- `ApprovalSignalVerifier` enforces every declaration. It runs when the policy would approve, before the authorization is signed, and again in the Execution Gateway just before release. At release it checks the policy the gateway loaded and hash-checked.
- It checks that the approver is trusted and not revoked, the Ed25519 signature, the expiry, the action, the resource, and the value. The value is read from the Intent, never from the caller's declared facts. It checks every approval before it uses any, and it uses each approval once.
- An approval's `scope.field` must be `value` when the declaration gives a value path, and `resourceId` otherwise. An approval signed with another field name is refused.
- `PolicyValidator` rejects a declaration that no rule reads, a resource path other than `target` or a path into the Intent's parameters, a declared key that is also bound, and two declarations that share an approval.
- Approvers sign on their own machine, with `scripts/sign-approval.ts`, using a key made by `scripts/generate-approver-key.ts`. Approver keys are Ed25519, whatever signing algorithm the server uses.

**Refunds.** The refund policy, `customer-refund`, now requires a signed approval for every refund (1.2.0, see 2.44). Earlier versions used amount tiers. Under the earlier tiers, a refund above 10000 needed a signed approval, and a refund above 100000 was refused.

**Scope and limits.**

- **The approver list is short.** Only the approvers in `TRUSTED_APPROVAL_ISSUERS` can sign, and an approval from anyone else is refused (2.45).
- **A refused request is not held for a person, and nobody is notified.** The agent sends a new request with the approval. Notification is covered by 2.46.
- **Caller-declared facts cannot approve.** Facts such as `refundEligible` and `fraudCheckPassed` can refuse a refund but cannot authorize one (G-51, and 2.44).
- **The agent path is new.** The refund agent forwards a signed approval, in the `approvalArtifact` field of its request. That path has not been run in production.

**Evidence.**

- `packages/approval/src/ApprovalSignalVerifier.ts`
- `packages/policy/src/types/Policy.ts` (`approvalSignals`) and `packages/policy/src/PolicyValidator.ts`
- `packages/execution-gateway/src/ExecutionGateway.ts` (passes the verified policy at release)
- `packages/crypto/src/ApprovalArtifactCrypto.ts`
- `scripts/generate-approver-key.ts` and `scripts/sign-approval.ts`
- `docs/site/concepts/human-approval.mdx`
- `packages/approval/tests/unit/ApprovalSignalVerifier.test.ts`
- `packages/policy/tests/unit/PolicyValidator-approvalSignals.test.ts`
- `packages/crypto/tests/unit/approval-artifact-signer.test.ts`
- `packages/approval/tests/unit/ApprovalVerifier.test.ts`

Dated updates for this claim are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## 2.43 A Live Action's Policy Version Is Decided by Policy Governance, Not by a Deploy (Scoped, 2026-09-27)

For a capability in `CANONICAL_CAPABILITY_POLICY_BINDINGS`, the policy name is fixed in code and the version is the one most recently approved for that name through policy governance. A new version takes effect when a second caller, other than the proposer, approves it; approving an older version again rolls back to it. No code change and no deploy. The server checks that the two callers differ, not that they are two people: in production on 2026-09-28 both credentials are held by one person.

- A request that names the bound policy at any other version, including an older version that was approved in the past, is refused before any rule runs, with a message naming the version in effect.
- No approved version, or a failed lookup of it, refuses the request.
- Where policy governance is not enforced (`NODE_ENV` test and development, unless `POLICY_EXECUTION_VERIFICATION_ENFORCED` is `true`), the version written in the table applies. The two are switched on by the same rule.

Scope, stated plainly:

- **Merged and deployed** 2026-09-27 (PR #47 into #46, then #46 into `main`, merge `4eebd5f`). Production's `customer-refund` versions in effect were not checked after the deploy.
- Binding an action to a different policy name, adding a capability, and adding an approver still need a deploy.
- Agents must send the version in effect. After an approval, requests naming the previous version are refused until agents update. **Added 2026-09-28:** `GET /policies/in-effect?capability=<action>` returns the policy to declare right now, from the same `CapabilityPolicyBinder.policyInEffect` the check uses, so an agent that asks before each request needs no update when a version is approved. It answers a caller whose key may invoke the capability, or a human caller (`packages/api/src/routes/policy-in-effect.ts`).
- The version is read from the latest approval record without verifying it; the same request then verifies that record's signature and content hash (2.35, 2.36), so a record changed outside the API refuses the request.

Verification

- `packages/api/tests/unit/GovernedPolicyVersion.test.ts` (5, through `RuntimeBuilder` with governance enforced): no approval refuses; an approved 1.0.0 runs; approving 1.1.0 makes it current and refuses 1.0.0; approving 1.0.0 again rolls back; a failed lookup refuses. Without the version source, 2 of the 5 fail.
- `packages/capability-registry/tests/unit/CapabilityPolicyBinder.test.ts` (15), `packages/api/tests/unit/bootstrap/create-current-policy-version-source.test.ts` (10), `packages/storage/tests/unit/policy-change-approval-record-most-recent-for-name.test.ts` (2).

Evidence

- `packages/capability-registry/src/CapabilityPolicyBinding.ts` (`CurrentPolicyVersionSource`, async `CapabilityPolicyBinder`)
- `packages/api/src/governance/GovernedPolicyVersionSource.ts`, `packages/api/src/bootstrap/createCurrentPolicyVersionSource.ts`, `packages/api/src/application.ts`
- `packages/runtime/src/RuntimeBuilder.ts` (`withCurrentPolicyVersions`), `RuntimeFactory.ts`, `RuntimeEngine.ts`
- `packages/shared/src/repositories/policy-change-approval-record-repository.ts` (`findMostRecentForName`), `packages/storage/src/memory/` and `supabase/` implementations
- `docs/internal/VERIFICATION-GAPS.md` G-66

---

## 2.44 An Agent Cannot Authorize an Action by Declaring Facts

**Claim.** An AI agent can be manipulated by content it reads (prompt injection). For the actions below, the agent cannot authorize its own request by declaring facts. Each write needs a signed approval from a trusted person for that specific action, and the facts the agent declares can refuse a request but cannot approve it.

**Per action.**

- **LLM tool call (`llm-tool-call`).** `llm-tool-call` 1.1.0 approves only when `humanApproval` is true. That fact needs a signed approval for the specific tool.

Every approve rule in these policies requires an approval-backed fact to be true. A test checks the structure, not only examples: with every caller-declared fact at its most permissive value and no approval, each request is refused.

**Refusal reasons.** Refusal reasons stay specific. The policy files are public, and a caller can read its own Refusal Record, so hiding the reasons would not help. `connector-policies-not-self-authorizing.test.ts` requires that, for every bound capability that changes state, every approve rule needs an approval-backed fact on every path. A new capability fails that test until it is classified as a read or a write.

**Scope and limits.**

- **Every refund needs a person.** This is a product change: refunds up to the limit no longer run without a manager. Automatic refunds return only with an independent eligibility and fraud check that the server itself reads (a `SignalStateVerifier`). That check does not exist yet.
- **Any trusted approver can sign for any action.** Approvers are not limited per action (G-50). The approver list is short (2.42).
- **Versions are pinned.** Production runs the policy version most recently approved through maker checker (2.43). A superseded version is refused for every policy, before authorization and at release. This also means an older approved version cannot be named to get weaker rules. Approving an older version again rolls back (G-74).
- **No connector runs an LLM tool call.** On the hosted API, an approved `llm-tool-call` decision executes nothing.
- **Connector configuration is outside this claim.** Whether a given deployment has a connector configured does not change the rules above.

- **Injected content still reaches the agent.** Parmana does not stop the agent from reading injected instructions, so an agent can still ask for the wrong write. The claim is that the write cannot be approved without a human signature, not that the request is never made. An approval that is forged, widened after signing, redirected to another order, or replayed is refused. Tested in `packages/approval/tests/unit/injected-instruction-cannot-approve.test.ts` (G-141, issue #433). Refused requests are recorded and signed.

**Evidence.**

- `packages/approval/tests/unit/injected-instruction-cannot-approve.test.ts`
- `policies/customer-refund/1.2.0/policy.json`
- `policies/llm-tool-call/1.1.0/policy.json`
- `packages/capability-registry/src/CapabilityPolicyBinding.ts` (the bindings for these capabilities)
- `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts`
- `packages/policy/tests/unit/CustomerRefundPolicy120.test.ts`
- `packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts`
- `examples/tutorials/119-human-approval-for-one-action`

Dated updates and the production approval history for these policies are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md). The text this section had before this rewrite is in the git history of `main`.

## 2.58 Signing Keys Are Loaded From a Secret Manager at Startup, Not From an Environment Variable (Scoped, 2026-11-07)

**Claim.** When `PARMANA_KEY_MATERIAL_SECRET` is set, the server reads its signing keys at startup from one AWS Secrets Manager secret, using the platform's own identity. The environment holds a reference to the secret, not the key. The server writes any missing key file and never overwrites one that exists. It refuses to start the reference path unless `PARMANA_SECRETS_PROVIDER` is `aws-secrets-manager`.

**Scope.** Tested with a fake secrets provider (`packages/api/tests/unit/bootstrap/load-key-material-secrets-manager.test.ts`). Not yet run against AWS Secrets Manager. Production still reads its keys from `PARMANA_KEY_MATERIAL_JSON` until the move on 10 November 2026, so this claim does not yet hold for production. The Vercel identity that reads the secret is not yet verified. See `docs/internal/runbooks/SECRETS-MANAGER-KEYS.md` and G-161.

**Evidence.**

- `packages/api/src/bootstrap/loadKeyMaterialFromSecretsManager.ts`
- `packages/api/src/bootstrap/assertSigningKeyMaterialConfigured.ts` (`writeKeyMaterialJson`)

## 2.59 Schema Version 3 Hybrid Records Verify in the SDKs, Including the Whole-Record Message (Scoped, 2026-11-07)

**Claim.** The Python and TypeScript SDKs verify a hybrid Execution Trust Record: one Ed25519 entry and one ML-DSA-65 entry. For schema version 3, the signed message covers every top-level field except `signature`, `signatures`, `schemaVersion`, `verifications` and `receipts`. A field added or a covered value changed after signing makes the record invalid. The result reports `coverage: "full"` when this holds.

**Scope.** The server still issues schema version 2. Turning schema version 3 on is a separate step, not yet taken (parmana-core #291). ML-DSA-65 needs `cryptography` 47 or later in Python and Node 24 or later in TypeScript. The TypeScript SDK no longer supports Node 20 or 22.

**Evidence.**

- `python/parmana/crypto/offline_verifier.py` (`_verify_hybrid_entries`, `_hybrid_message`)
- `typescript/src/crypto/offline-verifier.ts` (`verifyHybridEntries`, `hybridMessage`)
- `typescript/test/whole-record-v3-offline.test.ts`, `python/tests/test_whole_record_v3_offline.py`
- The fixture is written by the server's own signing code: `scripts/generate-whole-record-v3-fixture.ts`

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

## 3.11 Durable, Third-Party-Verifiable Refusal and Audit Records (RFC-0021, Scoped)

Every policy `REJECT` decision reachable through `RuntimeEngine.execute` — an ordinary `PolicyEngine.evaluate` rejection or a `SignalIntentBinder` binding-violation rejection — produces a signed, durable **Refusal Record**, independently third-party-verifiable the same way an Execution Trust Record's signature is, without requiring a caller credential or database access to check. This closes what was previously true of this codebase: an approved execution left cryptographic evidence behind (the Execution Trust Record and its signature); a refused one left only an HTTP response and whatever the caller's own logs happened to capture.

`RefusalRecordBuilder` (`packages/runtime/src/RefusalRecordBuilder.ts`) builds the record from the rejected transaction, its `Decision`, the executed intent's target/parameters, and any `SignalIntentBinder` violations; `RefusalCrypto` (`packages/crypto/src/RefusalCrypto.ts`) hashes and signs it with the same `FileKeyProvider`/`DEFAULT_KEY_ID` signing stack every other artifact in this document uses — one root of trust, not a separate one for refusals. `POST /refusal/verify` (`packages/api/src/routes/refusal-verify.ts`) verifies a submitted Refusal Record's signature and returns `{ valid }`; like `POST /audit/verify` below, it is deliberately mounted ahead of caller-auth middleware — no API key, no lookup by id, nothing but the artifact itself and Parmana's public key, which is precisely what makes a refusal independently checkable by whoever received the rejection, not only by Parmana.

Separately, and closing the analogous gap for caller-authentication audit trails (2.16, 2.19): every event a **production** audit sink writes is now signed at write time with `AuditEventCrypto` (`packages/crypto/src/AuditEventCrypto.ts`, the same signing stack again), stored alongside the event as a `signature_json` column. `POST /audit/verify` (`packages/api/src/routes/audit-verify.ts`) verifies any event matching this generic signed-event shape — `CallerAuditEvent` today — through one route, since `AuditEventCrypto.verify()` operates on canonical bytes and a signature alone, never dispatching on the event's own `type`.

**Policy content hash (2026-10-06).** A Refusal Record carries `policyContentHash`, the SHA-256 hash of the policy content that decided it, computed by `RuntimeEngine` from the policy that loaded, the same value an Execution Trust Record carries in `transaction.policy.contentHash`. It is inside the signed canonical record (`RefusalCrypto.canonicalRecord`), so changing, removing or adding it fails verification. Refusal Records written before that date have no `policyContentHash`; an absent field is left out of the canonical form, so they hash exactly as before and still verify (pinned in `crypto-verifiers.exact.test.ts`). Stored in `refusal_records.policy_content_hash` (migration `20261006120000_add_refusal_policy_content_hash.sql`, nullable).

**Scope, precisely — two caveats, both load-bearing:**

1. **Refusal Record writing is evidentiary and fails open, deliberately, not fail-closed like caller-auth audit writes (2.19).** `RuntimeEngine.writeRefusalRecord` runs after `Decision` is built but is explicitly barred, by its own comment, from affecting, delaying past that synchronous attempt, or blocking the `executionGate.enforce()` rejection that follows it — a write failure is logged (`refusal_record_write_failed`) and swallowed, never thrown. The rejection itself is unaffected either way: a request that should be denied is still denied, correctly, whether or not its evidentiary record lands. What can be silently missing is the durable proof of _why_, not the correctness of the refusal itself. `RefusalRecordBuilder`/`RefusalRecordRepository` are also optional at construction (`RuntimeFactory`'s `refusalRecords` parameter); when omitted, no Refusal Record is ever written, by design, not by failure. Verified: `packages/runtime/tests/unit/refusal-record-fail-open.test.ts`.

   **Considered and rejected (2026-08-19): making this write atomic/fail-closed with the rejection response** (write the record synchronously before returning to the caller; a storage failure would surface as `500` instead of `403`). Rejected because it does not strengthen the property that actually matters — the request is already unconditionally denied, correctly, the instant `Decision` is built, regardless of whether the evidentiary write ever runs — and it introduces a new one: a Supabase hiccup would turn a _correct_ policy rejection into an opaque server error, a genuine availability regression (and a storage-pressure denial-of-service vector) for zero corresponding security gain. "Fail-closed" is the right discipline for whether a dangerous action executes; the refusal record is evidence _about_ a decision already enforced, not a gate on it. The existing remedy for a durability gap — logging `refusal_record_write_failed` loudly for an operator to reconcile — is the correct one; blocking the caller's response on it is not.

2. **Only production (Supabase) audit sinks sign.** `SupabaseCallerAuditSink` signs every event; `InMemoryCallerAuditSink` (test wiring, `NODE_ENV=test`) does not. This claim is therefore about the production deployment path specifically, not every configuration this codebase can run in. Existing rows written before this capability shipped remain unsigned; `signature_json` is nullable and additive, honestly reflecting that history rather than backfilling a signature that was never actually produced at write time.

A third, narrower operational note, not a scope caveat on the claim itself: `SupabaseCallerAuditSink` currently writes via a direct Postgres connection rather than PostgREST. This originated as a narrow workaround for a PostgREST schema-cache issue with one new column (Supabase support ticket SU-437429), but a production-readiness audit (2026-09-09) found the pattern has since been extended deliberately, repo-wide: **8 of the 9** `Supabase*` storage classes now write via `PostgresPoolFactory` rather than PostgREST/supabase-js, per `SupabaseExecutionTrustRecordRepository.ts`'s own comment — "part of removing PostgREST from every Supabase-backed table's failure modes, not just the audit sinks that broke first." This is no longer a single revertible patch pending one support ticket; it is the storage layer's current architecture. `SupabaseClientFactory` (the supabase-js/PostgREST client class this workaround originally planned to revert to) had zero remaining call sites as of that audit and was deleted the same day, along with its now-unused `@supabase/supabase-js` dependency (`docs/internal/VERIFICATION-GAPS.md` G-34) — a revert, if SU-437429 is ever resolved, would mean reintroducing a PostgREST client, not restoring one that still exists.

Evidence

- `packages/crypto/src/RefusalCrypto.ts`, `AuditEventCrypto.ts`

- `packages/runtime/src/RefusalRecordBuilder.ts`, `RuntimeEngine.ts` (`writeRefusalRecord`, fail-open by design)

- `packages/shared/src/domain/refusal-record.ts`, `repositories/refusal-record-repository.ts`

- `packages/storage/src/memory/MemoryRefusalRecordRepository.ts`, `supabase/SupabaseRefusalRecordRepository.ts`

- `packages/api/src/routes/refusal-verify.ts`, `refusal-get.ts`, `audit-verify.ts`

- `packages/api/src/auth/SupabaseCallerAuditSink.ts`, `InMemoryCallerAuditSink.ts` (signs / does not sign, respectively)

- `04-INCIDENTS-LOG.md`, INC-7 ("Audit-sink events were durable but unsigned") — the incident this capability closes, including the PostgREST workaround noted above

- `docs/internal/rfcs/RFC-0021-Refusal-Record.md`

- `packages/api/tests/integration/refusal-record.integration.test.ts` (6 tests), `audit-verify.integration.test.ts` (4 tests, corrected 2026-08-24, previously cited as 5): real `POST /refusal/verify` and `POST /audit/verify` HTTP requests — valid signature accepted, tampered payload rejected, mounted ahead of caller-auth (no credential required)

- `packages/runtime/tests/unit/refusal-record-fail-open.test.ts` (2 tests): a Refusal Record write failure does not affect the returned rejection

- `packages/storage/tests/unit/supabase-refusal-record-repository.test.ts` (4 tests)

---

## 3.12 Retired: separately published verification package

A separately published package once shipped signing, verification and canonical-hashing primitives that this repository's `@parmana/crypto` package also builds on. It is no longer in use. This repository does not depend on it, and its records are verified with `@parmana/verifier` (Node) or `parmana-verifier` (Python), or with the in-repository offline verifier in `packages/crypto`.

## 3.13 Hybrid (Ed25519 + ML-DSA-65) Signing Capability (Scoped)

Trust Records and Receipts can be dual-signed with both Ed25519 and ML-DSA-65 (post-quantum) at once, and verification can require both to independently pass. This is a built, tested capability, not yet a deployment: `CRYPTO_MODE` remains `single` by default, Ed25519 alone, everywhere this codebase runs today, including the production deployment (`parmana-api-real.vercel.app`). This claim is about what exists and is proven correct when explicitly turned on, not about what is currently running.

`HybridSignatureProvider` (`packages/crypto/src/HybridSignatureProvider.ts`) signs an artifact with both algorithms and verifies fail-closed: `verify()` requires exactly one entry matching the primary algorithm and one matching the secondary — a missing, extra, duplicated, or wrong-algorithm entry rejects, never a partial pass. `ExecutionTrustRecord` and `Receipt` (`packages/shared/src/domain/execution-trust-record.ts`, `receipt.ts`) gained two optional fields, `schemaVersion` and `signatures` (an array of `SignatureEntry`, `packages/shared/src/domain/signature-entry.ts`), additive only: the pre-existing single `signature` field is computed exactly as before, over exactly the same canonical content as before, so every record signed before this capability existed — and every record signed after it while `CRYPTO_MODE=single` — verifies completely unchanged. `signatures` is populated, and `schemaVersion` set to `2`, only when `CRYPTO_MODE=hybrid` is active at signing time.

`CRYPTO_MODE` (`packages/shared/src/config/CryptoAlgorithms.ts`'s `CryptoModes`, validated by `parseCryptoMode` in `ConfigValidation.ts` the same way every other config enum in this codebase is — an invalid value now fails closed at startup, rather than the untyped pass-through it was before this capability existed) is read by `VerificationCrypto.signHybrid()` and `ReceiptCrypto.createReceipt()` specifically, not globally: every other signing surface in this codebase (execution authorization, gateway attestation, connector signing) reads only `PRIMARY_SIGNATURE_PROVIDER` and is completely unaffected by `CRYPTO_MODE`, whatever it's set to. `BusinessTrustRecordBuilder` calls `signHybrid()`, in addition to its existing, unchanged `sign()` call, exactly when `CRYPTO_MODE=hybrid`. Verification mirrors this: `VerificationCrypto.verifySignature()` always checks the legacy `signature` field, and additionally, only when a record's `signatures` array is present and non-empty, requires every entry in it to independently verify too — both checks must pass for a hybrid-shaped record; a record with no `signatures` field verifies exactly as it always has.

The secondary (ML-DSA-65) key lives at a distinct keyId, `default-secondary` (`DEFAULT_SECONDARY_KEY_ID`, `packages/crypto/src/KeyProvider.ts`), alongside the existing `default` Ed25519 key under the same `PARMANA_KEY_DIR` — generated with `npm run generate:hybrid-secondary-key`. A missing secondary key file, or `CRYPTO_MODE=hybrid` without `SECONDARY_SIGNATURE_PROVIDER` configured, fails closed (a thrown error, not a silent single-signature fallback) the first time hybrid signing is attempted.

**Update (2026-10-03, audit):** "the first time hybrid signing is attempted" was after the action had been released, so a missing key meant a released action with no Trust Record. The server now refuses to start in `CRYPTO_MODE=hybrid` unless every key pair the hybrid path reads is present (`assertSigningKeyMaterialConfigured`). It also refuses `CRYPTO_MODE=hybrid` with `KEY_PROVIDER=aws-kms`: both entries of the hybrid `signatures` array are signed with local key files, the Ed25519 one included, and under KMS that key has no local file. Evidence: `packages/api/tests/unit/bootstrap/assert-signing-key-material-configured.test.ts` (3 new cases).

**Required caveat, load-bearing:** The separately published verifier (3.12), the public SDK used for independent third-party verification, does not yet recognize the `signatures`/`schemaVersion` envelope shape. Today, a third party verifying a hybrid-signed record through the separately published verifier checks the legacy `signature` field only — that check is genuinely correct, not a false pass, since the legacy field remains a real, valid Ed25519 signature over the record. But it is a partial verification: it does not check the ML-DSA-65 signature, and therefore does not confirm the full hybrid guarantee this capability is designed to eventually provide. Updating the separately published verifier to recognize the new envelope shape is untracked, separate follow-on work, not part of this capability and not a dependency of it (see 3.12).

**Update (2026-10-03):** the caveat above is resolved for the separately published verifier and later (3.12): `verifyExecutionTrustRecordOffline` checks every entry in the `signatures` array as well as the legacy field, and reports `hybridSignaturesValid` separately, so a third party can confirm the full hybrid guarantee through the public package. Earlier versions of the separately published verifier still check the legacy field only.

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

- `docs/internal/VERIFICATION-GAPS.md` G-4 (the gap-tracking record of exactly which signing surfaces this covers and which it doesn't)

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

**Update (2026-09-10):** the fleet-wide scope gap this claim's own "Scope, precisely" paragraph named above is now closable. New `PostgresRateLimitStore` (`packages/storage/src/postgres/PostgresRateLimitStore.ts`), a real `express-rate-limit` `Store` backed by an atomic `INSERT ... ON CONFLICT` upsert against a new `rate_limit_counters` table (`supabase/migrations/20260910120000_add_rate_limit_counters.sql`). `createRateLimitStore.ts` wires it in when `DATABASE_URL` is configured -- both limiters then share counts fleet-wide, closing the `limitPerMinute * machineCount` gap for any deployment that scales past one machine. Deliberately not fail-closed the way `NonceStore`'s `DATABASE_URL` requirement is: without a configured database, both limiters fall back to the in-process default with a loud startup warning rather than refusing to start, since a looser-than-configured capacity ceiling is not the same class of gap as a missing security check. See `docs/internal/VERIFICATION-GAPS.md` G-41. This deployment's current shape (`fly.toml`'s `min_machines_running = 1`) means the gap this update closes was not yet live-exploitable here, but the fix removes the blocker to scaling out.

Evidence (update)

- `packages/storage/src/postgres/PostgresRateLimitStore.ts`, `packages/api/src/bootstrap/createRateLimitStore.ts`
- `packages/storage/tests/unit/postgres-rate-limit-store.test.ts` (7 cases), `packages/api/tests/unit/bootstrap/create-rate-limit-store.test.ts` (3 cases: test / production-without-DATABASE_URL / production-with-DATABASE_URL)

**Update (2026-09-28, G-78):** a third limiter, keyed by IP address, covers the unauthenticated routes that do work: `POST /refusal/verify`, `POST /execution-intents/verify` and `POST /audit/verify` (signature checks) and `/handbook` (a database write), one shared counter, `RATE_LIMIT_PUBLIC_PER_MINUTE`, default 60, with its own `public:` Postgres store when `DATABASE_URL` is set. Static documentation and key discovery (`/keys`, `/.well-known/jwks.json`) are not limited. Evidence: `createPublicRateLimiter` in `packages/api/src/middleware/rate-limit.ts`, `packages/api/tests/integration/rate-limit.integration.test.ts` (3 new: over the limit is `429` before the route runs; one counter across the four routes; it does not count against `/health`). The effective limit behind Vercel depends on how the platform reports client addresses (`trust proxy` is one hop), which was not checked live.

**Update (2026-10-03, audit):** the G-78 limiter above did not cover two unauthenticated paths that do work. Every request with a missing or invalid API key, on any authenticated route, writes a signed `caller.rejected` audit event (a KMS Sign call in production) before answering `401`, with no limit, so anyone could spend the signing capacity real requests need. A fourth limiter, keyed by IP address and mounted in front of caller authentication, now counts only `401` responses (`createAuthFailureRateLimiter`, `RATE_LIMIT_AUTH_FAILURE_PER_MINUTE`, default 30, its own `auth-failure:` Postgres store when `DATABASE_URL` is set); a request with a valid key is not counted. Key discovery (`GET /keys/:keyId`, `GET /.well-known/jwks.json`), which makes KMS calls per request in production, now shares the public limiter. Evidence: `packages/api/tests/integration/rate-limit.integration.test.ts` (4 new: bad keys over the limit get `429` and stop writing `caller.rejected`; valid keys do not count; `GET /keys/:keyId` over the public limit gets `429`; the public limiter does not count authenticated routes).

**Update (2026-10-03, follow up):** `KmsSigner` now caches successful `GetPublicKey` and `DescribeKey` answers in memory for 5 minutes, by region and alias, shared across signer instances in one process, so repeated key discovery and verification no longer cost a KMS call each. Concurrent lookups of one key share a call; a missing key or a failed call is never cached; `Sign` is never cached. Evidence: `packages/crypto/tests/unit/kms-signer.test.ts` (5 new).
---

## 3.15 SDK Dogfooding: Documented Quickstarts Now Proven to Actually Run (Scoped)

**Scope, precisely:** this claim covers the two documented "quickstart" example scripts — `python/examples/quickstart/run.py` and its closest TypeScript equivalent, `typescript/examples/02-execute.ts` — now being proven to actually work by an automated test, plus the real bugs found while proving that. It does **not** cover the other 11 numbered example scripts in `python/examples/`, the other 4 in `typescript/examples/`, or either SDK's full API surface; those remain unexercised by any test, same as before this pass.

Before this pass, both quickstart scripts already imported their respective SDK (`parmana` / `@parmana/sdk`) rather than raw HTTP — that part did not need rewriting. What neither had was anything that actually _ran_ them: `typescript/examples/` is explicitly excluded from `typescript/tsconfig.json`'s own `include` list, so nothing in this repository has ever built, type-checked, or executed it, and no test imported `python/examples/quickstart/run.py` either. Both were, until now, hand-written code that had never been mechanically proven to still work as the surrounding schema evolved.

**What dogfooding this found, checked directly against the current schema and each SDK's actual exported members, not assumed:**

- Every file in `typescript/examples/` (5 example scripts, 2 shared helpers) imported `@parmana/typescript-sdk` — a package name that has never existed anywhere in this repository's history, under any name this workspace has ever had (`@parmana/legacy-reference` before this session's earlier TypeScript-SDK-audit pass, `@parmana/sdk` after it). None of these files could have ever been run as committed.
- `typescript/examples/02-execute.ts` and `typescript/examples/shared/transaction.ts` referenced `AuthorityType.USER` and `BusinessTransactionStatus.RECEIVED` as if they were runtime enum members. This SDK's hand-maintained models type both fields as plain `string`/string-union types with no such runtime enum exported at all (`import * as sdk from "@parmana/sdk"; sdk.AuthorityType` is `undefined`) — both files would have thrown immediately on execution.
- `typescript/examples/04-replay.ts` called `client.replay({ businessTransactionId: "..." })`, an object, where `ParmanaClient.replay()` takes a plain `string` — would have sent a malformed request path.
- `python/examples/quickstart/run.py` passed plain Python strings (`"SERVICE"`, `"RECEIVED"`) where the real generated dataclasses (`Authority.authority_type`, `BusinessTransaction.status`) declare actual `AuthorityType`/`BusinessTransactionStatus` enum types — confirmed by `mypy`, not inferred. Harmless on the wire (a `str, Enum` member and a plain string with the same value serialize identically, so this never caused a wrong request), but a genuine type-safety defect the language's own type checker would have caught immediately had anything ever run it in that mode.

All four fixed. `typescript/examples/02-execute.ts` was additionally refactored into an exported `runExecuteExample(endpoint?)` (previously a bare top-level script with no importable entry point) and `python/examples/quickstart/run.py`'s body into an exported `run_quickstart(endpoint?)` returning the `ExecutionTrustRecord` — both changes made specifically so a test could call them, not a stylistic preference.

**Now proven, present tense, by a real running server each `npm test` / `pytest` run boots:** `typescript/test/integration/examples.integration.test.ts` imports and calls `runExecuteExample` against a real local server and asserts a signed, `APPROVED` Execution Trust Record comes back. `python/tests/test_quickstart_example.py` does the same for `run_quickstart`, additionally asserting the script's own documented printed output (README.md's "Expected output" section) still matches what it actually prints. `python/examples/quickstart/README.md`'s prerequisites and sample output, which still referenced the removed `payments:execute`/`vendor-payment` capability and its `VENDOR_PAYMENT_TOKEN` (docs/internal/VERIFICATION-GAPS.md G-27 removed it entirely, before this pass), were rewritten from a real captured run against `test:fixture-execute`, the fixture this script has actually targeted since that removal.

Evidence

- `typescript/examples/01-health.ts`, `02-execute.ts`, `03-verify.ts`, `04-replay.ts`, `05-policy-validation.ts`, `shared/client.ts`, `shared/transaction.ts` (package-name fix, all 7 files); `02-execute.ts`, `shared/transaction.ts` (enum-misuse fix); `04-replay.ts` (`client.replay()` argument fix)
- `typescript/test/integration/examples.integration.test.ts` (1 test): runs `runExecuteExample` against a real local server, asserts `trustRecordId` present, one `APPROVED` execution, `ed25519` signature
- `python/examples/quickstart/run.py` (`run_quickstart` extraction, `AuthorityType`/`BusinessTransactionStatus` enum fix); `python/examples/quickstart/README.md` (stale prerequisites/output rewritten from a real run)
- `python/tests/test_quickstart_example.py` (1 test): spawns a real local server with caller-auth disabled (matching the documented manual setup exactly, since `run_quickstart` never supplies an `api_key`), runs `run_quickstart` against it, asserts the returned record and the script's own printed output both match
- `mypy examples/quickstart/run.py` (Python): 3 errors before this pass's enum fix (2 real type mismatches plus one pre-existing, unrelated `datetime.UTC` 3.10-compatibility notice, unchanged), 1 after (only the unrelated notice remains)
- `npx tsc --noEmit` against `typescript/examples/**/*.ts` (TypeScript, checked directly — `typescript/tsconfig.json` itself does not cover this directory): clean after all fixes

---

## 3.16 Caller-to-Capability Scoping (Scoped)

Extends `ApiKeyEntry` with an optional `allowedCapabilities` field: the set of capabilities (`Intent.action` values, e.g. `test:fixture-execute`) a given key may invoke. Checked in `execute.ts`/`transactions.ts` before the transaction ever reaches `application.execute()` — i.e. before `CapabilityPolicyBinder`/`PolicyEngine.evaluate` are reached, neither of which is caller-aware by design (2.24, 2.16's own G-28 note). A caller attempting a capability outside its grant is rejected `403 CAPABILITY_NOT_ALLOWED` and the denial is audited (`caller.capability_denied`, `CallerAuditSink`), never silently. The default is fail-closed and deliberately the opposite of `allowedPrincipalIds`' own default: an unset or empty `allowedCapabilities` denies every capability — there is no "may invoke its own capability" fallback the way there is a "may only assert itself" fallback for principals. The literal string `"*"` is an explicit, auditable wildcard grant, never an implicit default. `GET /callers/me` returns an authenticated caller's own resolved identity and scope (`callerId`, `allowedPrincipalIds`, `allowedCapabilities`, `unrestrictedCapabilities`) — self-lookup only, no key material — as the proof artifact a security review can point to.

**Scope, precisely:** this mechanism is implemented, tested, and enforced for every caller that authenticates through a caller-auth-enabled path. No built in connector is in core in this version, so no production capability is scoped by it yet.

Evidence

- `packages/shared/src/config/ApiKeyEntry.ts` (`allowedCapabilities`, fail-closed-by-default doc comment, `"*"` wildcard convention)
- `packages/shared/src/config/ConfigValidation.ts` (`parseApiKeys` validates `allowedCapabilities` the same way as `allowedPrincipalIds`)
- `packages/api/src/auth/isCapabilityAllowed.ts` (fail-closed check, wildcard handling)
- `packages/api/src/routes/execute.ts` / `transactions.ts` (enforced before `application.execute()`; `403 CAPABILITY_NOT_ALLOWED`; denial audited via `recordCallerAuditEvent`)
- `packages/api/src/auth/CallerAuditSink.ts` (`caller.capability_denied` event type, `capability` field)
- `packages/api/src/routes/callers-me.ts` (`GET /callers/me`, resolved identity/scope, no key material)
- `supabase/migrations/20260812120000_add_capability_to_caller_audit_events.sql` (additive `capability` column, widened `type` CHECK constraint; not yet applied to any live project)
- `packages/api/tests/unit/isCapabilityAllowed.test.ts`, `packages/api/tests/integration/caller-capability-scoping.integration.test.ts` (allow/deny/fail-closed-default/wildcard, denial precedes policy evaluation, audit content, `/callers/me` self-lookup and resolved-defaults)

---

## 3.18 Deployment Infrastructure Requirements (Scoped)

**Claim:** running Parmana in production requires new infrastructure of its own — a container process, signing key material, and (for anything beyond a single ephemeral instance) a Postgres database via Supabase. Parmana does not read, write, or replace an integrated system's own database, and every connector it can call out to is additive and individually optional: unset its credentials and the connector is simply not registered, with no effect on Parmana's own boot or on the external system itself.

**New, required to run Parmana at all (`docs/site/deployment/production.mdx`, `Dockerfile`):**

- **A container process.** One Docker image (`Dockerfile`), one process per container, running `packages/api/dist/server.js`, deployable to any Docker-based platform — validated with a bare `docker build`/`docker run`, not tied to a specific PaaS's proprietary build system.
- **Signing key material.** Two key pairs (`default`, the authorization-signing key; `gateway`, the Execution Gateway's attestation-signing key — deliberately separate, `PARMANA_GATEWAY_KEY_ID` overridable) are required in `PARMANA_KEY_DIR`. Neither is generated automatically, and the image's `keys/` directory ships empty on purpose — key material must never be baked into the image (`Dockerfile`'s own comment). Supplied either as mounted `.pem` files or via `PARMANA_KEY_MATERIAL_JSON`. `assertSigningKeyMaterialConfigured.ts` (`packages/api/src/bootstrap/`) fails closed at boot — before the port binds — if neither is present.
- **A Postgres database, via Supabase, for anything other than a disposable single instance.** `PARMANA_STORAGE=memory` (the default) needs no external database for business-transaction/execution-trust-record data — but the caller-authentication audit trail (`CallerAuditSink`) and the envelope-verifier's replay-protection store (`NonceStore`) are **always** Supabase-backed in any non-test deployment, never falling back to in-memory regardless of `PARMANA_STORAGE`, and both fail closed at boot if `DATABASE_URL` is not configured — via `assertDatabaseUrlConfigured.ts`, called unconditionally from `createCallerAuditSink.ts`/`createNonceStore.ts` (not `assertStorageConfigured.ts`, which validates only business-transaction/execution-trust-record storage, gated on `PARMANA_STORAGE=supabase` or `postgres`; see that file's own doc comment). `SUPABASE_URL` itself is not read by this check — `DATABASE_URL` is the only variable that satisfies it, a documented, temporary substitute pending resolution of Supabase ticket SU-437429. In practice, precisely stated: a real deployment always needs Supabase for the audit trail and nonce store; `PARMANA_STORAGE=supabase` additionally routes business-transaction/execution-trust-record storage through the same database rather than memory. There is no configuration under which a real (non-test) deployment runs with zero external database.
- **The schema applied to that database, manually.** `supabase/migrations/` must be applied to the target Supabase project before a real deployment can serve traffic — either `supabase db push` (Supabase CLI, if linked) or `scripts/apply-all-migrations.sql` (a concatenation of every migration file) via the Dashboard SQL Editor, on an empty database. **Corrected 2026-09-25:** this section used to call the bundle idempotent and safe to run again. It is not safe to run again on a database that holds data (`docs/internal/VERIFICATION-GAPS.md` G-61). The container itself does not migrate at boot. The Docker Compose deployment of 2.40 runs the migrations for it, each once, and since 2026-09-25 `npm run db:migrate` does the same for any Postgres, with `baseline` for a database set up with the bundle (G-61, closed).
- **Caller authentication configuration.** `PARMANA_API_KEYS` (a JSON array of `{callerId, keyHash}` entries) is required; the process refuses to start without it, unless `PARMANA_AUTH_DISABLED=true` is explicitly set for local development only (logs a loud warning on every boot — never set in a real deployment).

**Not new, not replaced:** an integrated business's own operational database, its own audit/SIEM infrastructure, and every external system a connector calls are untouched by any of the above. Parmana holds no credential for and makes no call to a connector's external system unless that connector is explicitly configured — an unconfigured connector has zero footprint against the system it would have integrated with. Parmana's own database (Supabase) stores only Parmana's authorization/audit/execution-trust-record data, never an integrated business's operational records; callers provide business context to Parmana via signals in each request, not the reverse.

**What this claim does not assert:** deployment footprint, cost, or scaling characteristics beyond what `docs/site/deployment/production.mdx` documents (this is a correctness/completeness claim about _what infrastructure is required_, not a capacity or performance claim); a packaged one-command installer, database-schema auto-migration at boot, or a signing-key-generation tool — none of these exist in this repository today (schema application and key generation are both manual operator steps, described above and in `docs/site/deployment/production.mdx`, not automated by anything Parmana ships). **Update 2026-09-25:** for the self hosted Docker Compose deployment, all three now exist and are claimed, scoped, in 2.40: one command start, migrations applied by the `migrate` service, and key and API key generation by the `setup` service. For the image run on its own, this paragraph still holds.

**Update 2026-10-06, server image provenance:** `.github/workflows/server-image.yml` builds this `Dockerfile` when a GitHub release is published, pushes it to `ghcr.io/pavancharak/parmana-api:<release tag>`, and attaches SLSA build provenance (`slsa-github-generator` `generator_container_slsa3.yml`) to the image digest in the registry. Claimed only once a release has run it; until then no published image exists. The provenance covers that image only: the hosted API and the sandbox are built by Vercel, not from this image, and carry no SLSA provenance. It shows which commit and workflow built the image, not that the image is free of defects.

**Update 2026-10-23, first published image:** release `server-v1.0.1` published `ghcr.io/pavancharak/parmana-api:server-v1.0.1` from commit `72a71f2`, digest `sha256:7e17dfb8e1e5e391cc0acd0a2a19801d1b1b888b529ee75a977846c219dce97c`, built on Node 24.22.1, with its SLSA provenance created, signed and attached (workflow run 39885625781, attempt 2). The first attempt and the `sdk-v1.6.1` run failed with `denied: permission_denied: write_package`: the package was linked to the old `parmana` repository. `parmana-core` now has write access to the package and the old repository's access was removed.

Evidence

- `docs/site/deployment/production.mdx` (the authoritative deployment runbook this claim is drawn from, which replaced the root `DEPLOYMENT.md` on 2026-09-28: required configuration, storage, schema application, caller authentication, health checks, graceful shutdown)
- `Dockerfile` (single-image, single-process build; `keys/` deliberately empty in the image; non-root runtime user)
- `packages/api/src/bootstrap/assertStorageConfigured.ts` (business-transaction/execution-trust-record storage, gated on PARMANA_STORAGE=supabase or postgres), `assertSigningKeyMaterialConfigured.ts` (fail-closed startup validation, before the port binds)
- `packages/api/src/bootstrap/assertDatabaseUrlConfigured.ts`, called unconditionally from `createCallerAuditSink.ts`/`createNonceStore.ts` (the actual fail-closed check for CallerAuditSink/NonceStore described above; checks DATABASE_URL only)
- `packages/shared/src/config/StorageProviders.ts` (`memory`/`postgres`/`supabase`), `packages/shared/src/config/Config.ts` (the sole `process.env` read site for application config)
- `supabase/migrations/` (schema source), `scripts/apply-all-migrations.sql` (manual application path with no CLI link)

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

Closes `docs/internal/VERIFICATION-GAPS.md` G-29: before this capability, four admission-time rejection paths — a malformed or oversized request body, a malformed `businessTransactionId`, a structurally invalid Business Transaction (`BusinessTransactionValidationError`), and a duplicate `businessTransactionId` (`DuplicateBusinessTransactionError`) — returned the correct HTTP status (`400`/`409`/`413`) but produced no durable record of any kind, the one remaining rejection category in this codebase neither `RefusalRecord` (3.11, policy `REJECT`s) nor `CallerAuditSink` (2.16/2.19/3.16/3.19, caller-identity denials) covered. All four now write a signed `caller.structural_rejected` `CallerAuditEvent` (`packages/api/src/auth/CallerAuditSink.ts`), carrying `reason` and, when the request got far enough to have one, `businessTransactionId`.

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

Closes `docs/internal/VERIFICATION-GAPS.md` G-46: before this capability, no dedicated periodic full-export existed for external audit/compliance review. `GET /trust-records/:id` returns one signed record at a time by ID; `GET /transactions` lists raw `BusinessTransaction`s (no execution/verification/receipt/authorization history); neither is a reviewer-facing export path.

New `GET /trust-records` returns the complete signed Execution Trust Record (transaction, executions, verifications, receipts, and the signed execution authorization) for every transaction on the requested page, not just the raw transaction `GET /transactions` returns. Scoping and pagination deliberately mirror `GET /transactions`'s own established shape exactly: `page`/`pageSize` query params over the same underlying `BusinessTransactionService.list()`, the same post-fetch `submittedBy` ownership filter (an authenticated caller sees only their own transactions), and the same bare-array, no-pagination-envelope response shape. Adds `since`/`until` (ISO 8601) to filter by `transaction.createdAt`, for a bounded date-range export rather than requiring a caller to page through their entire history.

**Scope, precisely:** this is a request/response export over HTTP, not a scheduled/automated export job, a CSV or regulator-specific report format, or an admin-only bulk-dump distinct from the ownership scoping every other route in this codebase already applies. A caller sees exactly the Trust Records they would already be entitled to fetch one at a time via `GET /trust-records/:id`. This capability makes fetching many of them at once practical; it does not widen who can see what.

Evidence

- `packages/api/src/routes/trust-records.ts` (`GET /trust-records`)
- `packages/runtime/src/ExecutionTrustApplication.ts` (`listTrustRecords()`): paginates the existing `BusinessTransactionService.list()` and resolves each page entry via the existing `ExecutionTrustRecordRepository.findByTransactionId()`, deliberately not a new repository-level `list()` method, since every transaction has exactly one Trust Record and this avoids requiring every repository implementation (in-memory, Supabase, and any future one) to grow new query surface
- `openapi/openapi.yaml` (`operationId: listTrustRecords`), `schemas/responses/trust-records-list-response.schema.json`
- `packages/api/tests/unit/trust-record-api.test.ts`: 3 new cases (empty before any execution; the full record matches the `/execute` response's own `trustRecordId` after one; `since`/`until` date-range filtering)

---

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
`docs/internal/evaluation/agentrust-refund/README.md` (`npm run evaluate:agentrust-refund`).

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

**Update (2026-10-29): Verified tier, scoped.** AgenTrust's `main` now sets `tier: verified` in
`integrations/parmana-server/integration.yaml`, read on 2026-10-29. The integration's README scopes that tier to the
offline fixture path: every connector result is a mock, `refundEligible` and `fraudCheckPassed` are declared by the
caller, and no conformance level is claimed. The earlier `community` entries above are the record at their dates.

**Where the replay refusal is checked.** The `replay` case (the approval from `valid-approval`, sent again with a new request) is refused with HTTP 403 `POLICY_DENIED`, zero connector invocations, and a Refusal Record whose `matchedRuleId` is `signal-state-verification-violation`, with the reason `managerApproved=true != verified managerApproved=false`: the approval is spent, so its verified state is false. The same run is in the AgenTrust integration merged as [integrations#294](https://github.com/agentrust-io/integrations/pull/294) (commit `6de4cb9`):

- Fixture: [`fixtures/03-replay.refusal-record.json` line 46](https://github.com/agentrust-io/integrations/blob/6de4cb9/integrations/parmana-server/fixtures/03-replay.refusal-record.json#L46), `matchedRuleId`.
- Test: [`tests/test_parmana_evidence.py` line 131](https://github.com/agentrust-io/integrations/blob/6de4cb9/integrations/parmana-server/tests/test_parmana_evidence.py#L131), `replay` has zero connector invocations. Run with `pip install -e ".[test]"` and `python -m pytest tests` in `integrations/parmana-server`.
- Its README row for this file says "refused, already used" ([line 30](https://github.com/agentrust-io/integrations/blob/6de4cb9/integrations/parmana-server/README.md#L30)). That wording is not the rule the fixture records, so it is not used here.

---

# Maturity Assessment (TRL)

This is the repo owner's own maturity assessment, layered on the evidence already cited above. It is not a new technical claim in the sense sections 2 and 3 use that word, and it does not carry its own separate test evidence — it is an interpretation of evidence that does.

**Current assessment, without relying on removed evidence: Technology Readiness Level 6** (system/subsystem model or prototype demonstration in a relevant environment). Basis: the claims still in this document. The connector evidence that supported this level has been removed with the connectors, so the level has not been re-assessed against the current code. The owner should decide whether it still holds.

Not claimed by this assessment: sustained volume, load-bearing traffic, high availability, multi-tenant production operation, or any current standing-public-endpoint proof for any capability.

---

# 4. Future Claims (Pending Evidence)

The following claims are planned but are intentionally withheld until supported by implementation, testing, audit, and documented proof.

- [FUTURE] Stripe connector: no implementation exists; would implement @parmana/connector-sdk's Connector interface.

- [FUTURE] Salesforce connector: no implementation exists.

- [FUTURE] SAP connector: no implementation exists.

- [FUTURE] ServiceNow connector: no implementation exists.

- [FUTURE] Workday connector: no implementation exists.

- [FUTURE] Jira connector: no implementation exists.

- [FUTURE] Database connector: no implementation exists.

- [FUTURE] Cloud credential providers: HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, and Google Secret Manager CredentialProvider implementations. Only the CredentialProvider interface seam exists today (StaticCredentialProvider, EnvironmentCredentialProvider); no cloud SDK dependency has been added.

- [FUTURE] A customer running the self hosted deployment (recorded 2026-09-25, narrowed the same day): not claimed. The deployment itself, its one command start and enforcement with no internet route are now claimed, scoped, in 2.40, after a recorded offline run. What stays future: any customer, bank, fintech or government body running it, on its own infrastructure, with its own people approving its policies. Promote this only with a record from that deployment: its own start, decisions recorded in its audit trail, and Trust Records it produced verified with only its public keys.

- Every production Runtime enforces the canonical trust pipeline.

- Every production API request executes through the canonical runtime. **Reconciliation note (not a promotion — remains withheld pending whatever broader evidence standard this section applies):** Phase 3D's Property C bypass search (§5.2 of the Phase 3D independent authorization certification, in git history) traced every route `packages/api/src/app.ts` mounts and confirmed only `POST /execute` reaches `application.execute()`/`RuntimeEngine`; every other route is read-only, verification-only, or a passive audit sink that never calls `executionSystem.execute()` or any connector. This is direct, current evidence bearing on this specific claim, scoped to the routes and connectors that exist today — flagged here so it isn't lost, without this reconciliation pass itself deciding whether it now meets this section's bar for promotion to §2.

- Replay semantically verifies every trust artifact.

- Every guarantee is fully proven through conformance testing.

- Every guarantee includes complete independent verification evidence.

- A general, named credential-brokering _mechanism_ — a formal product capability letting an arbitrary future connector class (e.g. third-party cloud credentials via AWS STS, per the July roadmap, removed 2026-09-28) prove "AI never possesses execution credentials" without bespoke per-connector work — does not exist; only the `CredentialProvider`/session-credential-vault pattern each connector individually implements does.

- Enterprise-grade key custody: current key storage is local PEM files read by FileKeyProvider; no KMS, HSM, or cloud key vault integration exists. **Narrowed (2026-09-15):** AWS KMS integration now exists and is verified end-to-end for the gateway signing key (see the 2026-09-15 update on the G-40 entry in this document, and `docs/internal/adr/ADR-0009-KMS-Secrets-And-Connector-Signature-Hardening.md`) — but it is not the default (`KEY_PROVIDER=local` remains the default; a deployment must explicitly opt into `KEY_PROVIDER=aws-kms`), production Vercel→AWS OIDC federation is not yet provisioned, and HSM/Azure Key Vault/GCP KMS remain entirely unimplemented. The "no KMS integration exists" framing above is accurate only for a default, unconfigured deployment.

- Authority, Intent, and Evidence verification checks in verification-service.ts. Only integrity, signature, and authorization binding are implemented today (2.15). The prior six-stage pipeline package (@parmana/verification) was retired in Session 5; it had no real implementation and no real test coverage; its stage architecture is not being resurrected. Authority/Intent/Evidence checks, if built, will be added directly to verification-service.ts. Tracked for Session 6.

- Algorithm migration: re-keying from one signature provider to another (for example Ed25519 to ML-DSA-65) while retaining the ability to verify previously-signed records. AuthorizationVerifier does not dispatch verification based on the envelope's algorithm field; a verifying process supports exactly one configured SIGNATURE_PROVIDER at a time.

- [FUTURE] `CRYPTO_MODE=hybrid` running anywhere in staging or production: the capability described in 3.13 is built and tested but not wired into any deployed environment. `PRIMARY_SIGNATURE_PROVIDER=ed25519` alone remains the configuration everywhere this codebase currently runs.

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

- That a refused decision escalates to a person who can approve it. A refusal is final and does not reopen. When a refusal waits only on a missing approval, Parmana can send one `approval.needed` notice to a configured webhook (`APPROVAL_WEBHOOK_URL`) or email (`APPROVAL_EMAIL_TO`), as claim 2.46 describes. With neither configured, nothing is sent. Delivery is best effort and is not retried, and the request stays refused. People can review refusals in the Refusal Records (3.11), and a manager can sign an approval that lets a new request for a large refund run (2.42), and one approver key, `manager-charak1987`, is trusted in `TRUSTED_APPROVAL_ISSUERS` (`packages/api/src/bootstrap/createApprovalIssuerRegistry.ts`).

- The unscoped claim that rule violations cannot happen is not supported. The supported version: an action routed through Parmana does not execute unless the policy bound to it (2.22), approved through governance (2.35), approves it. An agent that holds its own credentials to a system is outside that, and a signal nothing verifies is only as true as the caller says (G-51).

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
- Status: fixed on local branch `fix/policy-scan-and-governance-url` (commit `a8ac2961`). Not yet pushed or merged. See G-96 and G-97 in `docs/internal/VERIFICATION-GAPS.md`.

## 3.25 Vercel Entry Applies the Startup Refusals; POST /transactions Binds metadata.tenantId (Scoped, 2026-10-15)

**Claim.** Two checks that already held on the other entry points now hold on every entry point:

1. The Vercel serverless entry (`api/index.ts`) refuses to serve when the Policy Governance integrity check finds a mismatch or cannot run, as `packages/api/src/server.ts` does. Previously it ran the periodic check fail-open.
2. `POST /transactions` refuses a `metadata.tenantId` that the caller's key does not list, with `TENANT_NOT_ALLOWED`, as `POST /execute` already did. The tenant id selects the signing key (`tenant.<id>`), so an unchecked id let a caller have an authorization signed under another tenant's key.

**Evidence.**

- api/index.ts: `buildApp()` awaits `assertPolicyGovernanceIntegrityAtStartup()` before building the app.
- packages/api/src/routes/transactions.ts: tenant check placed with the principal and capability checks, before `application.execute()`.
- packages/api/tests/integration/caller-capability-scoping.integration.test.ts: "POST /transactions" refuses a tenantId the key does not list.
- `packages/api` test suite: 698 passed, 36 skipped.

**Limits.**

- In a serverless function a process exit is not available. A mismatch makes every request fail with a 500 rather than refusing the process. The failed build is retried on the next request, so each request re-runs the check until the mismatch is fixed.
- The entry imported `runPolicyGovernanceIntegrityCheckAtStartup` from `packages/api/dist`, a module with no source in `packages/api/src`. The import now points at the module the source builds.
- Status: fixed on branch `fix/policy-scan-and-governance-url`. See G-98 and G-99 in `docs/internal/VERIFICATION-GAPS.md`.

## 3.27 The Server Distrusts eMudhra's emSign Roots at Startup (Scoped, 2026-10-23)

**Claim.** Every server process removes eMudhra's four emSign root certificates (Root CA G1, ECC Root CA G3, Root CA C1, ECC Root CA C3), matched by SHA-256 fingerprint, from its default CA list before any outbound TLS connection. A certificate issued from the compromised eMudhra intermediate keys (G-124) is therefore refused by `fetch`, `https`, the Postgres driver and the AWS SDK, whatever Node version runs the server. A Node version that cannot set the default CA list stops the server from starting.

**Evidence.**

- `packages/api/src/bootstrap/distrustCompromisedRoots.ts`, called first in `api/index.ts` (Vercel) and `packages/api/src/server.ts` (Docker and self hosted).
- `packages/api/tests/unit/distrustCompromisedRoots.test.ts`: only emSign roots are named, exactly those are removed and every other root kept, and the result is idempotent. Forcing the filter to keep everything fails two of its three tests.
- Checked on Node 24.21.0 against a local HTTPS server signed by a throwaway root: with the root in the default list, `fetch` and `https` both connected; with it removed, both refused with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, each in a fresh process.
- Production, 2026-10-23: `{"event":"runtime","node":"v24.21.0","openssl":"3.5.7","distrustedRootsRemoved":4}`, followed by normal startup.
- The published image `server-v1.0.1` (3.18) includes it.

**Limits.**

- It removes trust in four roots, not in the eight intermediates alone: a legitimate server whose certificate chains to an emSign root cannot be reached. None of the systems the server calls uses one.
- It covers the server's own outbound connections. The SDKs and connector endpoints run in their users' processes and rely on those runtimes; Python SDK users should update certifi to 2026.10.19 or later.
- It does not check certificate revocation in general; it answers this one compromise.

## 3.28 Three Evaluation Questions Checked Against the Source (Scoped, 2026-10-26)

**Claim.** When a policy rejects a transaction, no connector is called. The envelope verifier does not accept a record whose authorization is missing, expired, or reused. Signal types are checked against the policy's declared schema before any rule runs.

**Evidence.**

- Envelope verifier: `packages/envelope-verifier/tests/unit/envelope-verifier.test.ts` and `envelope-verifier.dilithium3.test.ts`. They check `notExpired` and `nonceUnseen`, and "rejects a second use of the same nonce". Run on 2026-10-26: 22 pass, 5 skipped.
- Signal types: `packages/policy/src/PolicyEngine.ts`, `evaluate`, calls `findSignalTypeViolations` (line 42) before the rule loop (line 93). The check is in `packages/policy/src/signalTypes.ts`, with `packages/policy/tests/unit/signalTypes.test.ts`. Run on 2026-10-26: 21 pass.

**Limits.**

- The envelope verifier checks the record it is given. Refusing a release is the execution gateway's job, and this section does not claim the gateway's behavior.
- The five skipped envelope tests need ML-DSA-65, which needs Node 24. The run used Node 22.22.0, so the post-quantum path is not checked by this run.
- The signal-type check covers only signals the schema declares. A signal absent from the payload is not a type violation, and the rules decide it. This is the design, not a gap in the check.
- The 2026-10-26 runs needed local builds of the workspace packages and a rebuilt `re2` native module. Nothing was committed for them.

## 3.29 Kill Switch, Approval Binding and Audit Tamper Checked Against the Source (Scoped, 2026-10-26)

**Claim.** An active kill switch refuses execution with `KILL_SWITCH_ACTIVE`, and the connector is not called when the switch trips between the HTTP guard and release. An approval for one action does not authorize another. A tampered audit event or execution intent is reported invalid.

**Evidence.**

- Kill switch refusal: `packages/api/tests/integration/kill-switch.integration.test.ts` and `kill-switch-release-window.integration.test.ts`. The refusal is a 503 with `KILL_SWITCH_ACTIVE`. On branch `test/kill-switch-no-connector` (commit `8a857f2`, not yet merged), the release-window test also asserts that the executor is never called on refusal, and is called once in the control case. That assertion is not yet on `main`.
- Approval binding: `approval-issuers-governance.integration.test.ts`, `business-signal-sources-governance.integration.test.ts` and `external-connectors-governance.integration.test.ts` refuse an approval with no step-up, or a step-up for the other action.
- Audit tamper: `audit-verify.integration.test.ts` reports a tampered event as invalid. `execution-intents.integration.test.ts` returns `{ valid: false }` for a tampered intent.

Run on 2026-10-26, Node 22.22.0: the eight files above pass, 88 of 88.

**Limits.**

- The kill-switch no-connector assertion is on a branch and is not part of `main` until that branch merges.
- The approval tests cover the governance-approval flows. They do not show the same binding for every connector.
- The audit-tamper tests cover the caller audit event and the execution intent. They do not cover every record the system writes.

## 3.30 Inbound Check Approves Only When the Bound Policy and the Grant Both Allow (Scoped, 2026-11-05)

**Claim.** `POST /v1/inbound/checks` approves a request only when both hold: the policy bound to the requested capability approves it, and the partner holds a current grant whose limits hold for the request. The policy is run by the runtime's `decide()` step, with the same verification and binding checks as `/execute`, without executing anything. A capability with no bound policy is refused (403 `no_policy_bound`), as is one whose policy cannot be determined (403 `policy_unavailable`). Every decision, approved or rejected, is signed and stored with the policy name and version that decided it.

**Evidence.**

- `packages/api/src/routes/inbound-checks.ts`: the flow above.
- `packages/api/tests/unit/routes/inbound-checks.test.ts`: 16 tests, covering approval, policy rejection, a limit above the grant (rejected with `approval_required` even when the policy approves), the request the policy receives (partner as submitter, declared signals, no authority or authorization), no bound policy, an unavailable policy, a grant with an incomplete limit, and the grant cases.
- `packages/runtime/src/RuntimeEngine.ts`: `decide()` takes a `DecisionRequest`, which leaves out `authority` and `authorization`. Deciding does not read them.
- Run on 2026-11-05: the 16 check tests and the 8 refund tests pass, and the runtime suite (217 tests, 33 files) passes.

**Limits.**

- The approver is not recorded (`approved_by` and `approved_at` are not written; G-143).
- Declared facts are verified as `/execute` verifies them. Facts confirmed by the business's own records are not yet used (G-144, RFC-0026).
- No business system calls the check, and no probe checks that a direct call is refused (G-146, G-129).
- This change is on a branch stacked on the open pull request #448, and is not on `main` until #448 merges.

## 3.31 The Inbound Decision Record Holds Any Action, and the Extension Is Applied (Scoped, 2026-11-05)

**Claim.** The `inbound_decisions` table holds a decision for any capability. `payment_id` and `limit_inr` are no longer required, and nullable columns record the proposed action (`capability`, `target`, `amount`), the policy (`policy_name`, `policy_version`), the approver (`approved_by`, `approved_at`), and whether the check was in place (`check_status`, `verified` or `not_verified`). Existing refund rows are unchanged. The migration was applied to the production database on 2026-11-05.

**Evidence.**

- `supabase/migrations/20261105140000_extend_inbound_decisions.sql`: additive; no column is dropped and no row is changed. The rollback is written in the file, with its conditions.
- `scripts/apply-all-migrations.sql` regenerated, so the migration-bundle test passes.
- The migration tool's status and apply output, run against production on 2026-11-05: the migration was pending, then applied, and the apply dry run listed it.

**Limits.**

- The check repository writes `capability`, `target`, `amount` and `check_status` (always `verified`). No code writes `policy_name`, `policy_version`, `approved_by` or `approved_at` yet (G-143).
- The rollback is valid only while no row uses the new columns and every old row still has a value in the two relaxed columns. It is not automated.
- The check repository has no test. Its SQL has not been run against a database by any test, so its writes are not verified by a test in this change. The migration itself was applied to production, and the application's routes are tested with an in-memory store.

## 3.32 The Runtime Decides Without Executing, With Unchanged Behaviour (Scoped, 2026-11-05)

**Claim.** `RuntimeEngine.decide()` runs every decision step of `execute()` (policy load, governance and binding checks, authority, business validation, policy evaluation, the refusal record and the enforcement gate) and returns the decision without authorizing it or sending anything to a connector. `execute()` calls `decide()` and then does what it did before. The split moved code without changing its order.

**Evidence.**

- `packages/runtime/src/RuntimeEngine.ts`: `decide()` and `execute()`.
- Run on 2026-11-05: the runtime package's 217 tests in 33 files pass, including the tests that cover `execute()` end to end.

**Limits.**

- No test calls `decide()` directly yet. Its behaviour is covered only through `execute()`.
- The inbound check does not call `decide()` yet, so the policy is still not evaluated for inbound requests (G-142).

## 3.33 A Failed Kill Switch Probe Opens a P1 Issue (Scoped, 2026-11-05)

**Claim.** When the scheduled kill switch probe fails, the workflow opens one P1 issue that links to the failed run. It does not open another while an open issue with the same title exists.

**Evidence.**

- `.github/workflows/kill-switch-probe.yml`: the final step runs only on failure, searches open issues for the title, and creates the issue with the `P1` label. The workflow has `issues: write`.
- The workflow file parses as YAML. The startup check is covered by six unit tests and the kill switch startup tests (`packages/api/tests/unit/createKillSwitch.test.ts`).

**Limits.**

- The alert has not yet been seen firing on a real failure. It is verified by reading the workflow, not by a failed run.
- The duplicate check is a text search. It can match another open issue with similar words, and then the new failure is not reported.
- The probe key is still not rotated on a schedule (G-145). The server refuses to start with the kill switch on and no `kill-switch-probe` entry holding exactly `kill-switch:probe` (`packages/api/src/bootstrap/assertProbeKeyEntry.ts`). The server cannot read the repository secret, so the probe workflow checks its key with Parmana before each run and reports a rejected key as a key mismatch (PR #450).
