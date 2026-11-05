import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import {
  canonicalCheckBytes,
  createInboundCheckRouter,
  type InboundCheckFields,
} from "../../../src/routes/inbound-checks.js";
import type { AuthorityGrant } from "@parmana/shared";

const parmana = generateKeyPairSync("ed25519");
const AUDIENCE = "erp.example";
const NOW = new Date("2026-11-02T10:00:00Z");
const CAPABILITY = "erp:release-goods";

function grant(
  overrides: Partial<AuthorityGrant> & { max?: number | null } = {},
): AuthorityGrant {
  const { max = 1000, ...rest } = overrides;
  return {
    grantId: "grant-1",
    callerId: "partner-a",
    capability: CAPABILITY,
    limits: max === null ? undefined : { "parameters.amountInr": { max } },
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
}) {
  const appended: unknown[] = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (options.callerId !== undefined) req.callerId = options.callerId;
    next();
  });
  app.use(
    "/v1/inbound/checks",
    createInboundCheckRouter({
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

const body = {
  capability: CAPABILITY,
  target: "order-42",
  parameters: { amountInr: 800 },
  audience: AUDIENCE,
};

describe("POST /v1/inbound/checks", () => {
  it("approves a request within the grant's limit and signs it", async () => {
    const { app, appended } = buildApp({ callerId: "partner-a" });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("approved");
    expect(res.body.capability).toBe(CAPABILITY);
    expect(res.body.target).toBe("order-42");
    expect(res.body.amount).toBe(800);
    expect(appended).toHaveLength(1);

    const { signature, ...fields } = res.body;
    const ok = verify(
      null,
      canonicalCheckBytes(fields as InboundCheckFields),
      parmana.publicKey,
      Buffer.from(signature, "base64"),
    );
    expect(ok).toBe(true);
  });

  it("rejects above the limit with reason approval_required, and records it", async () => {
    const { app, appended } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/checks")
      .send({ ...body, parameters: { amountInr: 5000 } });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("rejected");
    expect(res.body.reason).toBe("approval_required");
    expect(appended).toHaveLength(1);
  });

  it("approves any request when the grant sets no limits", async () => {
    const { app } = buildApp({
      callerId: "partner-a",
      grant: grant({ max: null }),
    });
    const res = await request(app)
      .post("/v1/inbound/checks")
      .send({ capability: CAPABILITY, target: "x", audience: AUDIENCE });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("approved");
    expect(res.body.amount).toBeUndefined();
  });

  it("refuses an unauthenticated caller", async () => {
    const { app } = buildApp({});
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(401);
  });

  it("refuses a caller with no grant for the capability", async () => {
    const { app, appended } = buildApp({ callerId: "partner-a", grant: null });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("no_active_grant");
    expect(appended).toHaveLength(0);
  });

  it("refuses a revoked grant", async () => {
    const { app } = buildApp({
      callerId: "partner-a",
      grant: grant({ status: "revoked" }),
    });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(403);
  });

  it("refuses an expired grant", async () => {
    const { app } = buildApp({
      callerId: "partner-a",
      grant: grant({ validUntil: new Date("2026-11-01T23:00:00Z") }),
    });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(403);
  });

  it("refuses a limited request that omits the value the limit checks", async () => {
    const { app, appended } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/checks")
      .send({ capability: CAPABILITY, target: "order-42", audience: AUDIENCE });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("parameters.amountInr must be a number");
    expect(appended).toHaveLength(0);
  });

  it("refuses a capability that is not namespace:verb", async () => {
    const { app } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/checks")
      .send({ ...body, capability: "Refund Now" });
    expect(res.status).toBe(400);
  });

  it("refuses a request for another audience", async () => {
    const { app } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/checks")
      .send({ ...body, audience: "other.example" });
    expect(res.status).toBe(400);
  });
});
