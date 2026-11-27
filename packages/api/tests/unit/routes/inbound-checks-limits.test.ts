import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { generateKeyPairSync, sign } from "node:crypto";
import { createInboundCheckRouter } from "../../../src/routes/inbound-checks.js";
import type { AuthorityGrant } from "@parmana/shared";

const AUDIENCE = "erp.example";
const NOW = new Date("2026-11-02T10:00:00Z");
const CAPABILITY = "payments:refund";
const POLICY = { name: "refund", version: "1.0.0" };
const parmana = generateKeyPairSync("ed25519");

function grantWith(limit: { min?: number; max: number }): AuthorityGrant {
  return {
    grantId: "grant-1",
    callerId: "partner-a",
    capability: CAPABILITY,
    limits: { "parameters.amount": limit },
    validFrom: new Date("2026-11-01T00:00:00Z"),
    validUntil: new Date("2026-12-31T00:00:00Z"),
    status: "active",
    grantedAt: new Date("2026-11-01T00:00:00Z"),
  };
}

function buildApp(grant: AuthorityGrant) {
  const appended: unknown[] = [];
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
      findGrant: async () => grant,
      policyInEffect: async () => ({ kind: "in-effect", policy: POLICY }),
      decide: async () => ({ approved: true }),
      sign: async (bytes) =>
        sign(null, bytes, parmana.privateKey).toString("base64"),
      store: { append: async (record) => void appended.push(record) },
      now: () => NOW,
    }),
  );
  return { app, appended };
}

const send = (app: express.Express, amount: unknown) =>
  request(app).post("/v1/inbound/checks").send({
    capability: CAPABILITY,
    target: "pay_ABC123",
    parameters: { amount },
    audience: AUDIENCE,
  });

describe("inbound check: amount limits", () => {
  it("refuses a negative amount, even when it is under the maximum", async () => {
    const { app, appended } = buildApp(grantWith({ max: 100000 }));
    const res = await send(app, -500000);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("parameters.amount must be greater than zero");
    expect(appended).toHaveLength(0);
  });

  it("refuses zero", async () => {
    const { app, appended } = buildApp(grantWith({ max: 100000 }));
    const res = await send(app, 0);
    expect(res.status).toBe(400);
    expect(appended).toHaveLength(0);
  });

  it("rejects an amount below the grant's minimum, and records the reason", async () => {
    const { app, appended } = buildApp(grantWith({ min: 100, max: 100000 }));
    const res = await send(app, 50);
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("rejected");
    expect(res.body.reason).toBe("below_limit_minimum");
    expect(appended).toHaveLength(1);
  });

  it("still approves a positive amount within the minimum and maximum", async () => {
    const { app } = buildApp(grantWith({ min: 100, max: 100000 }));
    const res = await send(app, 800);
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("approved");
  });

  it("still rejects above the maximum with approval_required", async () => {
    const { app } = buildApp(grantWith({ max: 1000 }));
    const res = await send(app, 5000);
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("rejected");
    expect(res.body.reason).toBe("approval_required");
  });
});
