# 2.17 Fail-Closed Startup Configuration Validation

Source: CLAIMS.md (commit d1d63c6), lines 395-414.

## Exact claim text

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

## Cited evidence paths

No backticked repo path in this claim.

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
