import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import type { ExecutionResult } from "@parmana/shared";

import { SupabaseExecutionOutcomeStore } from "../../src/supabase/SupabaseExecutionOutcomeStore.js";

/**
 * Fake pg.Pool simulating the execution_outcomes table: PRIMARY KEY on
 * `nonce`, `begin` as INSERT ... ON CONFLICT DO NOTHING, and `complete` only
 * updating a row still `in_flight`. This proves SupabaseExecutionOutcomeStore
 * reads the query results correctly. Real concurrent behavior against
 * PostgreSQL is covered by the gated integration suite.
 */
function createFakePool() {
  const rows = new Map<string, { status: string; result: unknown }>();

  const pool = {
    query(sql: string, values: readonly unknown[]) {
      const [nonce] = values as [string];

      if (sql.includes("INSERT INTO execution_outcomes")) {
        if (rows.has(nonce)) {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }

        rows.set(nonce, { status: "in_flight", result: undefined });

        return Promise.resolve({ rowCount: 1, rows: [] });
      }

      if (sql.includes("UPDATE execution_outcomes")) {
        const row = rows.get(nonce);

        if (row?.status !== "in_flight") {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }

        // pg hands jsonb back as a parsed value. The store passes JSON text.
        rows.set(nonce, {
          status: "completed",
          result: JSON.parse(values[1] as string),
        });

        return Promise.resolve({ rowCount: 1, rows: [] });
      }

      if (sql.includes("SELECT status, result")) {
        const row = rows.get(nonce);

        return Promise.resolve({
          rowCount: row ? 1 : 0,
          rows: row ? [row] : [],
        });
      }

      return Promise.reject(new Error(`unexpected SQL: ${sql}`));
    },
  } as unknown as Pool;

  return pool;
}

const RESULT: ExecutionResult = {
  businessTransactionId: "btx-1",
  action: "vendor.payment",
  target: "acme",
  parameters: { amount: 10 },
  success: true,
  executedAt: new Date("2026-10-27T10:00:00.000Z"),
  metadata: { providerRef: "ref-1" },
};

describe("SupabaseExecutionOutcomeStore", () => {
  it("creates an in-flight row for the first attempt and reports a repeat as already begun", async () => {
    const store = new SupabaseExecutionOutcomeStore(createFakePool());

    expect(await store.begin("n-1", "2026-10-27T11:00:00.000Z")).toBe(true);
    expect(await store.begin("n-1", "2026-10-27T11:00:00.000Z")).toBe(false);
    expect(await store.get("n-1")).toEqual({ status: "in_flight" });
  });

  it("records a completed result and returns it with executedAt restored as a Date", async () => {
    const store = new SupabaseExecutionOutcomeStore(createFakePool());

    await store.begin("n-2", "2026-10-27T11:00:00.000Z");
    await store.complete("n-2", RESULT);

    const outcome = await store.get("n-2");

    expect(outcome).toEqual({
      status: "completed",
      result: { ...RESULT, executedAt: RESULT.executedAt },
    });
    expect(
      outcome?.status === "completed" &&
        outcome.result.executedAt instanceof Date,
    ).toBe(true);
  });

  it("refuses to complete a nonce that has no in-flight row, so a missing record is never silent", async () => {
    const store = new SupabaseExecutionOutcomeStore(createFakePool());

    await expect(store.complete("n-missing", RESULT)).rejects.toThrow(
      "No in-flight execution outcome recorded",
    );
  });

  it("returns undefined for a nonce with no recorded outcome", async () => {
    const store = new SupabaseExecutionOutcomeStore(createFakePool());

    expect(await store.get("n-unknown")).toBeUndefined();
  });

  it("rethrows errors other than a unique violation instead of treating them as a repeat", async () => {
    const pool = {
      query: () => Promise.reject(new Error("connection refused")),
    } as unknown as Pool;

    await expect(
      new SupabaseExecutionOutcomeStore(pool).begin(
        "n-3",
        "2026-10-27T11:00:00.000Z",
      ),
    ).rejects.toThrow("connection refused");
  });
});
