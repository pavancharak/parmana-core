import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import { SupabaseNonceStore } from "../../src/supabase/SupabaseNonceStore.js";

/**
 * Fake pg.Pool simulating a Postgres table with a PRIMARY KEY on
 * `nonce`: the query's own synchronous body (no `await` between the
 * has-check and the add) mirrors exactly how a real unique
 * constraint is atomic at the database engine level, and how
 * MemoryNonceStore.checkAndRecord() is itself deterministic under
 * Promise.all (see docs/VERIFICATION-GAPS.md, "Gaps closed this
 * pass" #10). Restart-simulation and true concurrent-transaction
 * behavior against a real database are proven separately, by the
 * gated integration suite — this file proves only that
 * SupabaseNonceStore interprets whatever the backing returns
 * correctly.
 */
function createFakePool(options?: {
  readonly insertError?: { code?: string; message: string };
}): Pool {
  const rows = new Set<string>();

  const pool = {
    query(sql: string, values: readonly unknown[]) {
      expect(sql).toContain("INSERT INTO consumed_nonces");

      if (options?.insertError) {
        return Promise.reject(options.insertError);
      }

      const [nonce] = values as [string, string];

      if (rows.has(nonce)) {
        return Promise.reject({
          code: "23505",
          message:
            'duplicate key value violates unique constraint "consumed_nonces_pkey"',
        });
      }

      rows.add(nonce);
      return Promise.resolve({ rows: [], rowCount: 1 });
    },
  };

  return pool as unknown as Pool;
}

describe("SupabaseNonceStore", () => {
  it("returns true and records the nonce on first consumption", async () => {
    const store = new SupabaseNonceStore(createFakePool());

    await expect(
      store.checkAndRecord("nonce-1", "2026-01-01T00:01:00.000Z"),
    ).resolves.toBe(true);
  });

  it("maps a 23505 unique-violation on the second insert of the same nonce to false, not an error", async () => {
    const store = new SupabaseNonceStore(createFakePool());

    const first = await store.checkAndRecord(
      "nonce-1",
      "2026-01-01T00:01:00.000Z",
    );
    const second = await store.checkAndRecord(
      "nonce-1",
      "2026-01-01T00:01:00.000Z",
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("(concurrency) two simultaneous checkAndRecord calls for the same nonce: exactly one succeeds", async () => {
    const store = new SupabaseNonceStore(createFakePool());

    const [a, b] = await Promise.all([
      store.checkAndRecord("nonce-race", "2026-01-01T00:01:00.000Z"),
      store.checkAndRecord("nonce-race", "2026-01-01T00:01:00.000Z"),
    ]);

    // Deterministic, not flaky: the fake pool's query() mutates its
    // Set synchronously, before either call's first `await` yields —
    // exactly one of the two must observe the row as already present.
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("fails closed: a non-unique-violation storage error propagates rather than being treated as consumed or unconsumed", async () => {
    const store = new SupabaseNonceStore(
      createFakePool({
        insertError: { code: "08006", message: "connection failure" },
      }),
    );

    await expect(
      store.checkAndRecord("nonce-1", "2026-01-01T00:01:00.000Z"),
    ).rejects.toMatchObject({ code: "08006" });
  });

  it("fails closed on an error object with no code at all (e.g. a network-level throw)", async () => {
    const store = new SupabaseNonceStore(
      createFakePool({ insertError: { message: "network unreachable" } }),
    );

    await expect(
      store.checkAndRecord("nonce-1", "2026-01-01T00:01:00.000Z"),
    ).rejects.toMatchObject({ message: "network unreachable" });
  });
});
