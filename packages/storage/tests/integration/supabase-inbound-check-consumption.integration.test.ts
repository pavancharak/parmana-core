import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ApprovalAlreadyUsedError,
  type InboundCheckRecord,
} from "@parmana/shared";

import { SupabaseInboundCheckRepository } from "../../src/supabase/SupabaseInboundCheckRepository.js";

/**
 * G-143, O1, against a real Postgres database: the decision record and the consumption of its approvals are
 * written in one transaction. Each run uses its own schema, which is dropped afterwards, so no table in any
 * other schema is touched.
 *
 * Reads TEST_DATABASE_URL only, never DATABASE_URL. Skipped when TEST_DATABASE_URL is not set. Refuses to run
 * if TEST_DATABASE_URL is the same as DATABASE_URL.
 *
 * The two tables are created here with the columns the repository writes. Keep them in step with
 * supabase/migrations (extend_inbound_decisions, add_inbound_approval_identity, and the approval nonce table).
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
    const schema = `inbound_it_${randomUUID().replace(/-/g, "")}`;
    let pool: pg.Pool;
    let repo: SupabaseInboundCheckRepository;

    beforeAll(async () => {
      // Every connection in this pool uses the test schema, so the repository's unqualified table names resolve there.
      pool = new pg.Pool({
        connectionString: url,
        options: `-c search_path=${schema}`,
        max: 4,
      });
      await pool.query(`CREATE SCHEMA ${schema}`);
      await pool.query(`
      CREATE TABLE ${schema}.inbound_decisions (
        decision_id TEXT PRIMARY KEY,
        outcome TEXT NOT NULL,
        reason TEXT,
        partner_id TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        audience TEXT NOT NULL,
        signature TEXT NOT NULL,
        issued_at TIMESTAMPTZ NOT NULL,
        capability TEXT,
        target TEXT,
        amount NUMERIC,
        policy_name TEXT,
        policy_version TEXT,
        approved_by TEXT,
        approved_key_id TEXT,
        approval_id TEXT,
        approved_at TIMESTAMPTZ,
        check_status TEXT
      )`);
      await pool.query(`
      CREATE TABLE ${schema}.consumed_approval_nonces (
        nonce TEXT PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL
      )`);
      repo = new SupabaseInboundCheckRepository(pool);
    });

    afterAll(async () => {
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await pool.end();
      }
    });

    function record(
      decisionId: string,
      overrides: Partial<InboundCheckRecord> = {},
    ): InboundCheckRecord {
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
        ...overrides,
      };
    }

    const LATER = "2026-11-02T10:10:00.000Z";

    async function consumedCount(nonce: string): Promise<number> {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM ${schema}.consumed_approval_nonces WHERE nonce = $1`,
        [nonce],
      );
      return rows[0].n as number;
    }

    it("records the decision and consumes its approval, and the approval fields round-trip", async () => {
      const id = `chk-${randomUUID()}`;
      const nonce = `n-${randomUUID()}`;
      await repo.appendConsumingApprovals(record(id), [
        { nonce, expiresAt: LATER },
      ]);

      const stored = await repo.findById(id);
      expect(stored?.approvedBy).toBe("manager-pavan");
      expect(stored?.approvedKeyId).toBe("manager-pavan-key-1");
      expect(stored?.approvalId).toBe(`appr-${id}`);
      expect(stored?.approvedAt).toBe("2026-11-02T09:55:00.000Z");
      expect(await consumedCount(nonce)).toBe(1);
    });

    it("refuses a second use of an approval, and records no decision for that second request", async () => {
      const nonce = `n-${randomUUID()}`;
      const first = `chk-${randomUUID()}`;
      const second = `chk-${randomUUID()}`;
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
      const used = `n-${randomUUID()}`;
      const fresh = `n-${randomUUID()}`;
      await repo.appendConsumingApprovals(record(`chk-${randomUUID()}`), [
        { nonce: used, expiresAt: LATER },
      ]);

      const refused = `chk-${randomUUID()}`;
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
      const id = `chk-${randomUUID()}`;
      await repo.append(record(id));

      const nonce = `n-${randomUUID()}`;
      // The same decision id again: the decision insert fails, after the approval's nonce was inserted.
      await expect(
        repo.appendConsumingApprovals(record(id), [
          { nonce, expiresAt: LATER },
        ]),
      ).rejects.not.toBeInstanceOf(ApprovalAlreadyUsedError);

      // The nonce was rolled back, so the approval is still usable.
      expect(await consumedCount(nonce)).toBe(0);
      await expect(
        repo.appendConsumingApprovals(record(`chk-${randomUUID()}`), [
          { nonce, expiresAt: LATER },
        ]),
      ).resolves.toBeUndefined();
    });
  },
);
