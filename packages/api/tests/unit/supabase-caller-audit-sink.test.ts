import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Pool } from "pg";

import { AuditEventCrypto } from "@parmana/crypto";

import { SupabaseCallerAuditSink } from "../../src/auth/SupabaseCallerAuditSink.js";
import type { CallerAuditEvent } from "../../src/auth/CallerAuditSink.js";

//
// Hermetic key material -- signing is now involved, matching
// runtime.test.ts's own convention.
//
let keyDir: string;
let previousKeyDir: string | undefined;

beforeEach(() => {
  keyDir = mkdtempSync(join(tmpdir(), "parmana-caller-audit-sink-keys-"));

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
  readonly caller_id: string | null;
  readonly chain_hash: string | null;
  readonly chain_position: number | null;
}

/**
 * A fake Pool/PoolClient minimally simulating the three statement
 * shapes SupabaseCallerAuditSink.record() issues: the transaction
 * control statements (BEGIN/COMMIT/ROLLBACK), the advisory lock, the
 * last-chain-link lookup (SELECT chain_hash, chain_position ...), and
 * the INSERT itself. Maintains real in-memory rows so multi-call
 * tests can observe real chain-position sequencing, not a canned
 * response.
 */
function createFakePool(options?: {
  readonly insertError?: { code?: string; message: string };
  readonly onInsert?: (values: readonly unknown[]) => void;
}): Pool & { readonly rows: readonly FakeStoredRow[] } {
  const rows: FakeStoredRow[] = [];

  const client = {
    query: (sql: string, values?: readonly unknown[]) => {
      const trimmed = sql.trim();

      if (/^(BEGIN|COMMIT|ROLLBACK)\b/.test(trimmed)) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }

      if (trimmed.includes("pg_advisory_xact_lock")) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }

      if (trimmed.startsWith("SELECT chain_hash, chain_position")) {
        const callerId = values?.[0] as string;
        const callerRows = rows.filter((row) => row.caller_id === callerId);
        const last = callerRows[callerRows.length - 1];

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

      if (trimmed.startsWith("INSERT INTO caller_audit_events")) {
        expect(sql).toContain("INSERT INTO caller_audit_events");

        const v = values ?? [];

        options?.onInsert?.(v);

        if (options?.insertError) {
          return Promise.reject(options.insertError);
        }

        rows.push({
          caller_id: (v[3] as string | null) ?? null,
          chain_hash: (v[10] as string | null) ?? null,
          chain_position: (v[12] as number | null) ?? null,
        });

        return Promise.resolve({ rows: [], rowCount: 0 });
      }

      throw new Error(`unexpected query in fake pool: ${sql}`);
    },
    release: () => {},
  };

  const pool = {
    query: (sql: string, values?: readonly unknown[]) =>
      client.query(sql, values),
    connect: () => Promise.resolve(client),
    rows,
  };

  return pool as unknown as Pool & { readonly rows: readonly FakeStoredRow[] };
}

/**
 * Maps the positional $1.. values SupabaseCallerAuditSink passes to
 * the INSERT statement back to named columns, in the same order as
 * INSERT_CALLER_AUDIT_EVENT_SQL, for readable assertions.
 */
function toRow(values: readonly unknown[]): Record<string, unknown> {
  const [
    type,
    occurred_at,
    route,
    caller_id,
    reason,
    capability,
    principal_id,
    severity,
    business_transaction_id,
    signature_json_raw,
    chain_hash,
    previous_chain_hash,
    chain_position,
  ] = values;

  return {
    type,
    occurred_at,
    route,
    caller_id,
    reason,
    capability,
    principal_id,
    severity,
    business_transaction_id,
    signature_json: JSON.parse(signature_json_raw as string),
    chain_hash,
    previous_chain_hash,
    chain_position,
  };
}

const AUTHENTICATED_EVENT: CallerAuditEvent = {
  type: "caller.authenticated",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/execute",
  callerId: "caller-1",
};

const REJECTED_EVENT: CallerAuditEvent = {
  type: "caller.rejected",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/execute",
  reason: "missing credential",
};

const CAPABILITY_DENIED_EVENT: CallerAuditEvent = {
  type: "caller.capability_denied",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/execute",
  callerId: "caller-1",
  capability: "hubspot:deal-update",
  reason: "capability not allowed",
};

const PRINCIPAL_DENIED_EVENT: CallerAuditEvent = {
  type: "caller.principal_denied",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/execute",
  callerId: "caller-1",
  principalId: "someone-else",
  reason: "principal not allowed",
};

const STRUCTURAL_REJECTED_EVENT: CallerAuditEvent = {
  type: "caller.structural_rejected",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/execute",
  callerId: "caller-1",
  businessTransactionId: "11111111-1111-4111-8111-111111111111",
  reason:
    "Business Transaction '11111111-1111-4111-8111-111111111111' already exists.",
};

const NON_HUMAN_DENIED_EVENT: CallerAuditEvent = {
  type: "caller.non_human_denied",
  occurredAt: "2026-01-01T00:00:00.000Z",
  route: "/policies/pending-changes",
  callerId: "caller-1",
  reason:
    "credential is not provisioned as a verified human (credentialHolderType !== USER)",
  severity: "flagged",
};

describe("SupabaseCallerAuditSink", () => {
  it("resolves on a successful insert", async () => {
    const sink = new SupabaseCallerAuditSink(createFakePool());

    await expect(sink.record(AUTHENTICATED_EVENT)).resolves.toBeUndefined();
  });

  it("maps CallerAuditEvent fields to query params, nulling absent optional fields, and starts a new caller's chain at position 1", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(AUTHENTICATED_EVENT);

    expect(capturedRow).toEqual({
      type: "caller.authenticated",
      occurred_at: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      caller_id: "caller-1",
      reason: null,
      capability: null,
      principal_id: null,
      severity: null,
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

  it("maps a rejected event's reason, nulling the absent callerId and every chain field (no caller to chain against)", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(REJECTED_EVENT);

    expect(capturedRow).toEqual({
      type: "caller.rejected",
      occurred_at: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      caller_id: null,
      reason: "missing credential",
      capability: null,
      principal_id: null,
      severity: null,
      business_transaction_id: null,
      signature_json: {
        algorithm: "ed25519",
        keyId: "default",
        value: expect.any(String),
        signedAt: expect.any(String),
      },
      chain_hash: null,
      previous_chain_hash: null,
      chain_position: null,
    });
  });

  it("maps a capability_denied event's capability and reason", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(CAPABILITY_DENIED_EVENT);

    expect(capturedRow).toEqual({
      type: "caller.capability_denied",
      occurred_at: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      caller_id: "caller-1",
      reason: "capability not allowed",
      capability: "hubspot:deal-update",
      principal_id: null,
      severity: null,
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

  it("maps a principal_denied event's principalId and reason", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(PRINCIPAL_DENIED_EVENT);

    expect(capturedRow).toEqual({
      type: "caller.principal_denied",
      occurred_at: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      caller_id: "caller-1",
      reason: "principal not allowed",
      capability: null,
      principal_id: "someone-else",
      severity: null,
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

  it("maps a non_human_denied event's severity, nulling capability and principal_id", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(NON_HUMAN_DENIED_EVENT);

    expect(capturedRow).toEqual({
      type: "caller.non_human_denied",
      occurred_at: "2026-01-01T00:00:00.000Z",
      route: "/policies/pending-changes",
      caller_id: "caller-1",
      reason:
        "credential is not provisioned as a verified human (credentialHolderType !== USER)",
      capability: null,
      principal_id: null,
      severity: "flagged",
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

  it("maps a structural_rejected event's businessTransactionId and reason (G-29)", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(STRUCTURAL_REJECTED_EVENT);

    expect(capturedRow).toEqual({
      type: "caller.structural_rejected",
      occurred_at: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      caller_id: "caller-1",
      reason:
        "Business Transaction '11111111-1111-4111-8111-111111111111' already exists.",
      capability: null,
      principal_id: null,
      severity: null,
      business_transaction_id: "11111111-1111-4111-8111-111111111111",
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

  it("maps a structural_rejected event with no known caller (malformed body, ahead of caller-auth), nulling caller_id and every chain field", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record({
      type: "caller.structural_rejected",
      occurredAt: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      reason: "malformed JSON body",
    });

    expect(capturedRow).toEqual({
      type: "caller.structural_rejected",
      occurred_at: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      caller_id: null,
      reason: "malformed JSON body",
      capability: null,
      principal_id: null,
      severity: null,
      business_transaction_id: null,
      signature_json: {
        algorithm: "ed25519",
        keyId: "default",
        value: expect.any(String),
        signedAt: expect.any(String),
      },
      chain_hash: null,
      previous_chain_hash: null,
      chain_position: null,
    });
  });

  it("preserves existing failure semantics: a storage error rejects the returned promise, unchanged from InMemoryCallerAuditSink's contract", async () => {
    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        insertError: { code: "08006", message: "connection failure" },
      }),
    );

    await expect(sink.record(AUTHENTICATED_EVENT)).rejects.toMatchObject({
      code: "08006",
    });
  });

  it("signs each chained event so it verifies against its own canonical bytes (including the chain link fields), and a tampered event fails verification", async () => {
    let capturedRow: Record<string, unknown> | undefined;

    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRow = toRow(values);
        },
      }),
    );

    await sink.record(AUTHENTICATED_EVENT);

    const crypto = new AuditEventCrypto();
    const signature = capturedRow!.signature_json as {
      algorithm: "ed25519";
      keyId: string;
      value: string;
      signedAt: Date;
    };

    const signedContent = {
      ...AUTHENTICATED_EVENT,
      previousChainHash: capturedRow!.previous_chain_hash,
      chainPosition: capturedRow!.chain_position,
    };

    // Genuine: verifying against the exact chained content that was signed.
    await expect(crypto.verify(signedContent, signature)).resolves.toBe(true);

    // Tampered: one field changed after the fact (simulates a
    // database row edited directly, or an operator/attacker with
    // storage access) -- this is the proof signing here is not
    // decorative.
    const tamperedContent = {
      ...signedContent,
      callerId: "attacker-controlled-caller-id",
    };

    await expect(crypto.verify(tamperedContent, signature)).resolves.toBe(
      false,
    );
  });

  it("chains a second event from the same caller to the first, incrementing chain_position", async () => {
    const capturedRows: Record<string, unknown>[] = [];

    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRows.push(toRow(values));
        },
      }),
    );

    await sink.record(AUTHENTICATED_EVENT);
    await sink.record(CAPABILITY_DENIED_EVENT);

    expect(capturedRows[0]!.chain_position).toBe(1);
    expect(capturedRows[0]!.previous_chain_hash).toBeNull();

    expect(capturedRows[1]!.chain_position).toBe(2);
    expect(capturedRows[1]!.previous_chain_hash).toBe(
      capturedRows[0]!.chain_hash,
    );
    expect(capturedRows[1]!.chain_hash).not.toBe(capturedRows[0]!.chain_hash);
  });

  it("gives two different callers independent chains, each starting at position 1", async () => {
    const capturedRows: Record<string, unknown>[] = [];

    const sink = new SupabaseCallerAuditSink(
      createFakePool({
        onInsert: (values) => {
          capturedRows.push(toRow(values));
        },
      }),
    );

    await sink.record(AUTHENTICATED_EVENT);
    await sink.record({ ...AUTHENTICATED_EVENT, callerId: "caller-2" });
    await sink.record({ ...CAPABILITY_DENIED_EVENT, callerId: "caller-1" });

    const [aliceEvent1, bobEvent1, aliceEvent2] = capturedRows;

    expect(aliceEvent1!.chain_position).toBe(1);
    expect(bobEvent1!.chain_position).toBe(1);
    expect(aliceEvent1!.chain_hash).not.toBe(bobEvent1!.chain_hash);

    expect(aliceEvent2!.chain_position).toBe(2);
    expect(aliceEvent2!.previous_chain_hash).toBe(aliceEvent1!.chain_hash);
  });

  it("does not corrupt the pool's connection when an insert fails mid-transaction (client released, no dangling lock)", async () => {
    const pool = createFakePool({
      insertError: { code: "08006", message: "connection failure" },
    });

    const sink = new SupabaseCallerAuditSink(pool);

    await expect(sink.record(AUTHENTICATED_EVENT)).rejects.toMatchObject({
      code: "08006",
    });

    // No row was actually persisted.
    expect(pool.rows).toHaveLength(0);
  });
});
