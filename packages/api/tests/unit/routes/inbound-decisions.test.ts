import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { generateKeyPairSync, sign, verify } from "node:crypto";

import {
  canonicalDecisionBytes,
  createInboundDecisionRouter,
  type InboundDecisionFields,
} from "../../../src/routes/inbound-decisions.js";

const parmana = generateKeyPairSync("ed25519");
const AUDIENCE = "billing.example";

function buildApp(options: {
  callerId?: string;
  capabilities?: string[];
  limitInr?: number;
  appended?: unknown[];
}) {
  const appended = options.appended ?? [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (options.callerId !== undefined) req.callerId = options.callerId;
    req.callerAllowedCapabilities = options.capabilities ?? ["inbound.refund"];
    next();
  });
  app.use(
    "/v1/inbound/decisions",
    createInboundDecisionRouter({
      audience: AUDIENCE,
      limitFor: () => options.limitInr ?? 1000,
      sign: async (bytes) =>
        sign(null, bytes, parmana.privateKey).toString("base64"),
      store: { append: async (record) => void appended.push(record) },
      now: () => new Date("2026-11-02T10:00:00Z"),
    }),
  );
  return { app, appended };
}

const body = { paymentId: "pay_ABC123", amountInr: 800, audience: AUDIENCE };

describe("POST /v1/inbound/decisions", () => {
  it("approves a refund within the partner's limit and signs it", async () => {
    const { app, appended } = buildApp({ callerId: "partner-a" });
    const res = await request(app).post("/v1/inbound/decisions").send(body);

    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("approved");
    expect(res.body.partnerId).toBe("partner-a");
    expect(res.body.paymentId).toBe("pay_ABC123");
    const { signature, ...fields } = res.body;
    expect(
      verify(
        null,
        canonicalDecisionBytes(fields as InboundDecisionFields),
        parmana.publicKey,
        Buffer.from(signature, "base64"),
      ),
    ).toBe(true);
    expect(appended).toHaveLength(1);
  });

  it("rejects above the limit with reason approval_required, and still records it", async () => {
    const { app, appended } = buildApp({
      callerId: "partner-a",
      limitInr: 1000,
    });
    const res = await request(app)
      .post("/v1/inbound/decisions")
      .send({ ...body, amountInr: 1500 });

    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("rejected");
    expect(res.body.reason).toBe("approval_required");
    expect(appended).toHaveLength(1);
  });

  it("refuses an unauthenticated caller", async () => {
    const { app } = buildApp({});
    const res = await request(app).post("/v1/inbound/decisions").send(body);
    expect(res.status).toBe(401);
  });

  it("refuses a caller without the inbound refund capability", async () => {
    const { app, appended } = buildApp({
      callerId: "partner-a",
      capabilities: ["other"],
    });
    const res = await request(app).post("/v1/inbound/decisions").send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("capability_not_granted");
    expect(appended).toHaveLength(0);
  });

  it("refuses a partner with no active grant", async () => {
    const app2 = express();
    app2.use(express.json());
    app2.use((req, _res, next) => {
      req.callerId = "partner-b";
      req.callerAllowedCapabilities = ["inbound.refund"];
      next();
    });
    app2.use(
      "/v1/inbound/decisions",
      createInboundDecisionRouter({
        audience: AUDIENCE,
        limitFor: () => undefined,
        sign: async () => "x",
        store: { append: async () => {} },
      }),
    );
    const res = await request(app2).post("/v1/inbound/decisions").send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("no_active_grant");
  });

  it("refuses an amount that is not a whole rupee", async () => {
    const { app, appended } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/decisions")
      .send({ ...body, amountInr: 10.5 });
    expect(res.status).toBe(400);
    expect(appended).toHaveLength(0);
  });

  it("refuses a request for another audience", async () => {
    const { app } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/decisions")
      .send({ ...body, audience: "other.example" });
    expect(res.status).toBe(400);
  });
});
