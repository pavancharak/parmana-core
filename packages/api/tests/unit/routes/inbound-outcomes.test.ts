import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";

import {
  createInboundOutcomeRouter,
  type InboundOutcomeRecord,
} from "../../../src/routes/inbound-outcomes.js";

const DECISION = {
  decisionId: "dec-1",
  partnerId: "partner-a",
  paymentId: "pay_ABC123",
  limitInr: 1000,
};

function buildApp(
  options: { callerId?: string; decision?: typeof DECISION | null } = {},
) {
  const stored: InboundOutcomeRecord[] = [];
  const seen = new Set<string>();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (options.callerId !== undefined) req.callerId = options.callerId;
    next();
  });
  app.use(
    "/v1/inbound/outcomes",
    createInboundOutcomeRouter({
      findDecision: async () =>
        options.decision === undefined ? DECISION : options.decision,
      store: {
        append: async (record) => {
          if (seen.has(record.decisionId)) return false;
          seen.add(record.decisionId);
          stored.push(record);
          return true;
        },
      },
      now: () => new Date("2026-11-02T10:00:00Z"),
    }),
  );
  return { app, stored };
}

const body = {
  decisionId: "dec-1",
  orderId: "4412",
  paymentId: "pay_ABC123",
  amountInr: 800,
  status: "refunded",
  refundId: "rfnd_1",
};

describe("POST /v1/inbound/outcomes", () => {
  it("records a refunded outcome for the partner's own decision", async () => {
    const { app, stored } = buildApp({ callerId: "partner-a" });
    const res = await request(app).post("/v1/inbound/outcomes").send(body);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("refunded");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.refundId).toBe("rfnd_1");
  });

  it("records a refused or error outcome without a refund ID", async () => {
    const { app } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/outcomes")
      .send({ ...body, status: "error", refundId: undefined });
    expect(res.status).toBe(201);
  });

  it("refuses an unauthenticated caller", async () => {
    const { app } = buildApp({});
    const res = await request(app).post("/v1/inbound/outcomes").send(body);
    expect(res.status).toBe(401);
  });

  it("refuses an outcome for a decision that does not exist", async () => {
    const { app, stored } = buildApp({ callerId: "partner-a", decision: null });
    const res = await request(app).post("/v1/inbound/outcomes").send(body);
    expect(res.status).toBe(404);
    expect(stored).toHaveLength(0);
  });

  it("refuses an outcome for another partner's decision", async () => {
    const { app, stored } = buildApp({ callerId: "partner-b" });
    const res = await request(app).post("/v1/inbound/outcomes").send(body);
    expect(res.status).toBe(403);
    expect(stored).toHaveLength(0);
  });

  it("refuses a payment ID that differs from the decision's", async () => {
    const { app } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/outcomes")
      .send({ ...body, paymentId: "pay_OTHER" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("payment_mismatch");
  });

  it("refuses an amount above the decision's limit", async () => {
    const { app } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/outcomes")
      .send({ ...body, amountInr: 5000 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("amount_exceeds_limit");
  });

  it("refuses a refunded outcome with no refund ID", async () => {
    const { app } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/outcomes")
      .send({ ...body, refundId: undefined });
    expect(res.status).toBe(400);
  });

  it("refuses a second outcome for the same decision", async () => {
    const { app } = buildApp({ callerId: "partner-a" });
    await request(app).post("/v1/inbound/outcomes").send(body);
    const again = await request(app).post("/v1/inbound/outcomes").send(body);
    expect(again.status).toBe(409);
  });
});
