import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";

// These suites run a real PGlite or a repository scan that is slow when the
// full suite runs in parallel, so the default 30 s limit is too tight (#177).
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

import type { Pool } from "pg";

import type { ExecutionResult } from "@parmana/shared";

import { SupabaseExecutionOutcomeStore } from "../../src/supabase/SupabaseExecutionOutcomeStore.js";

/**
 * Runs SupabaseExecutionOutcomeStore against PostgreSQL semantics (PGlite,
 * PostgreSQL compiled to WASM), with the shipped migration applied as written.
 * The fake-pool test proves result interpretation. This one proves the SQL:
 * ON CONFLICT DO NOTHING, the status guard on UPDATE, the jsonb round trip,
 * and the primary key deciding the winner under concurrent calls.
 */
const MIGRATION = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../supabase/migrations/20261027120000_add_execution_outcomes.sql",
);

async function createDatabase(): Promise<{
  pool: Pool;
  close: () => Promise<void>;
}> {
  const db = new PGlite();

  await db.exec(readFileSync(MIGRATION, "utf8"));

  // pg's Pool reports `rowCount`. PGlite reports `affectedRows`.
  const pool = {
    query: async (text: string, params?: unknown[]) => {
      const result = await db.query(text, params as unknown[]);

      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
  } as unknown as Pool;

  return { pool, close: () => db.close() };
}

const EXPIRES_AT = "2026-10-27T11:00:00.000Z";

const RESULT: ExecutionResult = {
  businessTransactionId: "btx-pglite",
  action: "vendor.payment",
  target: "acme",
  parameters: { amount: 10000, currency: "INR" },
  success: true,
  executedAt: new Date("2026-10-27T10:00:00.000Z"),
  metadata: { providerRef: "ref-pglite", nested: { ok: true } },
};

describe("SupabaseExecutionOutcomeStore on PostgreSQL semantics", () => {
  it("lets exactly one of twenty concurrent first attempts create the in-flight row", async () => {
    const { pool, close } = await createDatabase();
    const store = new SupabaseExecutionOutcomeStore(pool);

    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.begin("n-race", EXPIRES_AT)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.get("n-race")).toEqual({ status: "in_flight" });

    await close();
  });

  it("stores a completed result and returns it with its nested fields and executedAt as a Date", async () => {
    const { pool, close } = await createDatabase();
    const store = new SupabaseExecutionOutcomeStore(pool);

    await store.begin("n-done", EXPIRES_AT);
    await store.complete("n-done", RESULT);

    expect(await store.get("n-done")).toEqual({
      status: "completed",
      result: RESULT,
    });

    const outcome = await store.get("n-done");

    expect(
      outcome?.status === "completed" && outcome.result.executedAt,
    ).toBeInstanceOf(Date);

    await close();
  });

  it("never overwrites a completed row, so a second complete for the same nonce is refused", async () => {
    const { pool, close } = await createDatabase();
    const store = new SupabaseExecutionOutcomeStore(pool);

    await store.begin("n-once", EXPIRES_AT);
    await store.complete("n-once", RESULT);

    await expect(
      store.complete("n-once", { ...RESULT, success: false }),
    ).rejects.toThrow("No in-flight execution outcome recorded");

    const outcome = await store.get("n-once");

    expect(outcome?.status === "completed" && outcome.result.success).toBe(
      true,
    );

    await close();
  });

  it("reports an unrecorded nonce as undefined and never creates a row on read", async () => {
    const { pool, close } = await createDatabase();
    const store = new SupabaseExecutionOutcomeStore(pool);

    expect(await store.get("n-none")).toBeUndefined();
    expect(await store.begin("n-none", EXPIRES_AT)).toBe(true);

    await close();
  });
});
