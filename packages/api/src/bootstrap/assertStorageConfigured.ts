import { isPostgresStorage, loadConfig } from "@parmana/shared";

import { assertDatabaseUrlConfigured } from "./assertDatabaseUrlConfigured.js";

/**
 * Eagerly validates durable storage configuration at boot, before the
 * port is bound.
 *
 * Without this, `PARMANA_STORAGE=supabase` (or `postgres`) with missing storage
 * credentials boots "successfully" and only fails on the first request
 * that touches a repository — `repositories.ts`'s lazy `Proxy` defers
 * `StorageFactory.createFromEnvironment()` until first use, deliberately
 * (see that file's own comment: avoiding an import-time client
 * construction that would break test collection on a machine with no
 * credentials, G-15). That laziness is correct for test collection; a
 * production process should not present as healthy while its storage
 * is unreachable by construction. This reuses the exact same
 * `assertDatabaseUrlConfigured` precondition every other durable-store
 * bootstrap factory already relies on (`createNonceStore.ts`,
 * `createCallerAuditSink.ts`), just run once, up front, for the
 * trust-record/business-transaction storage those factories don't
 * cover.
 *
 * Wired to DATABASE_URL, not SUPABASE_URL — PostgresStorageProvider's
 * three repositories now write via a direct Postgres connection
 * (PostgresPoolFactory), removing PostgREST from this storage path's
 * failure modes entirely.
 */
export function assertStorageConfigured(): void {
  if (process.env.NODE_ENV === "test") return;

  const config = loadConfig();

  // Memory storage loses every transaction, record and approval when the
  // process stops. The default is memory, so a production process that did
  // not set PARMANA_STORAGE would run without durability. Refuse it here,
  // before the port is bound (the doctor reported this; the server did not).
  if (
    process.env.NODE_ENV === "production" &&
    config.storage.provider === "memory"
  ) {
    throw new Error(
      "PARMANA_STORAGE is memory (the default when unset). Memory storage is not durable, " +
        "so NODE_ENV=production refuses to start with it. Set PARMANA_STORAGE=postgres " +
        "(or supabase) and DATABASE_URL.",
    );
  }

  if (isPostgresStorage(config.storage.provider)) {
    assertDatabaseUrlConfigured(
      "Storage (business transactions / trust records)",
    );
  }
}
