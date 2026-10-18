import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import type { RefusalRecord } from "@parmana/shared";

import { SupabaseRefusalRecordRepository } from "../../src/supabase/SupabaseRefusalRecordRepository.js";

function buildRefusalRecord(businessTransactionId: string): RefusalRecord {
  const now = new Date("2026-08-02T00:00:00.000Z");

  return {
    refusalRecordId: `refusal-${businessTransactionId}`,

    businessTransactionId,

    decision: {
      decisionId: `decision-${businessTransactionId}`,
      intentId: `intent-${businessTransactionId}`,
      policy: {
        name: "vendor-payment",
        version: "2.0.0",
        schemaVersion: "1.0.0",
      },
      signals: { paymentAmount: 5000 },
      outcome: "REJECTED" as const,
      reason: "test rejection",
      evaluatedAt: now,
    },

    evaluatedIntent: {
      target: "ATTACKER-CONTROLLED-ACCOUNT-9999",
      parameters: { amount: 999999999 },
    },

    bindingViolations: [
      {
        signalKey: "paymentAmount",
        intentPath: "parameters.amount",
        signalValue: 5000,
        intentValue: 999999999,
      },
    ],

    submittedBy: "caller-1",

    refusalRecordHash: "test-hash",

    signature: {
      algorithm: "ed25519",
      keyId: "default",
      value: "test-signature-value",
      signedAt: now,
    },

    createdAt: now,
  };
}

function createFakePool(options?: {
  readonly insertError?: { code?: string; message: string };
}): Pool {
  const rows = new Map<string, Record<string, unknown>>();

  const pool = {
    query(sql: string, values?: readonly unknown[]) {
      if (sql.includes("INSERT INTO refusal_records")) {
        if (options?.insertError) {
          return Promise.reject(options.insertError);
        }

        const [
          refusalRecordId,
          businessTransactionId,
          decisionJson,
          evaluatedIntentJson,
          bindingViolationsJson,
          submittedBy,
          refusalRecordHash,
          signatureJson,
          createdAt,
          policyContentHash,
        ] = values as readonly unknown[];

        rows.set(businessTransactionId as string, {
          refusal_record_id: refusalRecordId,
          business_transaction_id: businessTransactionId,
          decision_json: JSON.parse(decisionJson as string),
          evaluated_intent_json: JSON.parse(evaluatedIntentJson as string),
          binding_violations_json: bindingViolationsJson
            ? JSON.parse(bindingViolationsJson as string)
            : null,
          submitted_by: submittedBy,
          refusal_record_hash: refusalRecordHash,
          signature_json: JSON.parse(signatureJson as string),
          created_at: createdAt,
          policy_content_hash: policyContentHash,
        });

        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("SELECT * FROM refusal_records WHERE")) {
        const [businessTransactionId] = values as [string];
        const row = rows.get(businessTransactionId);

        return Promise.resolve({ rows: row ? [row] : [] });
      }

      throw new Error(`test fake: unexpected SQL: ${sql}`);
    },
  };

  return pool as unknown as Pool;
}

describe("SupabaseRefusalRecordRepository (RFC-0021)", () => {
  it("creates a Refusal Record and round-trips it through findByTransactionId with all fields intact", async () => {
    const repository = new SupabaseRefusalRecordRepository(createFakePool());

    const record = buildRefusalRecord("txn-1");

    await expect(repository.create(record)).resolves.toBe(record);

    const found = await repository.findByTransactionId("txn-1");

    expect(found).not.toBeNull();
    expect(found!.refusalRecordId).toBe(record.refusalRecordId);
    expect(found!.businessTransactionId).toBe("txn-1");

    // decision_json round-trips through real JSONB exactly like it
    // already did over supabase-js's REST wire format (JSON.stringify
    // on the way in, JSON.parse on the way out) -- evaluatedAt comes
    // back a string, not a Date, same as production traffic always
    // produced; the pre-migration mock only looked lossless because
    // it returned the identical in-memory object by reference,
    // skipping serialization entirely. Not a regression from this
    // migration -- a more faithful test of behavior that already
    // existed.
    expect(found!.decision).toEqual({
      ...record.decision,
      evaluatedAt: record.decision.evaluatedAt.toISOString(),
    });
    expect(found!.evaluatedIntent).toEqual(record.evaluatedIntent);
    expect(found!.bindingViolations).toEqual(record.bindingViolations);
    expect(found!.submittedBy).toBe("caller-1");
    expect(found!.refusalRecordHash).toBe("test-hash");
    // Same JSONB round-trip note as decision.evaluatedAt above.
    expect(found!.signature).toEqual({
      ...record.signature,
      signedAt: record.signature.signedAt.toISOString(),
    });
    expect(found!.createdAt).toEqual(record.createdAt);
  });

  it("round-trips a record with no bindingViolations (ordinary policy REJECT) as undefined, not null or []", async () => {
    const repository = new SupabaseRefusalRecordRepository(createFakePool());

    const record = { ...buildRefusalRecord("txn-2") };
    delete (record as { bindingViolations?: unknown }).bindingViolations;

    await repository.create(record);

    const found = await repository.findByTransactionId("txn-2");

    expect(found!.bindingViolations).toBeUndefined();
  });

  it("round-trips policyContentHash", async () => {
    const repository = new SupabaseRefusalRecordRepository(createFakePool());
    const record = {
      ...buildRefusalRecord("txn-4"),
      policyContentHash: "c".repeat(64),
    };

    await repository.create(record);

    const found = await repository.findByTransactionId("txn-4");
    expect(found!.policyContentHash).toBe("c".repeat(64));
  });

  it("reads a row written before policy_content_hash existed with no policyContentHash key", async () => {
    const repository = new SupabaseRefusalRecordRepository(createFakePool());

    await repository.create(buildRefusalRecord("txn-5"));

    const found = await repository.findByTransactionId("txn-5");
    expect(found).not.toHaveProperty("policyContentHash");
  });

  it("returns null for a transaction with no Refusal Record", async () => {
    const repository = new SupabaseRefusalRecordRepository(createFakePool());

    const found = await repository.findByTransactionId("txn-does-not-exist");

    expect(found).toBeNull();
  });

  it("propagates a storage error rather than swallowing it", async () => {
    const repository = new SupabaseRefusalRecordRepository(
      createFakePool({
        insertError: { code: "08006", message: "connection failure" },
      }),
    );

    await expect(
      repository.create(buildRefusalRecord("txn-3")),
    ).rejects.toMatchObject({ code: "08006" });
  });
});
