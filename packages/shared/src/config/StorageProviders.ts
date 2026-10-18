export const StorageProviders = {
  MEMORY: "memory",
  POSTGRES: "postgres",
  SUPABASE: "supabase",
} as const;

export type StorageProvider =
  (typeof StorageProviders)[keyof typeof StorageProviders];

/**
 * Whether a provider name selects the durable Postgres storage.
 *
 * `postgres` and `supabase` select the same implementation: every
 * repository, audit sink and nonce store behind them writes through
 * PostgresPoolFactory (DATABASE_URL), so it runs on any Postgres,
 * Supabase hosted or self hosted. `supabase` is kept so existing
 * deployments are unchanged; `postgres` is the name for a self hosted
 * database (G-57).
 */
export function isPostgresStorage(provider: string | undefined): boolean {
  return (
    provider === StorageProviders.POSTGRES ||
    provider === StorageProviders.SUPABASE
  );
}
