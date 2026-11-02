import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { InboundDecisionRecord } from "@parmana/shared";

import { SupabaseInboundDecisionRepository } from "../../src/supabase/SupabaseInboundDecisionRepository.js";

/**
 * Runs against a real Postgres database with the inbound_decisions migration applied. Each test
 * runs inside a transaction that is rolled back, so nothing is left in the database. Skipped when
 * DATABASE_URL is not set.
 */
const url = process.env.DATABASE_URL;

function record(
  overrides: Partial<InboundDecisionRecord> = {},
): InboundDecisionRecord {
  return {
    decisionId: `dec-${randomUUID()}`,
    outcome: "approved",
    partnerId: "partner-a",
    paymentId: "pay_TEST_ROLLBACK",
    limitInr: 1000,
    expiresAt: "2026-11-02T10:10:00.000Z",
    audience: "billing.example",
    signature: "c2lnbmF0dXJl",
    issuedAt: new Date("2026-11-02T10:00:00.000Z"),
    ...overrides,
  };
}

describe.skipIf(!url)(
  "SupabaseInboundDecisionRepository against Postgres",
  () => {
    let pool: pg.Pool;
    let client: pg.PoolClient;
    let repo: SupabaseInboundDecisionRepository;

    beforeEach(async () => {
      pool = new pg.Pool({ connectionString: url, max: 1 });
      client = await pool.connect();
      await client.query("BEGIN");
      repo = new SupabaseInboundDecisionRepository(
        client as unknown as pg.Pool,
      );
    });

    afterEach(async () => {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    });

    it("stores a decision and reads it back with every field", async () => {
      const input = record();
      await repo.append(input);

      const found = await repo.findById(input.decisionId);
      expect(found).not.toBeNull();
      expect(found?.outcome).toBe("approved");
      expect(found?.partnerId).toBe("partner-a");
      expect(found?.paymentId).toBe("pay_TEST_ROLLBACK");
      expect(found?.limitInr).toBe(1000);
      expect(found?.audience).toBe("billing.example");
      expect(found?.signature).toBe("c2lnbmF0dXJl");
      expect(found?.expiresAt).toBe("2026-11-02T10:10:00.000Z");
      expect(found?.issuedAt.getTime()).toBe(input.issuedAt.getTime());
      expect(found?.reason).toBeUndefined();
    });

    it("keeps a rejection and its reason", async () => {
      const input = record({
        outcome: "rejected",
        reason: "approval_required",
      });
      await repo.append(input);

      const found = await repo.findById(input.decisionId);
      expect(found?.outcome).toBe("rejected");
      expect(found?.reason).toBe("approval_required");
    });

    it("returns null for a decision that does not exist", async () => {
      expect(await repo.findById(`missing-${randomUUID()}`)).toBeNull();
    });

    it("refuses a second decision with the same ID, enforced by the database", async () => {
      const input = record();
      await repo.append(input);
      await expect(
        repo.append(
          record({ decisionId: input.decisionId, outcome: "rejected" }),
        ),
      ).rejects.toThrow();
    });

    it("refuses an outcome value other than approved or rejected", async () => {
      await expect(
        repo.append(record({ outcome: "maybe" as unknown as "approved" })),
      ).rejects.toThrow();
    });
  },
);
