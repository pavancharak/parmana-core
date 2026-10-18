import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import {
  DuplicateBusinessTransactionError,
  type BusinessTransactionRepository,
} from "@parmana/shared";

import { MemoryBusinessTransactionRepository } from "../../src/memory/MemoryBusinessTransactionRepository.js";
import { SupabaseBusinessTransactionRepository } from "../../src/supabase/SupabaseBusinessTransactionRepository.js";

import { buildBusinessTransaction } from "../fixtures/multi-item-trust-record.js";

function createFakePool(): Pool {
  const rows = new Set<string>();

  const pool = {
    query(sql: string, values?: readonly unknown[]) {
      if (sql.includes("INSERT INTO business_transactions")) {
        const [id] = values as [string];

        if (rows.has(id)) {
          return Promise.reject({
            code: "23505",
            message: "duplicate key value",
          });
        }

        rows.add(id);
        return Promise.resolve({ rows: [] });
      }

      throw new Error(`test fake: unexpected SQL: ${sql}`);
    },
  };

  return pool as unknown as Pool;
}

/**
 * G-1's "consistent semantics across implementations" requirement:
 * callers must not be able to tell which backing store rejected a
 * duplicate from the shape of the error alone.
 */
describe.each<[string, () => BusinessTransactionRepository]>([
  [
    "MemoryBusinessTransactionRepository",
    () => new MemoryBusinessTransactionRepository(),
  ],
  [
    "SupabaseBusinessTransactionRepository",
    () => new SupabaseBusinessTransactionRepository(createFakePool()),
  ],
])("%s", (_name, createRepository) => {
  it("throws DuplicateBusinessTransactionError, with the same message format, for a duplicate businessTransactionId", async () => {
    const repository = createRepository();
    const transaction = buildBusinessTransaction("txn-consistency");

    await repository.create(transaction);

    let caught: unknown;
    try {
      await repository.create(transaction);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DuplicateBusinessTransactionError);
    expect((caught as Error).message).toBe(
      "Business Transaction 'txn-consistency' already exists.",
    );
  });
});
