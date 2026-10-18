import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { DuplicateBusinessTransactionError } from "@parmana/shared";

import { PostgresPoolFactory } from "../../src/postgres/PostgresPoolFactory.js";
import { SupabaseBusinessTransactionRepository } from "../../src/supabase/SupabaseBusinessTransactionRepository.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

import { buildBusinessTransaction } from "../fixtures/multi-item-trust-record.js";

const databaseConfigured = resolveDatabaseGate(
  "Supabase Business Transaction Duplicate",
);

/**
 * Closes G-1 (docs/VERIFICATION-GAPS.md): proves the unique-constraint
 * path against a real database, not just the mocked-storage unit
 * tests (packages/storage/tests/unit/
 * supabase-business-transaction-repository.test.ts). The
 * business_transactions table's PRIMARY KEY on
 * business_transaction_id (supabase/migrations/
 * 20260629013035_initial_schema.sql) already provided the atomicity;
 * this suite proves the 23505 it produces is now mapped to
 * DuplicateBusinessTransactionError rather than a raw Postgres error.
 *
 * Writes via PostgresPoolFactory (DATABASE_URL) now, not a
 * supabase-js/PostgREST client — see SupabaseBusinessTransactionRepository
 * for why.
 */
describe.skipIf(!databaseConfigured)(
  "SupabaseBusinessTransactionRepository duplicate handling (live)",
  () => {
    it("rejects a sequential duplicate with DuplicateBusinessTransactionError", async () => {
      const pool = PostgresPoolFactory.create();
      const repository = new SupabaseBusinessTransactionRepository(pool);

      const id = `test-txn-${crypto.randomUUID()}`;
      const transaction = buildBusinessTransaction(id);

      await repository.create(transaction);

      await expect(repository.create(transaction)).rejects.toBeInstanceOf(
        DuplicateBusinessTransactionError,
      );
    });

    it("(concurrency, live database) two simultaneous create() calls for the same id: exactly one succeeds, the other rejects with DuplicateBusinessTransactionError", async () => {
      const pool = PostgresPoolFactory.create();
      const repository = new SupabaseBusinessTransactionRepository(pool);

      const id = `test-txn-race-${crypto.randomUUID()}`;
      const first = buildBusinessTransaction(id);
      const second = {
        ...buildBusinessTransaction(id),
        signals: { amount: 999 },
      };

      const results = await Promise.allSettled([
        repository.create(first),
        repository.create(second),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(
        DuplicateBusinessTransactionError,
      );
    });
  },
);
