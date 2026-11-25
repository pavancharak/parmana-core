import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { generateKeyPairSync, sign } from "node:crypto";
import { createInboundCheckRouter } from "../../../src/routes/inbound-checks.js";
import type { AuthorityGrant } from "@parmana/shared";

const AUDIENCE = "erp.example";
const CAPABILITY = "payments:refund";
const POLICY = { name: "refund", version: "1.0.0" };
const parmana = generateKeyPairSync("ed25519");

const grant: AuthorityGrant = {
  grantId: "grant-1",
  callerId: "partner-a",
  capability: CAPABILITY,
  limits: { "parameters.amount": { max: 100000 } },
  validFrom: new Date("2026-11-01T00:00:00Z"),
  validUntil: new Date("2026-12-31T00:00:00Z"),
  status: "active",
  grantedAt: new Date("2026-11-01T00:00:00Z"),
};

// A policy that approves only when the facts it receives say so.
type Decide = (signals: Record<string, unknown>) => {
  approved: boolean;
  reason?: string;
};

function buildApp(decide: Decide) {
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
      decide: async (req) => decide(req.signals as Record<string, unknown>),
      sign: async (bytes) =>
        sign(null, bytes, parmana.privateKey).toString("base64"),
      store: { append: async () => undefined },
      now: () => new Date("2026-11-02T10:00:00Z"),
    }),
  );
  return app;
}

const send = (app: express.Express, body: Record<string, unknown>) =>
  request(app)
    .post("/v1/inbound/checks")
    .send({
      capability: CAPABILITY,
      target: "pay_ABC123",
      parameters: { amount: 800 },
      audience: AUDIENCE,
      ...body,
    });

// Policy approves only when the order is declared CONFIRMED.
const approvesOnDeclaredFact: Decide = (signals) =>
  signals.orderStatus === "CONFIRMED"
    ? { approved: true }
    : { approved: false, reason: "order not confirmed" };

// Policy approves on its own (for example, a fact a trusted source supplies), regardless of declared facts.
const approvesWithoutFacts: Decide = () => ({ approved: true });

describe("inbound check: declared facts may refuse, never approve", () => {
  it("refuses an approval that rests only on a fact the partner declared", async () => {
    const res = await send(buildApp(approvesOnDeclaredFact), {
      signals: { orderStatus: "CONFIRMED" },
    });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("rejected");
    expect(res.body.reason).toBe("requires_trusted_facts");
    expect(res.body).not.toHaveProperty("secondarySignature");
  });

  it("still refuses when the partner's declared fact refuses", async () => {
    const res = await send(buildApp(approvesOnDeclaredFact), {
      signals: { orderStatus: "CANCELLED" },
    });
    expect(res.body.outcome).toBe("rejected");
  });

  it("approves when the policy approves without the declared facts", async () => {
    const res = await send(buildApp(approvesWithoutFacts), {
      signals: { orderStatus: "CONFIRMED" },
    });
    expect(res.body.outcome).toBe("approved");
  });

  it("approves a request that declares no facts when the policy approves", async () => {
    const res = await send(buildApp(approvesWithoutFacts), {});
    expect(res.body.outcome).toBe("approved");
  });
});

describe("inbound check: whole-number amounts", () => {
  it("refuses a fractional amount", async () => {
    const res = await send(buildApp(approvesWithoutFacts), {
      parameters: { amount: 0.5 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("parameters.amount must be a whole number");
  });
});
