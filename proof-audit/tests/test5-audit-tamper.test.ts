//
// TEST 5: audit log tamper evidence.
// The real SupabaseCallerAuditSink.record() writes rows through a pg-shaped pool.
// The pool is backed by PGlite (real PostgreSQL compiled to WASM), so the SQL,
// advisory locks and BIGSERIAL ids are real. Rows are read back and checked with
// CallerAuditChainVerifier, the same code a verifier uses.
//
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { CallerAuditChainVerifier, CryptoBootstrap, TrustRecordHasher, type ChainedCallerAuditEventRow } from "@parmana/crypto";
import { SupabaseCallerAuditSink } from "../../packages/api/src/auth/SupabaseCallerAuditSink.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cases: Record<string, unknown>[] = [];
const N = 6;
const CALLER = "caller-a";

const DDL = `
CREATE TABLE caller_audit_events (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  route TEXT NOT NULL,
  caller_id TEXT,
  reason TEXT,
  capability TEXT,
  principal_id TEXT,
  severity TEXT,
  business_transaction_id TEXT,
  signature_json JSONB,
  chain_hash TEXT,
  previous_chain_hash TEXT,
  chain_position BIGINT,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

/** A pg-compatible pool over one PGlite connection. */
function poolOver(db: PGlite): any {
  const client = {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as any[] | undefined);
      return { rows: r.rows };
    },
    release: () => {},
  };
  return { connect: async () => client };
}

/** Writes N events through the real sink. */
async function freshChain(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(DDL);
  const sink = new SupabaseCallerAuditSink(poolOver(db));
  for (let i = 1; i <= N; i++) {
    await sink.record({
      type: i % 3 === 0 ? "caller.rejected" : "caller.authenticated",
      occurredAt: new Date(Date.UTC(2026, 9, 15, 10, 0, i)).toISOString(),
      route: "/execute",
      callerId: CALLER,
      ...(i % 3 === 0 ? { reason: `reason ${i}` } : {}),
    } as any);
  }
  return db;
}

/** Reads rows back the way a verifier would: signed fields only, ascending chain_position. */
async function readRows(db: PGlite): Promise<ChainedCallerAuditEventRow[]> {
  const { rows } = await db.query<any>(
    "SELECT * FROM caller_audit_events WHERE caller_id = $1 ORDER BY chain_position ASC",
    [CALLER],
  );
  return rows.map((row: any) => {
    const event: Record<string, unknown> = {
      type: row.type,
      occurredAt: new Date(row.occurred_at).toISOString(),
      route: row.route,
      callerId: row.caller_id,
    };
    if (row.reason !== null) event.reason = row.reason;
    if (row.capability !== null) event.capability = row.capability;
    if (row.principal_id !== null) event.principalId = row.principal_id;
    if (row.severity !== null) event.severity = row.severity;
    if (row.business_transaction_id !== null) event.businessTransactionId = row.business_transaction_id;
    const signature = typeof row.signature_json === "string" ? JSON.parse(row.signature_json) : row.signature_json;
    return {
      event,
      signature,
      chainHash: row.chain_hash,
      previousChainHash: row.previous_chain_hash,
      chainPosition: row.chain_position === null ? null : Number(row.chain_position),
    };
  });
}

const verifier = new CallerAuditChainVerifier();
const hasher = new TrustRecordHasher(CryptoBootstrap.create());

async function verdictFor(label: string, expectDetected: boolean, mutate: (db: PGlite) => Promise<void>, reorderRows?: (rows: ChainedCallerAuditEventRow[]) => ChainedCallerAuditEventRow[]) {
  const db = await freshChain();
  await mutate(db);
  let rows = await readRows(db);
  if (reorderRows) rows = reorderRows(rows);
  const result = await verifier.verifyChain(rows);
  const detected = !result.valid;
  cases.push({
    case: label,
    rowsAfter: rows.length,
    verifierValid: result.valid,
    brokenAtPosition: result.brokenAtPosition ?? null,
    reason: result.reason ?? null,
    detected,
    verdict: detected === expectDetected ? "PASS" : "FAIL",
  });
  await db.close();
  return result;
}

afterAll(() => {
  mkdirSync(join(root, "proof-audit/results"), { recursive: true });
  writeFileSync(join(root, "proof-audit/results/test5.json"), JSON.stringify(cases, null, 2));
});

describe("TEST 5: audit log tamper evidence", () => {
  it("baseline: an untouched chain of 6 verifies", async () => {
    const db = await freshChain();
    const rows = await readRows(db);
    const result = await verifier.verifyChain(rows);
    cases.push({ case: "baseline untouched chain", rowsAfter: rows.length, verifierValid: result.valid, verdict: result.valid && rows.length === N ? "PASS" : "FAIL" });
    await db.close();
    expect(result.valid).toBe(true);
  });

  it("modify one record's content (reason of position 3)", async () => {
    await verdictFor("modify content of record 3", true, (db) =>
      db.query("UPDATE caller_audit_events SET reason = 'tampered' WHERE chain_position = 3").then(() => undefined));
  });

  it("delete one record (position 3)", async () => {
    await verdictFor("delete middle record 3", true, (db) =>
      db.query("DELETE FROM caller_audit_events WHERE chain_position = 3").then(() => undefined));
  });

  it("reorder two records (chain_position of 2 and 3 swapped in storage)", async () => {
    await verdictFor("reorder two records (stored chain_position swapped)", true, async (db) => {
      await db.query("UPDATE caller_audit_events SET chain_position = 0 WHERE chain_position = 2");
      await db.query("UPDATE caller_audit_events SET chain_position = 2 WHERE chain_position = 3");
      await db.query("UPDATE caller_audit_events SET chain_position = 3 WHERE chain_position = 0");
    });
  });

  it("reorder two records (rows presented to the verifier in swapped order)", async () => {
    await verdictFor("reorder two records (presentation order swapped)", true, async () => {}, (rows) => {
      const copy = [...rows];
      [copy[1], copy[2]] = [copy[2]!, copy[1]!];
      return copy;
    });
  });

  it("attacker without the signing key recomputes chain hashes after an edit (signature not refreshed)", async () => {
    await verdictFor("edit + recomputed chain hashes, no re-signing", true, async (db) => {
      await db.query("UPDATE caller_audit_events SET reason = 'tampered' WHERE chain_position = 3");
      const { rows } = await db.query<any>("SELECT * FROM caller_audit_events WHERE caller_id = $1 ORDER BY chain_position", [CALLER]);
      let prev: string | null = null;
      for (const row of rows) {
        const event: Record<string, unknown> = { type: row.type, occurredAt: new Date(row.occurred_at).toISOString(), route: row.route, callerId: row.caller_id };
        if (row.reason !== null) event.reason = row.reason;
        const signed = { ...event, previousChainHash: prev, chainPosition: Number(row.chain_position) };
        const chainHash = await hasher.hash(signed);
        await db.query("UPDATE caller_audit_events SET chain_hash = $1, previous_chain_hash = $2 WHERE id = $3", [chainHash, prev, row.id]);
        prev = chainHash;
      }
    });
  });

  it("delete the LAST record (tail truncation)", async () => {
    // Expected by the claim: detected. Internal linkage cannot see a missing tail.
    await verdictFor("delete last record (tail truncation)", true, (db) =>
      db.query("DELETE FROM caller_audit_events WHERE chain_position = (SELECT MAX(chain_position) FROM caller_audit_events)").then(() => undefined));
  });

  it("delete the LAST record WITH an anchored chain head (head recorded before truncation)", async () => {
    const db = await freshChain();
    const before = await readRows(db);
    const anchor = { chainPosition: before[before.length - 1]!.chainPosition!, chainHash: before[before.length - 1]!.chainHash! };
    await db.query("DELETE FROM caller_audit_events WHERE chain_position = (SELECT MAX(chain_position) FROM caller_audit_events)");
    const after = await readRows(db);
    const result = await verifier.verifyChain(after, anchor);
    cases.push({ case: "delete last record WITH anchored head", rowsAfter: after.length, verifierValid: result.valid, reason: result.reason ?? null, detected: !result.valid, verdict: !result.valid ? "PASS" : "FAIL", note: "requires the head to be stored outside the database" });
    await db.close();
    expect(result.valid).toBe(false);
  });

  it("untouched chain WITH anchored head still verifies", async () => {
    const db = await freshChain();
    const rows = await readRows(db);
    const last = rows[rows.length - 1]!;
    const result = await verifier.verifyChain(rows, { chainPosition: last.chainPosition!, chainHash: last.chainHash! });
    cases.push({ case: "untouched chain with anchored head", verifierValid: result.valid, verdict: result.valid ? "PASS" : "FAIL" });
    await db.close();
    expect(result.valid).toBe(true);
  });

  it("delete the FIRST record", async () => {
    await verdictFor("delete first record", true, (db) =>
      db.query("DELETE FROM caller_audit_events WHERE chain_position = 1").then(() => undefined));
  });
});
