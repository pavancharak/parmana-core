import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import { DuplicateBusinessTransactionError } from "@parmana/shared";

import { SupabaseBusinessTransactionRepository } from "../../src/supabase/SupabaseBusinessTransactionRepository.js";

import { buildBusinessTransaction } from "../fixtures/multi-item-trust-record.js";

function createFakePool(options?: {
  readonly insertError?: { code?: string; message: string };
}): Pool {
  const rows = new Map<string, Record<string, unknown>>();

  const pool = {
    query(sql: string, values?: readonly unknown[]) {
      if (sql.includes("INSERT INTO business_transactions")) {
        if (options?.insertError) {
          return Promise.reject(options.insertError);
        }

        const [id] = values as [string];

        if (rows.has(id)) {
          return Promise.reject({
            code: "23505",
            message:
              'duplicate key value violates unique constraint "business_transactions_pkey"',
          });
        }

        rows.set(id, { business_transaction_id: id });
        return Promise.resolve({ rows: [] });
      }

      throw new Error(`test fake: unexpected SQL: ${sql}`);
    },
  };

  return pool as unknown as Pool;
}

describe("SupabaseBusinessTransactionRepository (G-1)", () => {
  it("creates a transaction that does not yet exist", async () => {
    const repository = new SupabaseBusinessTransactionRepository(
      createFakePool(),
    );

    await expect(
      repository.create(buildBusinessTransaction("txn-1")),
    ).resolves.toBeDefined();
  });

  it("maps a 23505 unique-violation to DuplicateBusinessTransactionError, not the raw Postgres error", async () => {
    const repository = new SupabaseBusinessTransactionRepository(
      createFakePool(),
    );

    await repository.create(buildBusinessTransaction("txn-1"));

    await expect(
      repository.create(buildBusinessTransaction("txn-1")),
    ).rejects.toBeInstanceOf(DuplicateBusinessTransactionError);
  });

  it("still fails closed on a non-unique-violation storage error: propagates the raw error rather than swallowing it or misreporting it as a duplicate", async () => {
    const repository = new SupabaseBusinessTransactionRepository(
      createFakePool({
        insertError: { code: "08006", message: "connection failure" },
      }),
    );

    await expect(
      repository.create(buildBusinessTransaction("txn-1")),
    ).rejects.toMatchObject({ code: "08006" });
  });
});
