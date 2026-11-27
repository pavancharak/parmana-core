import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createInboundCheckRouter } from "../../../src/routes/inbound-checks.js";

const NOW = new Date("2026-11-02T10:00:00Z");
const FUTURE = "2026-11-02T10:10:00Z";
const PAST = "2026-11-02T09:50:00Z";

interface Stored {
  decisionId: string;
  partnerId: string;
  outcome: "approved" | "rejected";
  expiresAt: string;
}

function buildApp(decisions: Stored[], callerId: string | null = "partner-a") {
  const redeemed = new Set<string>();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (callerId !== null) req.callerId = callerId;
    next();
  });
  app.use(
    "/v1/inbound/checks",
    createInboundCheckRouter({
      audience: "erp.example",
      findGrant: async () => null,
      policyInEffect: async () => undefined,
      decide: async () => ({ approved: false }),
      sign: async () => "sig",
      store: { append: async () => undefined },
      now: () => NOW,
      findCheck: async (id) =>
        decisions.find((d) => d.decisionId === id) ?? null,
      redeem: async (id) => {
        if (redeemed.has(id)) return false;
        redeemed.add(id);
        return true;
      },
    }),
  );
  return app;
}

const approved: Stored = {
  decisionId: "chk-1",
  partnerId: "partner-a",
  outcome: "approved",
  expiresAt: FUTURE,
};

describe("POST /v1/inbound/checks/:decisionId/redeem", () => {
  it("redeems an approved, unexpired decision once", async () => {
    const app = buildApp([approved]);
    const first = await request(app).post("/v1/inbound/checks/chk-1/redeem");
    expect(first.status).toBe(200);
    expect(first.body.decisionId).toBe("chk-1");
  });

  it("refuses a second redemption of the same decision", async () => {
    const app = buildApp([approved]);
    await request(app).post("/v1/inbound/checks/chk-1/redeem");
    const second = await request(app).post("/v1/inbound/checks/chk-1/redeem");
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("already_redeemed");
  });

  it("refuses a decision issued to another partner", async () => {
    const app = buildApp([approved], "partner-b");
    const res = await request(app).post("/v1/inbound/checks/chk-1/redeem");
    expect(res.status).toBe(403);
  });

  it("refuses a rejected decision", async () => {
    const app = buildApp([{ ...approved, outcome: "rejected" }]);
    const res = await request(app).post("/v1/inbound/checks/chk-1/redeem");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("decision_not_approved");
  });

  it("refuses an expired decision", async () => {
    const app = buildApp([{ ...approved, expiresAt: PAST }]);
    const res = await request(app).post("/v1/inbound/checks/chk-1/redeem");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("decision_expired");
  });

  it("returns 404 for an unknown decision", async () => {
    const app = buildApp([]);
    const res = await request(app).post(
      "/v1/inbound/checks/chk-missing/redeem",
    );
    expect(res.status).toBe(404);
  });

  it("requires a partner identity", async () => {
    const app = buildApp([approved], null);
    const res = await request(app).post("/v1/inbound/checks/chk-1/redeem");
    expect(res.status).toBe(401);
  });
});
