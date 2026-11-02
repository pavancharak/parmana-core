import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { generateKeyPairSync, sign, verify } from "node:crypto";

import {
  canonicalDecisionBytes,
  createInboundDecisionRouter,
  type InboundDecisionFields,
} from "../../../src/routes/inbound-decisions.js";
import type { AuthorityGrant } from "@parmana/shared";

const parmana = generateKeyPairSync("ed25519");
const AUDIENCE = "billing.example";

const NOW = new Date("2026-11-02T10:00:00Z");

function grant(
  overrides: Partial<AuthorityGrant> & { max?: number } = {},
): AuthorityGrant {
  const { max = 1000, ...rest } = overrides;
  return {
    grantId: "grant-1",
    callerId: "partner-a",
    capability: "inbound:refund",
    limits: { "parameters.amountInr": { max } },
    validFrom: new Date("2026-11-01T00:00:00Z"),
    validUntil: new Date("2026-12-31T00:00:00Z"),
    status: "active",
    grantedAt: new Date("2026-11-01T00:00:00Z"),
    ...rest,
  };
}

function buildApp(options: {
  callerId?: string;
  grant?: AuthorityGrant | null;
  appended?: unknown[];
}) {
  const appended = options.appended ?? [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (options.callerId !== undefined) req.callerId = options.callerId;
    next();
  });
  app.use(
    "/v1/inbound/decisions",
    createInboundDecisionRouter({
      audience: AUDIENCE,
      findGrant: async () =>
        options.grant === undefined ? grant() : options.grant,
      sign: async (bytes) =>
        sign(null, bytes, parmana.privateKey).toString("base64"),
      store: { append: async (record) => void appended.push(record) },
      now: () => NOW,
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

  it("refuses a partner whose grant has been revoked", async () => {
    const { app, appended } = buildApp({
      callerId: "partner-a",
      grant: grant({ status: "revoked" }),
    });
    const res = await request(app).post("/v1/inbound/decisions").send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("no_active_grant");
    expect(appended).toHaveLength(0);
  });

  it("refuses a partner whose grant has expired", async () => {
    const { app } = buildApp({
      callerId: "partner-a",
      grant: grant({ validUntil: new Date("2026-11-01T23:00:00Z") }),
    });
    const res = await request(app).post("/v1/inbound/decisions").send(body);
    expect(res.status).toBe(403);
  });

  it("refuses a partner with no grant at all", async () => {
    const { app } = buildApp({ callerId: "partner-a", grant: null });
    const res = await request(app).post("/v1/inbound/decisions").send(body);
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
