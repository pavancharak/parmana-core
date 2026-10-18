//
// TEST 6: the production nonce store on real PostgreSQL semantics.
// SupabaseNonceStore issues one INSERT against consumed_nonces, whose primary key
// is the nonce, and reads a unique violation as "already consumed". Here that SQL
// runs on PGlite (PostgreSQL compiled to WASM), so the primary key and error code
// are real. A restart is modelled by a new store instance on the same database.
//
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { SupabaseNonceStore } from "@parmana/storage";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cases: Record<string, unknown>[] = [];

// Column definitions as in supabase/migrations/20260718090000_add_nonce_and_caller_audit_tables.sql.
const DDL = `CREATE TABLE consumed_nonces (nonce TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL);`;

function poolOver(db: PGlite): any {
  return { query: async (text: string, params?: unknown[]) => db.query(text, params as any[]) };
}

afterAll(() => {
  mkdirSync(join(root, "proof-audit/results"), { recursive: true });
  writeFileSync(join(root, "proof-audit/results/test6.json"), JSON.stringify(cases, null, 2));
});

describe("TEST 6: production nonce store on PostgreSQL semantics", () => {
  it("first use is accepted; a replay is refused", async () => {
    const db = new PGlite();
    await db.exec(DDL);
    const store = new SupabaseNonceStore(poolOver(db));
    const exp = new Date(Date.now() + 120_000).toISOString();
    const first = await store.checkAndRecord("n-1", exp);
    const replay = await store.checkAndRecord("n-1", exp);
    cases.push({ case: "first use accepted, replay refused", first, replay, verdict: first === true && replay === false ? "PASS" : "FAIL" });
    await db.close();
    expect(first).toBe(true);
    expect(replay).toBe(false);
  });

  it("20 concurrent attempts with the same nonce: exactly one succeeds", async () => {
    const db = new PGlite();
    await db.exec(DDL);
    const store = new SupabaseNonceStore(poolOver(db));
    const exp = new Date(Date.now() + 120_000).toISOString();
    const results = await Promise.all(Array.from({ length: 20 }, () => store.checkAndRecord("n-race", exp)));
    const winners = results.filter(Boolean).length;
    cases.push({ case: "20 concurrent attempts, same nonce", winners, verdict: winners === 1 ? "PASS" : "FAIL" });
    await db.close();
    expect(winners).toBe(1);
  });

  it("restart: a new store on the same database still refuses a replay", async () => {
    const db = new PGlite();
    await db.exec(DDL);
    const exp = new Date(Date.now() + 120_000).toISOString();
    await new SupabaseNonceStore(poolOver(db)).checkAndRecord("n-restart", exp);
    const afterRestart = await new SupabaseNonceStore(poolOver(db)).checkAndRecord("n-restart", exp);
    cases.push({ case: "replay after restart (new store, same database)", accepted: afterRestart, verdict: afterRestart === false ? "PASS" : "FAIL" });
    await db.close();
    expect(afterRestart).toBe(false);
  });

  it("a database error is not read as a replay (it propagates)", async () => {
    const db = new PGlite();
    const store = new SupabaseNonceStore(poolOver(db)); // table not created
    let threw = false;
    try { await store.checkAndRecord("n-x", new Date().toISOString()); } catch { threw = true; }
    cases.push({ case: "missing table is an error, not a replay", threw, verdict: threw ? "PASS" : "FAIL" });
    await db.close();
    expect(threw).toBe(true);
  });
});
