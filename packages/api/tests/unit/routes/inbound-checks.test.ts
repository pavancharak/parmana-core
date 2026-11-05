import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import {
  canonicalCheckBytes,
  createInboundCheckRouter,
  type InboundCheckFields,
  type InboundPolicyLookup,
} from "../../../src/routes/inbound-checks.js";
import type { AuthorityGrant } from "@parmana/shared";

const parmana = generateKeyPairSync("ed25519");
const AUDIENCE = "erp.example";
const NOW = new Date("2026-11-02T10:00:00Z");
const CAPABILITY = "erp:release-goods";
const POLICY = { name: "erp-release-goods", version: "1.0.0" };

const IN_EFFECT: InboundPolicyLookup = { kind: "in-effect", policy: POLICY };

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

interface Seen {
  readonly decideRequests: unknown[];
}

function buildApp(options: {
  callerId?: string;
  grant?: AuthorityGrant | null;
  policy?: InboundPolicyLookup | undefined;
  decision?: { approved: boolean; reason?: string };
}) {
  const appended: unknown[] = [];
  const seen: Seen = { decideRequests: [] };
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
      policyInEffect: async () =>
        "policy" in options ? options.policy : IN_EFFECT,
      decide: async (decideRequest) => {
        seen.decideRequests.push(decideRequest);
        return options.decision ?? { approved: true };
      },
      sign: async (bytes) =>
        sign(null, bytes, parmana.privateKey).toString("base64"),
      store: { append: async (record) => void appended.push(record) },
      now: () => NOW,
    }),
  );
  return { app, appended, seen };
}

const body = {
  capability: CAPABILITY,
  target: "order-42",
  parameters: { amountInr: 800 },
  signals: { orderStatus: "CONFIRMED" },
  audience: AUDIENCE,
};

describe("POST /v1/inbound/checks", () => {
  it("approves when the policy approves and the request is within the grant's limit", async () => {
    const { app, appended } = buildApp({ callerId: "partner-a" });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("approved");
    expect(res.body.capability).toBe(CAPABILITY);
    expect(res.body.target).toBe("order-42");
    expect(res.body.amount).toBe(800);
    expect(res.body.policyName).toBe(POLICY.name);
    expect(res.body.policyVersion).toBe(POLICY.version);
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

  it("rejects when the policy rejects, even within the limit, and records the policy", async () => {
    const { app, appended } = buildApp({
      callerId: "partner-a",
      decision: { approved: false, reason: "order is not confirmed" },
    });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("rejected");
    expect(res.body.reason).toBe("order is not confirmed");
    expect(res.body.policyName).toBe(POLICY.name);
    expect(appended).toHaveLength(1);
  });

  it("rejects with approval_required above the grant's limit, even when the policy approves", async () => {
    const { app } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/checks")
      .send({ ...body, parameters: { amountInr: 5000 } });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("rejected");
    expect(res.body.reason).toBe("approval_required");
  });

  it("gives the policy the partner as submitter, the declared signals, and no authority", async () => {
    const { app, seen } = buildApp({ callerId: "partner-a" });
    await request(app).post("/v1/inbound/checks").send(body);
    expect(seen.decideRequests).toHaveLength(1);
    const sent = seen.decideRequests[0] as Record<string, unknown>;
    expect(sent.signals).toEqual({ orderStatus: "CONFIRMED" });
    expect(sent.policy).toEqual(POLICY);
    expect((sent.metadata as Record<string, unknown>).submittedBy).toBe(
      "partner-a",
    );
    expect(sent).not.toHaveProperty("authority");
    expect(sent).not.toHaveProperty("authorization");
  });

  it("approves any request the policy approves when the grant sets no limits", async () => {
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

  it("refuses a capability with no bound policy, so grant limits alone never approve", async () => {
    const { app, appended, seen } = buildApp({
      callerId: "partner-a",
      policy: undefined,
    });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("no_policy_bound");
    expect(seen.decideRequests).toHaveLength(0);
    expect(appended).toHaveLength(0);
  });

  it("refuses a capability whose policy cannot be determined, with the reason", async () => {
    const { app, appended } = buildApp({
      callerId: "partner-a",
      policy: { kind: "unavailable", reason: "no approved version" },
    });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("policy_unavailable");
    expect(res.body.reason).toBe("no approved version");
    expect(appended).toHaveLength(0);
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

  it("refuses a grant with a limit that has no maximum", async () => {
    const { app } = buildApp({
      callerId: "partner-a",
      grant: grant({
        limits: { "parameters.amountInr": {} as { max: number } },
      }),
    });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("grant_limit_incomplete");
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

  it("refuses declared signals that are not an object", async () => {
    const { app } = buildApp({ callerId: "partner-a" });
    const res = await request(app)
      .post("/v1/inbound/checks")
      .send({ ...body, signals: "CONFIRMED" });
    expect(res.status).toBe(400);
  });
});
