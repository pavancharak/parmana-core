import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import {
  canonicalCheckBytes,
  createInboundCheckRouter,
  type InboundApprovalUse,
  type InboundCheckFields,
} from "../../../src/routes/inbound-checks.js";
import type { AuthorityGrant } from "@parmana/shared";

/** G-143: the approval that decided an inbound check is recorded, and signed with it. */

const parmana = generateKeyPairSync("ed25519");
const AUDIENCE = "erp.example";
const NOW = new Date("2026-11-02T10:00:00Z");
const CAPABILITY = "erp:release-goods";
const POLICY = { name: "erp-release-goods", version: "1.0.0" };

const GRANT: AuthorityGrant = {
  grantId: "grant-1",
  callerId: "partner-a",
  capability: CAPABILITY,
  limits: { "parameters.amountInr": { max: 1000 } },
  validFrom: new Date("2026-11-01T00:00:00Z"),
  validUntil: new Date("2026-12-31T00:00:00Z"),
  status: "active",
  grantedAt: new Date("2026-11-01T00:00:00Z"),
};

const APPROVAL: InboundApprovalUse = {
  approvalId: "appr-7",
  approverId: "manager-pavan",
  keyId: "manager-pavan-key-1",
  issuedAt: "2026-11-02T09:55:00.000Z",
};

function buildApp(decision: {
  approved: boolean;
  reason?: string;
  approvals?: readonly InboundApprovalUse[];
}) {
  const appended: InboundCheckFields[] = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.callerId = "partner-a";
    next();
  });
  app.use(
    "/v1/inbound/checks",
    createInboundCheckRouter({
      audience: AUDIENCE,
      findGrant: async () => GRANT,
      policyInEffect: async () => ({ kind: "in-effect", policy: POLICY }),
      decide: async () => decision,
      sign: async (bytes) =>
        sign(null, bytes, parmana.privateKey).toString("base64"),
      store: {
        append: async (record) =>
          void appended.push(record as InboundCheckFields),
      },
      now: () => NOW,
    }),
  );
  return { app, appended };
}

const body = {
  capability: CAPABILITY,
  target: "order-42",
  parameters: { amountInr: 800 },
  signals: { orderStatus: "CONFIRMED" },
  audience: AUDIENCE,
};

function signatureVerifies(res: { body: Record<string, unknown> }): boolean {
  const { signature, ...fields } = res.body as Record<string, unknown> & {
    signature: string;
  };
  return verify(
    null,
    canonicalCheckBytes(fields as unknown as InboundCheckFields),
    parmana.publicKey,
    Buffer.from(signature, "base64"),
  );
}

describe("inbound check: the approval that decided it (G-143)", () => {
  it("records the approver, key, approval and time when one verified approval decided an approved request, and signs them", async () => {
    const { app, appended } = buildApp({
      approved: true,
      approvals: [APPROVAL],
    });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("approved");
    expect(res.body.approvedBy).toBe("manager-pavan");
    expect(res.body.approvedKeyId).toBe("manager-pavan-key-1");
    expect(res.body.approvalId).toBe("appr-7");
    expect(res.body.approvedAt).toBe("2026-11-02T09:55:00.000Z");
    expect(appended[0]?.approvedBy).toBe("manager-pavan");
    expect(signatureVerifies(res)).toBe(true);
  });

  it("changing an approval field after signing breaks the signature", async () => {
    const { app } = buildApp({ approved: true, approvals: [APPROVAL] });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    const tampered = { ...res.body, approvedBy: "someone-else" };
    expect(signatureVerifies({ body: tampered })).toBe(false);
  });

  it("writes no approval fields when the request was approved with no approval", async () => {
    const { app } = buildApp({ approved: true });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.body.outcome).toBe("approved");
    for (const key of [
      "approvedBy",
      "approvedKeyId",
      "approvalId",
      "approvedAt",
    ]) {
      expect(res.body).not.toHaveProperty(key);
    }
    expect(signatureVerifies(res)).toBe(true);
  });

  it("writes no approval fields when the request was rejected, even if an approval was used", async () => {
    const { app } = buildApp({
      approved: false,
      reason: "policy_rejected",
      approvals: [APPROVAL],
    });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.body.outcome).toBe("rejected");
    expect(res.body).not.toHaveProperty("approvedBy");
  });

  it("writes no approval fields when several approvals decided one request (open decision O3)", async () => {
    const second = {
      ...APPROVAL,
      approvalId: "appr-8",
      approverId: "manager-two",
    };
    const { app } = buildApp({ approved: true, approvals: [APPROVAL, second] });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.body.outcome).toBe("approved");
    expect(res.body).not.toHaveProperty("approvedBy");
  });

  it("ignores an approver the partner declares in the request body", async () => {
    const { app } = buildApp({ approved: true });
    const res = await request(app)
      .post("/v1/inbound/checks")
      .send({ ...body, approvedBy: "manager-pavan", approvalId: "appr-x" });
    expect(res.body).not.toHaveProperty("approvedBy");
    expect(res.body).not.toHaveProperty("approvalId");
  });
});
