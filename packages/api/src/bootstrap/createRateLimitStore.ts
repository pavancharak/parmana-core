import type { Store } from "express-rate-limit";
import { PostgresPoolFactory, PostgresRateLimitStore } from "@parmana/storage";

/**
 * Creates one Store backing either POST /execute's or GET /health,/ready's
 * rate limiting -- NOT shared between them (found 2026-09-15: it used
 * to be a single Store passed to both limiters, but express-rate-limit
 * v8 throws `ERR_ERL_STORE_REUSE` the moment a second limiter's init()
 * runs against an already-initialized Store). Call this once per
 * limiter, each with its own `prefix` (e.g. "execute:" and "health:") so
 * their counters can't collide in the shared rate_limit_counters table
 * -- PostgresPoolFactory.create() underneath is a process-wide
 * singleton, so calling this twice does not open a second database
 * connection pool.
 *
 * Test wiring (NODE_ENV=test): undefined -- express-rate-limit falls
 * back to its own in-process MemoryStore, exactly as before this store
 * existed, so no test needs a live database.
 *
 * Production with DATABASE_URL configured: PostgresRateLimitStore, a
 * durable counter shared across every process pointed at the same
 * database -- the effective rate limit becomes fleet-wide rather than
 * `limitPerMinute * machineCount`.
 *
 * Production without DATABASE_URL: undefined (in-process MemoryStore),
 * with a loud startup warning. Deliberately NOT fail-closed the way
 * createNonceStore.ts's assertDatabaseUrlConfigured is: an in-process
 * rate limiter is a real, working control on a single instance (today's
 * actual deployment shape -- fly.toml pins `min_machines_running = 1`),
 * just not fleet-wide accurate the moment a second machine joins. A
 * missing nonce store means replay protection silently vanishes
 * (a security bypass); a missing shared rate-limit store means the
 * fleet-wide ceiling is `limitPerMinute * machineCount` instead of
 * `limitPerMinute` (a capacity control that is looser than configured,
 * not absent) -- refusing to start over that would break every
 * single-instance and local deployment that works correctly today.
 */
export function createRateLimitStore(prefix: string): Store | undefined {
  if (process.env.NODE_ENV === "test") {
    return undefined;
  }

  if (!process.env.DATABASE_URL) {
    console.warn({
      event: "rate_limit_store_not_durable",
      reason:
        "DATABASE_URL is not configured -- POST /execute, GET /health,/ready and public route rate " +
        "limits are enforced per-process only. Fine for a single instance " +
        "(this deployment's current shape), but the effective fleet-wide ceiling " +
        "becomes limitPerMinute * machineCount the moment a second machine is added. " +
        "Set DATABASE_URL to share rate-limit counters across instances.",
    });

    return undefined;
  }

  return new PostgresRateLimitStore(PostgresPoolFactory.create(), prefix);
}
