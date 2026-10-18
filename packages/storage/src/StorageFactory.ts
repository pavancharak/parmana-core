import { parseStorageProvider } from "@parmana/shared";

import { MemoryStorageProvider } from "./memory/MemoryStorageProvider.js";

import { SupabaseStorageProvider } from "./supabase/SupabaseStorageProvider.js";

import type { StorageProvider } from "./StorageProvider.js";

import type { StorageConfiguration } from "./StorageConfiguration.js";

/**
 * Whether a direct Postgres connection string is configured.
 * SupabaseStorageProvider's three repositories now write via
 * PostgresPoolFactory (DATABASE_URL), not a supabase-js/PostgREST
 * client (SUPABASE_URL) — see SupabaseExecutionTrustRecordRepository
 * for why (removing PostgREST from every Supabase-backed table's
 * failure modes, not just the audit sinks that broke first).
 */
function hasDatabaseUrlConfig(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Creates Storage Providers.
 */
export class StorageFactory {
  /**
   * Creates a provider from configuration.
   */
  static create(configuration: StorageConfiguration): StorageProvider {
    switch (configuration.provider) {
      case "memory":
        return new MemoryStorageProvider();

      case "supabase":
      case "postgres":
        // G-15: name both knobs (PARMANA_STORAGE and the missing
        // DATABASE_URL) before PostgresPoolFactory.create() would
        // otherwise fail with its generic "DATABASE_URL environment
        // variable is missing." — or, worse, construct a pool that
        // only fails on first use.
        //
        // G-57: `postgres` selects the same implementation as
        // `supabase`. Despite its name, SupabaseStorageProvider only
        // needs a Postgres connection string, so a self hosted
        // Postgres works under either name.
        if (!hasDatabaseUrlConfig()) {
          throw new Error(
            `PARMANA_STORAGE=${configuration.provider} requires ` +
              "DATABASE_URL (a direct Postgres connection string, for " +
              "example postgresql://user:password@host:5432/parmana, or " +
              "Settings → Database → Connection string in the Supabase " +
              "dashboard) to be configured. Refusing to construct a " +
              "Postgres storage provider with no credentials.",
          );
        }

        return new SupabaseStorageProvider();

      case "sqlite":
        throw new Error("SQLite storage provider not implemented.");
    }
  }

  /**
   * Creates a provider from environment.
   *
   * Test wiring (NODE_ENV=test): MemoryStorageProvider, unconditionally,
   * regardless of PARMANA_STORAGE — mirrors the production/test split
   * createNonceStore.ts and createCallerAuditSink.ts already established
   * (G-13). Closes G-15 (docs/VERIFICATION-GAPS.md): this method used to
   * construct whatever PARMANA_STORAGE named — a live Supabase client
   * included — purely as an import-time side effect
   * (packages/api/src/repositories.ts), crashing test collection with
   * supabase-js's generic "supabaseUrl is required." the moment
   * SUPABASE_* was unset, regardless of test intent.
   */
  static createFromEnvironment(): StorageProvider {
    if (process.env.NODE_ENV === "test") {
      return new MemoryStorageProvider();
    }

    return this.create({
      provider: parseStorageProvider(process.env.PARMANA_STORAGE),
    });
  }
}
