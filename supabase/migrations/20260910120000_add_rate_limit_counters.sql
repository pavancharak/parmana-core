-- =============================================================================
-- Fleet-wide POST /execute and /health,/ready rate limiting.
-- =============================================================================
--
-- Backs PostgresRateLimitStore (packages/storage/src/postgres/
-- PostgresRateLimitStore.ts), the durable counterpart to
-- express-rate-limit's default in-process MemoryStore. Closes the
-- fleet-wide half of the rate-limiter gap identified in the 2026-09-10
-- production-readiness pass: a MemoryStore-backed limiter is correct
-- for a single process, but each machine in a horizontally-scaled
-- deployment counts independently, so a caller's effective ceiling
-- becomes `limitPerMinute * machineCount` rather than the configured
-- fleet-wide limit.
--
-- One row per rate-limit key (an authenticated caller id for
-- /execute, a client IP for /health and /ready -- see
-- packages/api/src/middleware/rate-limit.ts). `count` and
-- `reset_time` are read and written together, atomically, by
-- PostgresRateLimitStore's single upsert statement -- no separate
-- locking is required here.
--
-- Not RLS-covered: unlike the other tables in this schema, rows here
-- carry no business or trust-record data, only ephemeral counters
-- that this codebase's own application logic is the sole reader/
-- writer of (no end-user or dashboard access path exists), so a
-- restrictive policy set would add operational surface without a
-- corresponding threat this table is exposed to.
create table if not exists rate_limit_counters (
  key text primary key,
  count integer not null,
  reset_time timestamptz not null
);

-- Lets a periodic housekeeping job (none exists yet; this index is
-- what such a job would use) cheaply find and delete rows whose window
-- has long since elapsed, without a full table scan. The table
-- self-corrects even without one: increment()'s own upsert resets an
-- expired row's count back to 1 the next time that key is hit, so this
-- index is a cleanup convenience, not a correctness requirement.
create index if not exists rate_limit_counters_reset_time_idx
  on rate_limit_counters (reset_time);
