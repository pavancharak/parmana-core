import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ApprovalAlreadyUsedError,
  type InboundCheckRecord,
} from "@parmana/shared";

import { SupabaseInboundCheckRepository } from "../../src/supabase/SupabaseInboundCheckRepository.js";

/**
 * G-143, O1, against a real Postgres database with the real migrations applied (scripts/apply-all-migrations.sql,
 * which creates inbound_decisions and consumed_approval_nonces in the public schema). Every row this test writes
 * carries a run tag and is deleted afterwards.
 *
 * Reads TEST_DATABASE_URL only, never DATABASE_URL. Skipped when TEST_DATABASE_URL is not set. Refuses to run if
 * TEST_DATABASE_URL is the same as DATABASE_URL.
 */
const url = process.env.TEST_DATABASE_URL?.trim();
if (url && url === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL equals DATABASE_URL. Point TEST_DATABASE_URL at a separate test database.",
  );
}

const suite = url ? describe : describe.skip;

suite(
  "SupabaseInboundCheckRepository.appendConsumingApprovals (G-143, O1)",
  () => {
    const run = randomUUID().replace(/-/g, "");
    let pool: pg.Pool;
    let repo: SupabaseInboundCheckRepository;

    beforeAll(() => {
      pool = new pg.Pool({ connectionString: url, max: 4 });
      repo = new SupabaseInboundCheckRepository(pool);
    });

    afterAll(async () => {
      if (!pool) return;
      await pool.query(
        "DELETE FROM inbound_decisions WHERE decision_id LIKE $1",
        [`it-${run}-%`],
      );
      await pool.query(
        "DELETE FROM consumed_approval_nonces WHERE nonce LIKE $1",
        [`it-${run}-%`],
      );
      await pool.end();
    });

    function id(label: string): string {
      return `it-${run}-${label}-${randomUUID()}`;
    }

    function record(decisionId: string): InboundCheckRecord {
      return {
        decisionId,
        outcome: "approved",
        partnerId: "partner-a",
        capability: "erp:release-goods",
        target: "order-42",
        amount: 800,
        policyName: "erp-release-goods",
        policyVersion: "1.0.0",
        expiresAt: "2026-11-02T10:10:00.000Z",
        audience: "erp.example",
        signature: "c2lnbmF0dXJl",
        issuedAt: new Date("2026-11-02T10:00:00.000Z"),
        approvedBy: "manager-pavan",
        approvedKeyId: "manager-pavan-key-1",
        approvalId: `appr-${decisionId}`,
        approvedAt: "2026-11-02T09:55:00.000Z",
      };
    }

    const LATER = "2026-11-02T10:10:00.000Z";

    async function consumedCount(nonce: string): Promise<number> {
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM consumed_approval_nonces WHERE nonce = $1",
        [nonce],
      );
      return rows[0].n as number;
    }

    it("records the decision and consumes its approval, and the approval fields round-trip", async () => {
      const decision = id("ok");
      const nonce = id("n");
      await repo.appendConsumingApprovals(record(decision), [
        { nonce, expiresAt: LATER },
      ]);

      const stored = await repo.findById(decision);
      expect(stored?.approvedBy).toBe("manager-pavan");
      expect(stored?.approvedKeyId).toBe("manager-pavan-key-1");
      expect(stored?.approvalId).toBe(`appr-${decision}`);
      expect(stored?.approvedAt).toBe("2026-11-02T09:55:00.000Z");
      expect(await consumedCount(nonce)).toBe(1);
    });

    it("refuses a second use of an approval, and records no decision for that second request", async () => {
      const nonce = id("n");
      const first = id("first");
      const second = id("second");
      await repo.appendConsumingApprovals(record(first), [
        { nonce, expiresAt: LATER },
      ]);

      await expect(
        repo.appendConsumingApprovals(record(second), [
          { nonce, expiresAt: LATER },
        ]),
      ).rejects.toBeInstanceOf(ApprovalAlreadyUsedError);

      expect(await repo.findById(second)).toBeNull();
      expect(await repo.findById(first)).not.toBeNull();
      expect(await consumedCount(nonce)).toBe(1);
    });

    it("consumes nothing when any approval in the batch was already used", async () => {
      const used = id("n-used");
      const fresh = id("n-fresh");
      await repo.appendConsumingApprovals(record(id("seed")), [
        { nonce: used, expiresAt: LATER },
      ]);

      const refused = id("refused");
      await expect(
        repo.appendConsumingApprovals(record(refused), [
          { nonce: fresh, expiresAt: LATER },
          { nonce: used, expiresAt: LATER },
        ]),
      ).rejects.toBeInstanceOf(ApprovalAlreadyUsedError);

      expect(await consumedCount(fresh)).toBe(0);
      expect(await repo.findById(refused)).toBeNull();
    });

    it("rolls back the consumption when the decision itself cannot be written", async () => {
      const decision = id("dup");
      await repo.append(record(decision));

      const nonce = id("n-rollback");
      // The same decision id again: the decision insert fails after the nonce was inserted.
      await expect(
        repo.appendConsumingApprovals(record(decision), [
          { nonce, expiresAt: LATER },
        ]),
      ).rejects.not.toBeInstanceOf(ApprovalAlreadyUsedError);

      expect(await consumedCount(nonce)).toBe(0);
      await expect(
        repo.appendConsumingApprovals(record(id("after")), [
          { nonce, expiresAt: LATER },
        ]),
      ).resolves.toBeUndefined();
    });
  },
);
