import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  InboundDecisionRecord,
  InboundOutcomeRecord,
} from "@parmana/shared";

import { PostgresInboundDecisionRepository } from "../../src/postgres/PostgresInboundDecisionRepository.js";
import { PostgresInboundOutcomeRepository } from "../../src/postgres/PostgresInboundOutcomeRepository.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Runs against a real Postgres database with the inbound migrations applied. Every test runs inside
 * a transaction that is rolled back. Reads TEST_DATABASE_URL only; skipped when it is unset. The
 * target is validated by vitest.setup.ts before this file runs.
 */
const url = process.env.TEST_DATABASE_URL?.trim();

function decision(decisionId: string): InboundDecisionRecord {
  return {
    decisionId,
    outcome: "approved",
    partnerId: "partner-a",
    paymentId: "pay_TEST_ROLLBACK",
    limitInr: 1000,
    expiresAt: "2026-11-02T10:10:00.000Z",
    audience: "billing.example",
    signature: "c2ln",
    issuedAt: new Date("2026-11-02T10:00:00.000Z"),
  };
}

function outcome(
  decisionId: string,
  overrides: Partial<InboundOutcomeRecord> = {},
): InboundOutcomeRecord {
  return {
    decisionId,
    partnerId: "partner-a",
    orderId: "4412",
    paymentId: "pay_TEST_ROLLBACK",
    amountInr: 800,
    status: "refunded",
    refundId: "rfnd_TEST",
    recordedAt: new Date("2026-11-02T10:01:00.000Z"),
    ...overrides,
  };
}

describe.skipIf(!resolveDatabaseGate("inbound outcome repository"))(
  "PostgresInboundOutcomeRepository against Postgres",
  () => {
    let pool: pg.Pool;
    let client: pg.PoolClient;
    let outcomes: PostgresInboundOutcomeRepository;
    let decisions: PostgresInboundDecisionRepository;

    beforeEach(async () => {
      pool = new pg.Pool({ connectionString: url, max: 1 });
      client = await pool.connect();
      await client.query("BEGIN");
      const asPool = client as unknown as pg.Pool;
      outcomes = new PostgresInboundOutcomeRepository(asPool);
      decisions = new PostgresInboundDecisionRepository(asPool);
    });

    afterEach(async () => {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    });

    it("stores an outcome and reads it back", async () => {
      const id = `dec-${randomUUID()}`;
      await decisions.append(decision(id));
      expect(await outcomes.append(outcome(id))).toBe(true);

      const found = await outcomes.findByDecisionId(id);
      expect(found?.status).toBe("refunded");
      expect(found?.refundId).toBe("rfnd_TEST");
      expect(found?.amountInr).toBe(800);
      expect(found?.recordedAt.getTime()).toBe(
        new Date("2026-11-02T10:01:00.000Z").getTime(),
      );
      expect(found?.reason).toBeUndefined();
    });

    it("keeps a refused outcome with its reason and no refund ID", async () => {
      const id = `dec-${randomUUID()}`;
      await decisions.append(decision(id));
      await outcomes.append(
        outcome(id, {
          status: "refused",
          refundId: undefined,
          reason: "payment_mismatch",
        }),
      );

      const found = await outcomes.findByDecisionId(id);
      expect(found?.status).toBe("refused");
      expect(found?.reason).toBe("payment_mismatch");
      expect(found?.refundId).toBeUndefined();
    });

    it("returns false for a second outcome on the same decision, and keeps the first", async () => {
      const id = `dec-${randomUUID()}`;
      await decisions.append(decision(id));
      expect(await outcomes.append(outcome(id))).toBe(true);
      expect(
        await outcomes.append(
          outcome(id, { status: "error", refundId: undefined }),
        ),
      ).toBe(false);
      expect((await outcomes.findByDecisionId(id))?.status).toBe("refunded");
    });

    it("refuses an outcome for a decision that does not exist", async () => {
      await expect(
        outcomes.append(outcome(`missing-${randomUUID()}`)),
      ).rejects.toThrow();
    });

    it("returns null for a decision with no outcome", async () => {
      expect(
        await outcomes.findByDecisionId(`none-${randomUUID()}`),
      ).toBeNull();
    });
  },
);
