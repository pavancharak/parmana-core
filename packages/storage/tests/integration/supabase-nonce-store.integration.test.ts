import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { PostgresPoolFactory } from "../../src/postgres/PostgresPoolFactory.js";
import { SupabaseNonceStore } from "../../src/supabase/SupabaseNonceStore.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate("Supabase Nonce Store");

/**
 * Closes G-13 (docs/VERIFICATION-GAPS.md): proves replay protection is
 * durable against a real database, not just against this session's
 * mocked-storage unit tests (packages/storage/tests/unit/
 * supabase-nonce-store.test.ts). Requires the consumed_nonces table
 * from supabase/migrations/20260718090000_add_nonce_and_caller_audit_
 * tables.sql to have been applied to the target project.
 *
 * Writes via PostgresPoolFactory (DATABASE_URL) now, not a
 * supabase-js/PostgREST client — see SupabaseNonceStore for why.
 */
describe.skipIf(!databaseConfigured)("SupabaseNonceStore (live)", () => {
  it("consumes a nonce and rejects a second attempt against the same backing", async () => {
    const pool = PostgresPoolFactory.create();
    const store = new SupabaseNonceStore(pool);

    const nonce = `test-nonce-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const first = await store.checkAndRecord(nonce, expiresAt);
    const second = await store.checkAndRecord(nonce, expiresAt);

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("(concurrency, live database) two simultaneous checkAndRecord calls for the same nonce: exactly one succeeds", async () => {
    const pool = PostgresPoolFactory.create();
    const store = new SupabaseNonceStore(pool);

    const nonce = `test-nonce-race-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    // Real concurrent transactions against Postgres, not a simulated
    // interleaving — this is the proof the mocked unit test cannot
    // provide on its own: the database's own unique constraint on
    // `nonce`, not application code, is what makes this atomic.
    const [a, b] = await Promise.all([
      store.checkAndRecord(nonce, expiresAt),
      store.checkAndRecord(nonce, expiresAt),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("(restart simulation — proves G-13 closed) a nonce consumed through one store instance is still consumed by a fresh instance against the same backing", async () => {
    // Two independently constructed clients and store instances,
    // sharing nothing except the Supabase project they both point
    // at — standing in for "process A consumes the nonce, process A
    // restarts (or process B, a second gateway instance, checks the
    // same nonce)". MemoryNonceStore cannot pass this test at all:
    // a fresh MemoryNonceStore has an empty Map and would accept the
    // same nonce again. That gap is exactly G-13.
    const firstInstancePool = PostgresPoolFactory.create();
    const firstInstance = new SupabaseNonceStore(firstInstancePool);

    const nonce = `test-nonce-restart-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const consumedByFirstInstance = await firstInstance.checkAndRecord(
      nonce,
      expiresAt,
    );
    expect(consumedByFirstInstance).toBe(true);

    const freshInstancePool = PostgresPoolFactory.create();
    const freshInstance = new SupabaseNonceStore(freshInstancePool);

    const consumedByFreshInstance = await freshInstance.checkAndRecord(
      nonce,
      expiresAt,
    );

    expect(consumedByFreshInstance).toBe(false);
  });
});
