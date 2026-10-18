//
// TEST 10: the Postgres execution audit sink (G-117).
// The real SupabaseExecutionAuditSink writes through a pg-shaped pool backed by PGlite
// (PostgreSQL compiled to WASM). The table is created by running the repository's own
// migrations for execution_audit_events. Rows are read back in chain order and checked
// with CallerAuditChainVerifier. The sink signs the same shape (event + previousChainHash
// + chainPosition), so the same verifier applies.
//
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { CallerAuditChainVerifier, type ChainedCallerAuditEventRow } from "@parmana/crypto";
import { SupabaseExecutionAuditSink } from "@parmana/storage";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cases: Record<string, unknown>[] = [];
const AUTH = "auth-audit-1";
const verifier = new CallerAuditChainVerifier();

const MIGRATIONS = [
  "supabase/migrations/20260914120000_add_execution_audit_events.sql",
  "supabase/migrations/20260914130000_add_business_transaction_correlation_to_execution_audit_events.sql",
  "supabase/migrations/20260914140000_add_authorization_verified_to_execution_audit_events.sql",
];

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  for (const m of MIGRATIONS) {
    // Supabase-only statements (roles, policies on auth.*) are not needed here; run the table DDL.
    const sql = readFileSync(join(root, m), "utf8");
    await db.exec(sql);
  }
  return db;
}

/**
 * A pg-shaped pool over one PGlite connection. PGlite has a single connection, so
 * connect() hands it to one transaction at a time (released by client.release()).
 * This serializes transactions, as the advisory lock does across real connections.
 * It does not test that lock itself.
 */
function poolOver(db: PGlite): any {
  let tail: Promise<void> = Promise.resolve();

  const connect = async () => {
    let release!: () => void;
    const previous = tail;
    tail = new Promise<void>((resolve) => (release = resolve));
    await previous;

    return {
      query: async (text: string, params?: unknown[]) => {
        const r = await db.query(text, params as any[] | undefined);
        return { rows: r.rows };
      },
      release: () => release(),
    };
  };

  return {
    connect,
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as any[] | undefined);
      return { rows: r.rows };
    },
  };
}

async function write(db: PGlite, n: number) {
  const sink = new SupabaseExecutionAuditSink(poolOver(db));
  for (let i = 1; i <= n; i++) {
    await sink.record({
      type: i === 1 ? "session.created" : "execution.completed",
      occurredAt: new Date(Date.UTC(2026, 9, 15, 12, 0, i)).toISOString(),
      connectorId: "paytm",
      authorizationId: AUTH,
      sessionId: `session-${i}`,
      action: "paytm:refund",
      businessTransactionId: "btx-1",
    } as any);
  }
}

/** Rows as a verifier reads them: signed fields only, in chain order. */
async function readRows(db: PGlite): Promise<ChainedCallerAuditEventRow[]> {
  const { rows } = await db.query<any>(
    "SELECT * FROM execution_audit_events WHERE authorization_id = $1 ORDER BY chain_position ASC",
    [AUTH],
  );
  return rows.map((row: any) => {
    const event: Record<string, unknown> = {
      type: row.type,
      occurredAt: new Date(row.occurred_at).toISOString(),
      connectorId: row.connector_id,
      authorizationId: row.authorization_id,
      sessionId: row.session_id,
    };
    if (row.action !== null) event.action = row.action;
    if (row.reason !== null) event.reason = row.reason;
    if (row.credential_id !== null) event.credentialId = row.credential_id;
    if (row.gateway_id !== null) event.gatewayId = row.gateway_id;
    if (row.business_transaction_id !== null) event.businessTransactionId = row.business_transaction_id;
    const signature = typeof row.signature_json === "string" ? JSON.parse(row.signature_json) : row.signature_json;
    return {
      event,
      signature,
      chainHash: row.chain_hash,
      previousChainHash: row.previous_chain_hash,
      chainPosition: Number(row.chain_position),
    };
  });
}

afterAll(() => {
  mkdirSync(join(root, "proof-audit/results"), { recursive: true });
  writeFileSync(join(root, "proof-audit/results/test10.json"), JSON.stringify(cases, null, 2));
});

describe("TEST 10: execution audit sink on PostgreSQL semantics", () => {
  it("baseline: a chain written through the real sink verifies", async () => {
    const db = await freshDb();
    await write(db, 4);
    const rows = await readRows(db);
    const r = await verifier.verifyChain(rows);
    cases.push({ case: "baseline chain of 4", rows: rows.length, valid: r.valid, verdict: r.valid && rows.length === 4 ? "PASS" : "FAIL" });
    await db.close();
    expect(r.valid).toBe(true);
  });

  it("edit one record's reason (position 2)", async () => {
    const db = await freshDb(); await write(db, 4);
    await db.query("UPDATE execution_audit_events SET reason = 'tampered' WHERE chain_position = 2");
    const r = await verifier.verifyChain(await readRows(db));
    cases.push({ case: "modify record 2", valid: r.valid, reason: r.reason ?? null, verdict: !r.valid ? "PASS" : "FAIL" });
    await db.close();
    expect(r.valid).toBe(false);
  });

  it("delete a middle record (position 2)", async () => {
    const db = await freshDb(); await write(db, 4);
    await db.query("DELETE FROM execution_audit_events WHERE chain_position = 2");
    const r = await verifier.verifyChain(await readRows(db));
    cases.push({ case: "delete middle record 2", valid: r.valid, reason: r.reason ?? null, verdict: !r.valid ? "PASS" : "FAIL" });
    await db.close();
    expect(r.valid).toBe(false);
  });

  it("delete the LAST record without an anchor is not detected (same limit as the caller chain)", async () => {
    const db = await freshDb(); await write(db, 4);
    await db.query("DELETE FROM execution_audit_events WHERE chain_position = 4");
    const r = await verifier.verifyChain(await readRows(db));
    cases.push({ case: "delete last record, no anchor", valid: r.valid, verdict: r.valid ? "FAIL" : "PASS", note: "detection needs the head stored outside the database (G-108)" });
    await db.close();
    expect(r.valid).toBe(true); // the documented limit, recorded as a FAIL against the claim
  });

  it("delete the LAST record with the head anchored outside the database", async () => {
    const db = await freshDb(); await write(db, 4);
    const head = (await readRows(db)).at(-1)!;
    const anchor = { chainPosition: head.chainPosition!, chainHash: head.chainHash! };
    await db.query("DELETE FROM execution_audit_events WHERE chain_position = 4");
    const r = await verifier.verifyChain(await readRows(db), anchor);
    cases.push({ case: "delete last record, anchored head", valid: r.valid, reason: r.reason ?? null, verdict: !r.valid ? "PASS" : "FAIL" });
    await db.close();
    expect(r.valid).toBe(false);
  });

  it("a burst of 10 writes to one authorization yields one consistent chain", async () => {
    const db = await freshDb();
    const sink = new SupabaseExecutionAuditSink(poolOver(db));
    await Promise.all(Array.from({ length: 10 }, (_, i) => sink.record({
      type: "execution.completed",
      occurredAt: new Date(Date.UTC(2026, 9, 15, 13, 0, i)).toISOString(),
      connectorId: "paytm", authorizationId: AUTH, sessionId: `s-${i}`, action: "paytm:refund",
    } as any)));
    const rows = await readRows(db);
    const r = await verifier.verifyChain(rows);
    cases.push({ case: "10 concurrent writes, one authorization", rows: rows.length, valid: r.valid, verdict: r.valid && rows.length === 10 ? "PASS" : "FAIL", note: "one PGlite connection, transactions serialized by the test pool; the advisory lock itself is not exercised" });
    await db.close();
    expect(rows.length).toBe(10);
    expect(r.valid).toBe(true);
  });
});
