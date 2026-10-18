import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Pool } from "pg";

import { AuditEventCrypto } from "@parmana/crypto";
import type { ExecutionAuditEvent } from "@parmana/shared";

import { SupabaseExecutionAuditSink } from "../../src/supabase/SupabaseExecutionAuditSink.js";

//
// Hermetic key material -- mirrors
// packages/api/tests/unit/supabase-caller-audit-sink.test.ts's own
// convention.
//
let keyDir: string;
let previousKeyDir: string | undefined;

beforeEach(() => {
  keyDir = mkdtempSync(join(tmpdir(), "parmana-execution-audit-sink-keys-"));

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  writeFileSync(
    join(keyDir, "default.private.pem"),
    privateKey.export({ format: "pem", type: "pkcs8" }),
  );

  writeFileSync(
    join(keyDir, "default.public.pem"),
    publicKey.export({ format: "pem", type: "spki" }),
  );

  previousKeyDir = process.env.PARMANA_KEY_DIR;
  process.env.PARMANA_KEY_DIR = keyDir;
});

afterEach(() => {
  if (previousKeyDir === undefined) {
    delete process.env.PARMANA_KEY_DIR;
  } else {
    process.env.PARMANA_KEY_DIR = previousKeyDir;
  }

  rmSync(keyDir, { recursive: true, force: true });
});

interface FakeStoredRow {
  readonly authorization_id: string;
  readonly chain_hash: string;
  readonly chain_position: number;
  readonly [key: string]: unknown;
}

/**
 * A fake Pool/PoolClient minimally simulating the statement shapes
 * SupabaseExecutionAuditSink issues: transaction control
 * (BEGIN/COMMIT/ROLLBACK), the advisory lock, the last-chain-link
 * lookup, the INSERT, and the plain SELECT query() issues (via
 * pool.query, no transaction). Maintains real in-memory rows so
 * multi-call tests can observe real chain-position sequencing and
 * query() can read back what record() wrote.
 */
function createFakePool(options?: {
  readonly insertError?: { code?: string; message: string };
  readonly onInsert?: (values: readonly unknown[]) => void;
}): Pool & { readonly rows: readonly FakeStoredRow[] } {
  const rows: FakeStoredRow[] = [];

  function handle(sql: string, values?: readonly unknown[]) {
    const trimmed = sql.trim();

    if (/^(BEGIN|COMMIT|ROLLBACK)\b/.test(trimmed)) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    if (trimmed.includes("pg_advisory_xact_lock")) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    if (trimmed.startsWith("SELECT chain_hash, chain_position")) {
      const authorizationId = values?.[0] as string;
      const scoped = rows.filter(
        (row) => row.authorization_id === authorizationId,
      );
      const last = scoped[scoped.length - 1];

      return Promise.resolve({
        rows: last
          ? [
              {
                chain_hash: last.chain_hash,
                chain_position: String(last.chain_position),
              },
            ]
          : [],
      });
    }

    if (trimmed.startsWith("INSERT INTO execution_audit_events")) {
      const v = values ?? [];

      options?.onInsert?.(v);

      if (options?.insertError) {
        return Promise.reject(options.insertError);
      }

      rows.push({
        type: v[0] as string,
        occurred_at: v[1] as string,
        connector_id: v[2] as string,
        authorization_id: v[3] as string,
        session_id: v[4] as string,
        action: (v[5] as string | null) ?? null,
        reason: (v[6] as string | null) ?? null,
        credential_id: (v[7] as string | null) ?? null,
        gateway_id: (v[8] as string | null) ?? null,
        business_transaction_id: (v[9] as string | null) ?? null,
        chain_hash: v[11] as string,
        previous_chain_hash: (v[12] as string | null) ?? null,
        chain_position: v[13] as number,
      });

      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    if (trimmed.startsWith("SELECT type, occurred_at")) {
      // query(): apply the same WHERE semantics inline against the fake
      // in-memory rows, rather than parsing SQL -- good enough to
      // exercise SupabaseExecutionAuditSink.query()'s own filter
      // construction and result mapping.
      let filtered = [...rows];
      let cursor = 0;

      const takesFilter = (column: string) =>
        trimmed.includes(`${column} = $`) ||
        trimmed.includes(`${column} >= $`) ||
        trimmed.includes(`${column} <= $`);

      if (takesFilter("authorization_id")) {
        filtered = filtered.filter(
          (r) => r.authorization_id === values?.[cursor],
        );
        cursor += 1;
      }
      if (takesFilter("business_transaction_id")) {
        filtered = filtered.filter(
          (r) => r.business_transaction_id === values?.[cursor],
        );
        cursor += 1;
      }
      if (takesFilter("connector_id")) {
        filtered = filtered.filter((r) => r.connector_id === values?.[cursor]);
        cursor += 1;
      }
      if (trimmed.includes("type = $")) {
        filtered = filtered.filter((r) => r.type === values?.[cursor]);
        cursor += 1;
      }
      if (trimmed.includes("occurred_at >= $")) {
        filtered = filtered.filter(
          (r) => (r.occurred_at as string) >= (values?.[cursor] as string),
        );
        cursor += 1;
      }
      if (trimmed.includes("occurred_at <= $")) {
        filtered = filtered.filter(
          (r) => (r.occurred_at as string) <= (values?.[cursor] as string),
        );
        cursor += 1;
      }

      return Promise.resolve({
        rows: filtered
          .slice()
          .reverse()
          .map((r) => ({
            type: r.type,
            occurred_at: new Date(r.occurred_at as string),
            connector_id: r.connector_id,
            authorization_id: r.authorization_id,
            session_id: r.session_id,
            action: r.action,
            reason: r.reason,
            credential_id: r.credential_id,
            gateway_id: r.gateway_id,
            business_transaction_id: r.business_transaction_id,
            chain_hash: r.chain_hash,
            previous_chain_hash: r.previous_chain_hash,
            chain_position: r.chain_position,
          })),
      });
    }

    throw new Error(`unexpected query in fake pool: ${sql}`);
  }

  const client = {
    query: (sql: string, values?: readonly unknown[]) => handle(sql, values),
    release: () => {},
  };

  const pool = {
    query: (sql: string, values?: readonly unknown[]) => handle(sql, values),
    connect: () => Promise.resolve(client),
    rows,
  };

  return pool as unknown as Pool & { readonly rows: readonly FakeStoredRow[] };
}

function toRow(values: readonly unknown[]): Record<string, unknown> {
  const [
    type,
    occurred_at,
    connector_id,
    authorization_id,
    session_id,
    action,
    reason,
    credential_id,
    gateway_id,
    business_transaction_id,
    signature_json_raw,
    chain_hash,
    previous_chain_hash,
    chain_position,
  ] = values;

  return {
    type,
    occurred_at,
    connector_id,
    authorization_id,
    session_id,
    action,
    reason,
    credential_id,
    gateway_id,
    business_transaction_id,
    signature_json: JSON.parse(signature_json_raw as string),
    chain_hash,
    previous_chain_hash,
    chain_position,
  };
}

const SESSION_CREATED_EVENT: ExecutionAuditEvent = {
  type: "session.created",
  occurredAt: "2026-01-01T00:00:00.000Z",
  connectorId: "paytm",
  authorizationId: "auth-1",
  sessionId: "session-1",
  action: "paytm:refund",
};

const EXECUTION_COMPLETED_EVENT: ExecutionAuditEvent = {
  type: "execution.completed",
  occurredAt: "2026-01-01T00:00:05.000Z",
  connectorId: "paytm",
  authorizationId: "auth-1",
  sessionId: "session-1",
  action: "paytm:refund",
};

const EXECUTION_REJECTED_EVENT: ExecutionAuditEvent = {
  type: "execution.rejected",
  occurredAt: "2026-01-01T00:00:05.000Z",
  connectorId: "paytm",
  authorizationId: "auth-2",
  sessionId: "session-2",
  action: "paytm:refund",
  reason: "PaytmConnector request timed out after 10000ms.",
};

const SESSION_CREATED_WITH_BTX_EVENT: ExecutionAuditEvent = {
  type: "session.created",
  occurredAt: "2026-01-01T00:00:00.000Z",
  connectorId: "paytm",
  authorizationId: "auth-3",
  sessionId: "session-3",
  action: "paytm:refund",
  businessTransactionId: "btx-1",
};

describe("SupabaseExecutionAuditSink", () => {
  it("resolves on a successful insert", async () => {
    const sink = new SupabaseExecutionAuditSink(createFakePool());

    await expect(sink.record(SESSION_CREATED_EVENT)).resolves.toBeUndefined();
  });

  it("maps ExecutionAuditEvent fields to query params, nulling absent optional fields, and starts a new authorization's chain at position 1", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseExecutionAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(SESSION_CREATED_EVENT);

    expect(capturedRow).toEqual({
      type: "session.created",
      occurred_at: "2026-01-01T00:00:00.000Z",
      connector_id: "paytm",
      authorization_id: "auth-1",
      session_id: "session-1",
      action: "paytm:refund",
      reason: null,
      credential_id: null,
      gateway_id: null,
      business_transaction_id: null,
      signature_json: {
        algorithm: "ed25519",
        keyId: "default",
        value: expect.any(String),
        signedAt: expect.any(String),
      },
      chain_hash: expect.any(String),
      previous_chain_hash: null,
      chain_position: 1,
    });
  });

  it("maps an execution.rejected event's reason", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseExecutionAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(EXECUTION_REJECTED_EVENT);

    expect(capturedRow).toMatchObject({
      type: "execution.rejected",
      authorization_id: "auth-2",
      reason: "PaytmConnector request timed out after 10000ms.",
    });
  });

  it("chains session.created -> execution.completed for the same authorization, incrementing chain_position", async () => {
    const capturedRows: Record<string, unknown>[] = [];

    const sink = new SupabaseExecutionAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRows.push(toRow(values));
        },
      }),
    );

    await sink.record(SESSION_CREATED_EVENT);
    await sink.record(EXECUTION_COMPLETED_EVENT);

    expect(capturedRows[0]!.chain_position).toBe(1);
    expect(capturedRows[0]!.previous_chain_hash).toBeNull();

    expect(capturedRows[1]!.chain_position).toBe(2);
    expect(capturedRows[1]!.previous_chain_hash).toBe(
      capturedRows[0]!.chain_hash,
    );
    expect(capturedRows[1]!.chain_hash).not.toBe(capturedRows[0]!.chain_hash);
  });

  it("gives two different authorizations independent chains, each starting at position 1", async () => {
    const capturedRows: Record<string, unknown>[] = [];

    const sink = new SupabaseExecutionAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRows.push(toRow(values));
        },
      }),
    );

    await sink.record(SESSION_CREATED_EVENT);
    await sink.record(EXECUTION_REJECTED_EVENT);
    await sink.record(EXECUTION_COMPLETED_EVENT);

    const [auth1Event1, auth2Event1, auth1Event2] = capturedRows;

    expect(auth1Event1!.chain_position).toBe(1);
    expect(auth2Event1!.chain_position).toBe(1);
    expect(auth1Event1!.chain_hash).not.toBe(auth2Event1!.chain_hash);

    expect(auth1Event2!.chain_position).toBe(2);
    expect(auth1Event2!.previous_chain_hash).toBe(auth1Event1!.chain_hash);
  });

  it("signs each chained event so it verifies against its own canonical bytes, and a tampered event fails verification", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseExecutionAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(SESSION_CREATED_EVENT);

    const crypto = new AuditEventCrypto();
    const signature = capturedRow!.signature_json as {
      algorithm: "ed25519";
      keyId: string;
      value: string;
      signedAt: Date;
    };

    const signedContent = {
      ...SESSION_CREATED_EVENT,
      previousChainHash: capturedRow!.previous_chain_hash,
      chainPosition: capturedRow!.chain_position,
    };

    await expect(crypto.verify(signedContent, signature)).resolves.toBe(true);

    const tamperedContent = {
      ...signedContent,
      reason: "attacker-injected reason",
    };

    await expect(crypto.verify(tamperedContent, signature)).resolves.toBe(
      false,
    );
  });

  it("preserves existing failure semantics: a storage error rejects the returned promise", async () => {
    const sink = new SupabaseExecutionAuditSink(
      createFakePool({
        insertError: { code: "08006", message: "connection failure" },
      }),
    );

    await expect(sink.record(SESSION_CREATED_EVENT)).rejects.toMatchObject({
      code: "08006",
    });
  });

  it("query() with no filter returns every recorded event, newest first", async () => {
    const pool = createFakePool();
    const sink = new SupabaseExecutionAuditSink(pool);

    await sink.record(SESSION_CREATED_EVENT);
    await sink.record(EXECUTION_COMPLETED_EVENT);

    const results = await sink.query();

    expect(results).toHaveLength(2);
    expect(results[0]!.type).toBe("execution.completed");
    expect(results[1]!.type).toBe("session.created");
  });

  it("query() filters by authorizationId, retrieving one authorization's complete chain", async () => {
    const pool = createFakePool();
    const sink = new SupabaseExecutionAuditSink(pool);

    await sink.record(SESSION_CREATED_EVENT);
    await sink.record(EXECUTION_REJECTED_EVENT);
    await sink.record(EXECUTION_COMPLETED_EVENT);

    const results = await sink.query({ authorizationId: "auth-1" });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.authorizationId === "auth-1")).toBe(true);
    expect(results[0]!.type).toBe("execution.completed");
    expect(results[1]!.type).toBe("session.created");
    expect(results[1]!.chainPosition).toBe(1);
    expect(results[0]!.chainPosition).toBe(2);
    expect(results[0]!.previousChainHash).toBe(results[1]!.chainHash);
  });

  it("query() filters by type", async () => {
    const pool = createFakePool();
    const sink = new SupabaseExecutionAuditSink(pool);

    await sink.record(SESSION_CREATED_EVENT);
    await sink.record(EXECUTION_REJECTED_EVENT);

    const results = await sink.query({ type: "execution.rejected" });

    expect(results).toHaveLength(1);
    expect(results[0]!.reason).toBe(
      "PaytmConnector request timed out after 10000ms.",
    );
  });

  it("records and queries by businessTransactionId (GAP-3): the cross-service correlation key a remote connector service can also supply", async () => {
    const pool = createFakePool();
    const sink = new SupabaseExecutionAuditSink(pool);

    await sink.record(SESSION_CREATED_WITH_BTX_EVENT);
    await sink.record(SESSION_CREATED_EVENT);

    const results = await sink.query({ businessTransactionId: "btx-1" });

    expect(results).toHaveLength(1);
    expect(results[0]!.authorizationId).toBe("auth-3");
    expect(results[0]!.businessTransactionId).toBe("btx-1");
  });

  it("leaves businessTransactionId absent (not null) on query() results for events recorded without one", async () => {
    const pool = createFakePool();
    const sink = new SupabaseExecutionAuditSink(pool);

    await sink.record(SESSION_CREATED_EVENT);

    const results = await sink.query({ authorizationId: "auth-1" });

    expect(results).toHaveLength(1);
    expect(results[0]!.businessTransactionId).toBeUndefined();
  });
});
