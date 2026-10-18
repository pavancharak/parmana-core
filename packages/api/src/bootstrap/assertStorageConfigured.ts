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
 * Wired to DATABASE_URL, not SUPABASE_URL — SupabaseStorageProvider's
 * three repositories now write via a direct Postgres connection
 * (PostgresPoolFactory), removing PostgREST from this storage path's
 * failure modes entirely.
 */
export function assertStorageConfigured(): void {
  if (process.env.NODE_ENV === "test") return;

  const config = loadConfig();

  if (isPostgresStorage(config.storage.provider)) {
    assertDatabaseUrlConfigured(
      "Storage (business transactions / trust records)",
    );
  }
}
