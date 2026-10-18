import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import type { ExecutionIntent } from "@parmana/shared";

import { MemoryExecutionIntentRepository } from "../../src/memory/MemoryExecutionIntentRepository.js";
import { SupabaseExecutionIntentRepository } from "../../src/supabase/SupabaseExecutionIntentRepository.js";

function intent(
  businessTransactionId: string,
  createdAt = new Date("2026-09-21T00:00:00.000Z"),
): ExecutionIntent {
  return {
    intentId: `intent-${businessTransactionId}`,
    businessTransactionId,
    decisionId: `decision-${businessTransactionId}`,
    authorizationId: `authorization-${businessTransactionId}`,
    policyName: "customer-refund",
    policyVersion: "1.0.0",
    policyContentHash: "policy-hash",
    signalsHash: "signals-hash",
    businessTransactionHash: "content-hash",
    action: "paytm:refund",
    target: "paytm://orders/1",
    submittedBy: "caller-1",
    grantedCapability: "paytm:refund",
    createdAt,
    intentHash: "intent-hash",
    signature: {
      algorithm: "ed25519",
      keyId: "default",
      value: "signature",
      signedAt: createdAt,
    },
  };
}

describe("MemoryExecutionIntentRepository", () => {
  it("stores an intent as PREPARED and finds it by transaction", async () => {
    const repository = new MemoryExecutionIntentRepository();

    await repository.create(intent("tx-1"));

    const stored = await repository.findByTransactionId("tx-1");

    expect(stored?.intent.intentId).toBe("intent-tx-1");
    expect(stored?.status).toEqual({ state: "PREPARED" });
    expect(stored?.releasedContext).toBeUndefined();
    expect(await repository.findByTransactionId("missing")).toBeNull();
  });

  it("refuses a second intent for the same transaction", async () => {
    const repository = new MemoryExecutionIntentRepository();

    await repository.create(intent("tx-1"));

    await expect(repository.create(intent("tx-1"))).rejects.toThrow(
      /already exists/,
    );
  });

  it("moves PREPARED to RELEASED and keeps the saved context", async () => {
    const repository = new MemoryExecutionIntentRepository();
    const releasedAt = new Date("2026-09-21T00:00:05.000Z");

    await repository.create(intent("tx-1"));
    await repository.markReleased("tx-1", { saved: true }, releasedAt);

    const stored = await repository.findByTransactionId("tx-1");

    expect(stored?.status).toEqual({ state: "RELEASED", releasedAt });
    expect(stored?.releasedContext).toEqual({ saved: true });
  });

  it("only moves a PREPARED intent to RELEASED or ERRORED", async () => {
    const repository = new MemoryExecutionIntentRepository();

    await repository.create(intent("tx-1"));
    await repository.markErrored("tx-1", "connector timed out");
    await repository.markReleased("tx-1", { saved: true }, new Date());

    const stored = await repository.findByTransactionId("tx-1");

    expect(stored?.status.state).toBe("ERRORED");
    expect(stored?.status.failureReason).toBe("connector timed out");
    expect(stored?.releasedContext).toBeUndefined();

    await repository.create(intent("tx-2"));
    await repository.markReleased("tx-2", { saved: true }, new Date());
    await repository.markErrored("tx-2", "late error");

    expect((await repository.findByTransactionId("tx-2"))?.status.state).toBe(
      "RELEASED",
    );
  });

  it("finalizes from any earlier state, records the mode, and never moves a FINALIZED intent", async () => {
    const repository = new MemoryExecutionIntentRepository();
    const first = new Date("2026-09-21T00:01:00.000Z");

    await repository.create(intent("tx-1"));
    await repository.markFinalized("tx-1", "record-1", "INLINE", first);
    await repository.markFinalized(
      "tx-1",
      "record-2",
      "REPAIRED",
      new Date("2026-09-21T00:02:00.000Z"),
    );

    const stored = await repository.findByTransactionId("tx-1");

    expect(stored?.status).toMatchObject({
      state: "FINALIZED",
      trustRecordId: "record-1",
      finalizationMode: "INLINE",
      finalizedAt: first,
    });
  });

  it("deletes the saved release context when the intent becomes FINALIZED", async () => {
    const repository = new MemoryExecutionIntentRepository();

    await repository.create(intent("tx-1"));
    await repository.markReleased("tx-1", { saved: true }, new Date());

    expect(
      (await repository.findByTransactionId("tx-1"))?.releasedContext,
    ).toEqual({ saved: true });

    await repository.markFinalized("tx-1", "record-1", "REPAIRED", new Date());

    const stored = await repository.findByTransactionId("tx-1");

    expect(stored?.status.state).toBe("FINALIZED");
    expect(stored?.releasedContext).toBeUndefined();
  });

  describe("markResolved", () => {
    const resolvedAt = new Date("2026-09-21T06:00:00.000Z");

    it.each(["PREPARED", "ERRORED"] as const)(
      "closes a %s intent with the resolution, the note and who did it",
      async (from) => {
        const repository = new MemoryExecutionIntentRepository();

        await repository.create(intent("tx-1"));

        if (from === "ERRORED") {
          await repository.markErrored("tx-1", "connector timed out");
        }

        const moved = await repository.markResolved("tx-1", {
          resolution: "NOT_EXECUTED",
          note: "Checked the connector, no refund for this order.",
          resolvedBy: "operator-1",
          resolvedAt,
        });

        const stored = await repository.findByTransactionId("tx-1");

        expect(moved).toBe(true);
        expect(stored?.status).toMatchObject({
          state: "RESOLVED",
          resolution: "NOT_EXECUTED",
          resolutionNote: "Checked the connector, no refund for this order.",
          resolvedBy: "operator-1",
          resolvedAt,
        });
      },
    );

    it("never moves a RELEASED, FINALIZED or already RESOLVED intent", async () => {
      const repository = new MemoryExecutionIntentRepository();
      const input = {
        resolution: "EXECUTED" as const,
        note: "n",
        resolvedAt,
      };

      await repository.create(intent("released"));
      await repository.markReleased("released", { saved: true }, new Date());
      await repository.create(intent("finalized"));
      await repository.markFinalized("finalized", "r", "INLINE", new Date());
      await repository.create(intent("resolved"));
      await repository.markResolved("resolved", { ...input, note: "first" });

      expect(await repository.markResolved("released", input)).toBe(false);
      expect(await repository.markResolved("finalized", input)).toBe(false);
      expect(await repository.markResolved("resolved", input)).toBe(false);
      expect(await repository.markResolved("unknown", input)).toBe(false);

      expect(
        (await repository.findByTransactionId("resolved"))?.status
          .resolutionNote,
      ).toBe("first");
      expect(
        (await repository.findByTransactionId("released"))?.status.state,
      ).toBe("RELEASED");
    });

    it("removes a resolved intent from the unfinalized list", async () => {
      const repository = new MemoryExecutionIntentRepository();

      await repository.create(intent("tx-1"));
      await repository.create(intent("tx-2"));
      await repository.markResolved("tx-1", {
        resolution: "NOT_EXECUTED",
        note: "n",
        resolvedAt,
      });

      expect(
        (await repository.listUnfinalized(10)).map(
          (stored) => stored.intent.businessTransactionId,
        ),
      ).toEqual(["tx-2"]);
    });
  });

  it("lists only unfinalized intents, oldest first, up to the limit", async () => {
    const repository = new MemoryExecutionIntentRepository();

    await repository.create(intent("tx-new", new Date("2026-09-21T03:00:00Z")));
    await repository.create(intent("tx-old", new Date("2026-09-21T01:00:00Z")));
    await repository.create(
      intent("tx-done", new Date("2026-09-21T00:00:00Z")),
    );
    await repository.create(intent("tx-mid", new Date("2026-09-21T02:00:00Z")));
    await repository.markFinalized("tx-done", "r", "INLINE", new Date());

    const all = await repository.listUnfinalized(10);

    expect(all.map((stored) => stored.intent.businessTransactionId)).toEqual([
      "tx-old",
      "tx-mid",
      "tx-new",
    ]);

    expect(await repository.listUnfinalized(2)).toHaveLength(2);
  });
});

describe("SupabaseExecutionIntentRepository", () => {
  function recordingPool(rows: Record<string, unknown>[] = [], rowCount = 1) {
    const calls: { sql: string; values: readonly unknown[] }[] = [];

    const pool = {
      query(sql: string, values: readonly unknown[] = []) {
        calls.push({ sql, values });

        return Promise.resolve({ rows, rowCount });
      },
    } as unknown as Pool;

    return { pool, calls };
  }

  it("writes every signed field, and sends the signature as JSON", async () => {
    const { pool, calls } = recordingPool();

    await new SupabaseExecutionIntentRepository(pool).create(intent("tx-1"));

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("INSERT INTO execution_intents");
    expect(calls[0]?.values).toEqual([
      "intent-tx-1",
      "tx-1",
      "decision-tx-1",
      "authorization-tx-1",
      "customer-refund",
      "1.0.0",
      "policy-hash",
      "signals-hash",
      "content-hash",
      "paytm:refund",
      "paytm://orders/1",
      "caller-1",
      "paytm:refund",
      "intent-hash",
      JSON.stringify(intent("tx-1").signature),
      "2026-09-21T00:00:00.000Z",
    ]);
  });

  it("stores absent optional fields as null", async () => {
    const { pool, calls } = recordingPool();
    const {
      policyContentHash: _p,
      signalsHash: _s,
      submittedBy: _b,
      grantedCapability: _g,
      ...required
    } = intent("tx-1");

    await new SupabaseExecutionIntentRepository(pool).create(required);

    const values = calls[0]?.values ?? [];

    expect(values[6]).toBeNull();
    expect(values[7]).toBeNull();
    expect(values[11]).toBeNull();
    expect(values[12]).toBeNull();
  });

  it("maps a stored row back to an intent and its status", async () => {
    const source = intent("tx-1");
    const { pool } = recordingPool([
      {
        intent_id: source.intentId,
        business_transaction_id: "tx-1",
        decision_id: source.decisionId,
        authorization_id: source.authorizationId,
        policy_name: source.policyName,
        policy_version: source.policyVersion,
        policy_content_hash: "policy-hash",
        signals_hash: null,
        business_transaction_hash: "content-hash",
        action: source.action,
        target: source.target,
        submitted_by: null,
        granted_capability: null,
        intent_hash: "intent-hash",
        signature_json: source.signature,
        created_at: "2026-09-21T00:00:00.000Z",
        state: "FINALIZED",
        released_context_json: { saved: true },
        released_at: "2026-09-21T00:00:05.000Z",
        finalized_at: "2026-09-21T00:00:09.000Z",
        finalization_mode: "REPAIRED",
        trust_record_id: "record-1",
        failure_reason: null,
        resolution: null,
        resolution_note: null,
        resolved_by: null,
        resolved_at: null,
      },
    ]);

    const stored = await new SupabaseExecutionIntentRepository(
      pool,
    ).findByTransactionId("tx-1");

    expect(stored?.intent).toEqual({
      intentId: "intent-tx-1",
      businessTransactionId: "tx-1",
      decisionId: "decision-tx-1",
      authorizationId: "authorization-tx-1",
      policyName: "customer-refund",
      policyVersion: "1.0.0",
      policyContentHash: "policy-hash",
      businessTransactionHash: "content-hash",
      action: "paytm:refund",
      target: "paytm://orders/1",
      createdAt: new Date("2026-09-21T00:00:00.000Z"),
      intentHash: "intent-hash",
      signature: source.signature,
    });
    expect(stored?.status).toEqual({
      state: "FINALIZED",
      releasedAt: new Date("2026-09-21T00:00:05.000Z"),
      finalizedAt: new Date("2026-09-21T00:00:09.000Z"),
      finalizationMode: "REPAIRED",
      trustRecordId: "record-1",
    });
    expect(stored?.releasedContext).toEqual({ saved: true });
  });

  it("returns null when there is no row", async () => {
    const { pool } = recordingPool([]);

    expect(
      await new SupabaseExecutionIntentRepository(pool).findByTransactionId(
        "missing",
      ),
    ).toBeNull();
  });

  it("enforces the state transitions in SQL, so they hold under concurrency", async () => {
    const { pool, calls } = recordingPool();
    const repository = new SupabaseExecutionIntentRepository(pool);

    await repository.markReleased("tx-1", { saved: true }, new Date());
    await repository.markErrored("tx-1", "boom");
    await repository.markFinalized("tx-1", "record-1", "INLINE", new Date());

    const [released, errored, finalized] = calls.map((call) => call.sql);

    expect(released).toContain("state = 'PREPARED'");
    expect(errored).toContain("state = 'PREPARED'");
    expect(finalized).toContain("state <> 'FINALIZED'");
    expect(finalized).toContain("released_context_json = NULL");
  });

  it("lists unfinalized intents oldest first with a limit", async () => {
    const { pool, calls } = recordingPool([]);

    await new SupabaseExecutionIntentRepository(pool).listUnfinalized(25);

    expect(calls[0]?.sql).toContain("state NOT IN ('FINALIZED', 'RESOLVED')");
    expect(calls[0]?.sql).toContain("ORDER BY created_at ASC");
    expect(calls[0]?.values).toEqual([25]);
  });

  describe("markResolved (G-54)", () => {
    const input = {
      resolution: "EXECUTED" as const,
      note: "Refund found at the connector.",
      resolvedBy: "operator-1",
      resolvedAt: new Date("2026-09-21T06:00:00.000Z"),
    };

    it("only moves a PREPARED or ERRORED row, in SQL", async () => {
      const { pool, calls } = recordingPool();

      await new SupabaseExecutionIntentRepository(pool).markResolved(
        "tx-1",
        input,
      );

      expect(calls[0]?.sql).toContain("state IN ('PREPARED', 'ERRORED')");
      expect(calls[0]?.values).toEqual([
        "tx-1",
        "EXECUTED",
        "Refund found at the connector.",
        "operator-1",
        "2026-09-21T06:00:00.000Z",
      ]);
    });

    it("stores an absent resolvedBy as null", async () => {
      const { pool, calls } = recordingPool();
      const { resolvedBy: _by, ...withoutBy } = input;

      await new SupabaseExecutionIntentRepository(pool).markResolved(
        "tx-1",
        withoutBy,
      );

      expect(calls[0]?.values?.[3]).toBeNull();
    });

    it("reports whether this call moved the row", async () => {
      const moved = recordingPool([], 1);
      const notMoved = recordingPool([], 0);

      expect(
        await new SupabaseExecutionIntentRepository(moved.pool).markResolved(
          "tx-1",
          input,
        ),
      ).toBe(true);
      expect(
        await new SupabaseExecutionIntentRepository(notMoved.pool).markResolved(
          "tx-1",
          input,
        ),
      ).toBe(false);
    });

    it("maps the resolution columns back to the status", async () => {
      const source = intent("tx-1");
      const { pool } = recordingPool([
        {
          intent_id: source.intentId,
          business_transaction_id: "tx-1",
          decision_id: source.decisionId,
          authorization_id: source.authorizationId,
          policy_name: source.policyName,
          policy_version: source.policyVersion,
          policy_content_hash: null,
          signals_hash: null,
          business_transaction_hash: "content-hash",
          action: source.action,
          target: source.target,
          submitted_by: null,
          granted_capability: null,
          intent_hash: "intent-hash",
          signature_json: source.signature,
          created_at: "2026-09-21T00:00:00.000Z",
          state: "RESOLVED",
          released_context_json: null,
          released_at: null,
          finalized_at: null,
          finalization_mode: null,
          trust_record_id: null,
          failure_reason: "connector timed out",
          resolution: "NOT_EXECUTED",
          resolution_note: "Checked, nothing there.",
          resolved_by: "operator-1",
          resolved_at: "2026-09-21T06:00:00.000Z",
        },
      ]);

      const stored = await new SupabaseExecutionIntentRepository(
        pool,
      ).findByTransactionId("tx-1");

      expect(stored?.status).toEqual({
        state: "RESOLVED",
        failureReason: "connector timed out",
        resolution: "NOT_EXECUTED",
        resolutionNote: "Checked, nothing there.",
        resolvedBy: "operator-1",
        resolvedAt: new Date("2026-09-21T06:00:00.000Z"),
      });
    });
  });
});
