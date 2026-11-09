import { describe } from "vitest";

import { PostgresStorageProvider } from "../../src/postgres/PostgresStorageProvider.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

import { runStorageProviderContract } from "./storage-provider.contract.js";

/**
 * Runs the contract against the PostgreSQL provider. PostgresStorageProvider
 * is the PostgreSQL adapter today: it writes through PostgresPoolFactory
 * (DATABASE_URL) and does not call PostgREST. The name is historical and is
 * renamed in migration step 2.
 *
 * Gated like every other live suite: TEST_DATABASE_URL plus
 * ALLOW_LIVE_SUPABASE=1. Run it against a database built from the repository
 * migrations (scripts/apply-all-migrations.sql), not a hosted project.
 */
const databaseConfigured = resolveDatabaseGate(
  "StorageProvider contract (PostgreSQL)",
);

describe.skipIf(!databaseConfigured)("postgres storage provider", () => {
  runStorageProviderContract(
    "PostgresStorageProvider (PostgreSQL)",
    () => new PostgresStorageProvider(),
  );
});
