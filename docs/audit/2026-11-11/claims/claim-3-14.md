# 3.14 Per-Caller Rate Limiting on `/execute` (Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1676-1704.

## Exact claim text

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


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `packages/api/src/app.ts`: EXISTS
- `packages/api/src/bootstrap/createRateLimitStore.ts`: EXISTS
- `packages/api/src/middleware/rate-limit.ts`: EXISTS
- `packages/api/tests/integration/rate-limit.integration.test.ts`: EXISTS
- `packages/api/tests/unit/bootstrap/create-rate-limit-store.test.ts`: EXISTS
- `packages/crypto/tests/unit/kms-signer.test.ts`: EXISTS
- `packages/shared/src/config/Config.ts`: EXISTS
- `packages/storage/src/postgres/PostgresRateLimitStore.ts`: EXISTS
- `packages/storage/tests/unit/postgres-rate-limit-store.test.ts`: EXISTS
- `supabase/migrations/20260910120000_add_rate_limit_counters.sql`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/rate-limit.integration.test.ts` | passed | 15 | 15 | 0 |
| `packages/api/tests/unit/bootstrap/create-rate-limit-store.test.ts` | passed | 4 | 4 | 0 |
| `packages/crypto/tests/unit/kms-signer.test.ts` | passed | 31 | 31 | 0 |
| `packages/storage/tests/unit/postgres-rate-limit-store.test.ts` | passed | 3 | 3 | 0 |
