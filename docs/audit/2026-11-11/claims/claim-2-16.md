# 2.16 Caller Authentication at the API Boundary

Source: CLAIMS.md (commit d1d63c6), lines 347-394.

## Exact claim text

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
- `packages/api/tests/integration/postgres-caller-audit-sink.integration.test.ts` (a recorded event is read back through a second client)
- `packages/api/tests/unit/bootstrap/create-caller-authenticator.test.ts`
- `packages/api/tests/unit/routes/ready.test.ts` (`authDisabled` true with a warning, and false without one)

Dated updates, including the change to the example configuration and the earlier revocation gap, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## Cited evidence paths

- `packages/api/src/app.ts`: EXISTS
- `packages/api/src/auth/InMemoryCallerAuditSink.ts`: EXISTS
- `packages/api/src/auth/StaticKeyAuthenticator.ts`: EXISTS
- `packages/api/src/bootstrap/createCallerAuditSink.ts`: EXISTS
- `packages/api/src/bootstrap/createCallerAuthenticator.ts`: EXISTS
- `packages/api/src/routes/ready.ts`: EXISTS
- `packages/api/tests/integration/caller-auth.integration.test.ts`: EXISTS
- `packages/api/tests/integration/postgres-caller-audit-sink.integration.test.ts`: EXISTS
- `packages/api/tests/unit/bootstrap/create-caller-authenticator.test.ts`: EXISTS
- `packages/api/tests/unit/routes/ready.test.ts`: EXISTS
- `packages/shared/src/repositories/caller-key-revocation-repository.ts`: EXISTS
- `supabase/migrations/20261030120000_add_caller_key_revocations.sql`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                                       | Status | Tests | Passed | Skipped |
| ------------------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/integration/caller-auth.integration.test.ts`                | passed | 27    | 27     | 0       |
| `packages/api/tests/integration/postgres-caller-audit-sink.integration.test.ts` | passed | 5     | 0      | 5       |
| `packages/api/tests/unit/bootstrap/create-caller-authenticator.test.ts`         | passed | 4     | 4      | 0       |
| `packages/api/tests/unit/routes/ready.test.ts`                                  | passed | 10    | 10     | 0       |
