import { randomUUID, generateKeyPairSync, sign, verify } from "node:crypto";
import express from "express";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InboundCheckRecord } from "@parmana/shared";
import { SupabaseInboundCheckRepository } from "@parmana/storage";

import {
  canonicalCheckBytes,
  createInboundCheckRouter,
  type InboundApprovalUse,
  type InboundCheckFields,
} from "../../src/routes/inbound-checks.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * G-143 over HTTP. Sends a request to POST /v1/inbound/checks through the real route, with the sandbox Postgres
 * repository behind it, and checks the decision row, the consumed approval, the signature, and the single-use refusal.
 *
 * The decision function and the grant are fixed, so the test is about the record and the approval, not the policy.
 * Every row carries a run tag, and is deleted afterwards. Runs only when TEST_DATABASE_URL is set and the opt-in is
 * on (resolveDatabaseGate); the target is validated by vitest.setup.ts.
 */

const suite = resolveDatabaseGate("inbound check over HTTP (G-143)")
  ? describe
  : describe.skip;

const run = randomUUID().replace(/-/g, "");
const PARTNER = `partner-it-${run}`;
const NONCE = `nonce-it-${run}`;
const AUDIENCE = "erp.example";
const CAPABILITY = `erp:release-goods-it-${run}`;
const NOW = new Date();
const parmana = generateKeyPairSync("ed25519");

const APPROVAL: InboundApprovalUse = {
  approvalId: `appr-it-${run}`,
  approverId: "manager-it",
  keyId: "manager-it-key-1",
  issuedAt: new Date(NOW.getTime() - 60_000).toISOString(),
  nonce: NONCE,
  expiresAt: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
};

const body = {
  capability: CAPABILITY,
  target: `order-it-${run}`,
  parameters: { amountInr: 800 },
  signals: { orderStatus: "CONFIRMED" },
  audience: AUDIENCE,
};

suite(
  "POST /v1/inbound/checks over HTTP, with the sandbox repository (G-143)",
  () => {
    let pool: pg.Pool;
    let app: express.Express;

    beforeAll(() => {
      pool = new pg.Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        max: 2,
      });
      const repo = new SupabaseInboundCheckRepository(pool);
      app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.callerId = PARTNER;
        next();
      });
      app.use(
        "/v1/inbound/checks",
        createInboundCheckRouter({
          audience: AUDIENCE,
          findGrant: async () => ({
            grantId: `grant-it-${run}`,
            callerId: PARTNER,
            capability: CAPABILITY,
            limits: { "parameters.amountInr": { max: 1000 } },
            validFrom: new Date(NOW.getTime() - 86_400_000),
            validUntil: new Date(NOW.getTime() + 86_400_000),
            status: "active",
            grantedAt: new Date(NOW.getTime() - 86_400_000),
          }),
          policyInEffect: async () => ({
            kind: "in-effect",
            policy: { name: "erp-release-goods", version: "1.0.0" },
          }),
          // The decision is fixed: approved, on the one approval above.
          decide: async () => ({ approved: true, approvals: [APPROVAL] }),
          sign: async (bytes) =>
            sign(null, bytes, parmana.privateKey).toString("base64"),
          store: {
            append: (record) =>
              repo.append({
                ...(record as InboundCheckFields),
                issuedAt: new Date(),
              } as InboundCheckRecord),
            appendConsumingApprovals: (record, approvals) =>
              repo.appendConsumingApprovals(
                {
                  ...(record as InboundCheckFields),
                  issuedAt: new Date(),
                } as InboundCheckRecord,
                approvals.map((approval) => ({
                  nonce: approval.nonce,
                  expiresAt: approval.expiresAt,
                })),
              ),
          },
          now: () => NOW,
        }),
      );
    });

    afterAll(async () => {
      await pool.query("DELETE FROM inbound_decisions WHERE partner_id = $1", [
        PARTNER,
      ]);
      await pool.query(
        "DELETE FROM consumed_approval_nonces WHERE nonce = $1",
        [NONCE],
      );
      await pool.end();
    });

    it("records an approved decision with the four approval fields, consumes the approval, and signs the record", async () => {
      const res = await request(app).post("/v1/inbound/checks").send(body);

      expect(res.status).toBe(201);
      expect(res.body.outcome).toBe("approved");
      expect(res.body.approvedBy).toBe("manager-it");
      expect(res.body.approvalId).toBe(APPROVAL.approvalId);
      expect(res.body.approvedKeyId).toBe(APPROVAL.keyId);

      const { signature, ...fields } = res.body as Record<string, unknown> & {
        signature: string;
      };
      expect(
        verify(
          null,
          canonicalCheckBytes(fields as unknown as InboundCheckFields),
          parmana.publicKey,
          Buffer.from(signature, "base64"),
        ),
      ).toBe(true);

      const decision = await pool.query(
        "SELECT outcome, approved_by, approval_id, approved_key_id, approved_at FROM inbound_decisions WHERE decision_id = $1",
        [res.body.decisionId],
      );
      expect(decision.rows).toHaveLength(1);
      expect(decision.rows[0]).toMatchObject({
        outcome: "approved",
        approved_by: "manager-it",
        approval_id: APPROVAL.approvalId,
        approved_key_id: "manager-it-key-1",
      });

      const consumed = await pool.query(
        "SELECT nonce FROM consumed_approval_nonces WHERE nonce = $1",
        [NONCE],
      );
      expect(consumed.rows).toHaveLength(1);
    });

    it("refuses a second use of the same approval, records no decision for it, and consumes nothing more", async () => {
      const before = await pool.query(
        "SELECT count(*)::int AS n FROM inbound_decisions WHERE partner_id = $1",
        [PARTNER],
      );

      const res = await request(app).post("/v1/inbound/checks").send(body);

      expect(res.status).toBe(201);
      expect(res.body.outcome).toBe("rejected");
      expect(res.body.reason).toBe("approval_already_used");
      expect(res.body).not.toHaveProperty("approvedBy");

      const after = await pool.query(
        "SELECT count(*)::int AS n FROM inbound_decisions WHERE partner_id = $1",
        [PARTNER],
      );
      // The refused request is recorded as refused. What must not happen is a second approved record.
      const approvedRows = await pool.query(
        "SELECT count(*)::int AS n FROM inbound_decisions WHERE partner_id = $1 AND outcome = 'approved'",
        [PARTNER],
      );
      expect(approvedRows.rows[0].n).toBe(1);
      expect(after.rows[0].n).toBe(before.rows[0].n + 1);

      const consumed = await pool.query(
        "SELECT count(*)::int AS n FROM consumed_approval_nonces WHERE nonce = $1",
        [NONCE],
      );
      expect(consumed.rows[0].n).toBe(1);
    });
  },
);
