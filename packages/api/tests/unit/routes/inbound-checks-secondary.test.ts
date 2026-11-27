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

const AUDIENCE = "erp.example";
const NOW = new Date("2026-11-02T10:00:00Z");
const CAPABILITY = "erp:release-goods";
const POLICY = { name: "erp-release-goods", version: "1.0.0" };

const ed25519 = generateKeyPairSync("ed25519");

function mlDsaSupported(): boolean {
  try {
    generateKeyPairSync("ml-dsa-65");
    return true;
  } catch {
    return false;
  }
}

const ML_DSA_SUPPORTED = mlDsaSupported();

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

function buildApp(options: {
  signSecondary?: (bytes: Buffer) => Promise<string>;
}) {
  const appended: Array<Record<string, unknown>> = [];
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
        sign(null, bytes, ed25519.privateKey).toString("base64"),
      ...(options.signSecondary
        ? { signSecondary: options.signSecondary }
        : {}),
      store: {
        append: async (record) => void appended.push(record),
      },
      now: () => NOW,
    }),
  );
  return { app, appended };
}

const body = {
  capability: CAPABILITY,
  target: "order-42",
  parameters: { amount: 80000 },
  signals: {},
  audience: AUDIENCE,
};

describe("POST /v1/inbound/checks: secondary ML-DSA-65 signature", () => {
  it("returns a secondary signature that verifies over the same canonical bytes", async () => {
    if (!ML_DSA_SUPPORTED) return;
    const mlDsa = generateKeyPairSync("ml-dsa-65");
    const { app, appended } = buildApp({
      signSecondary: async (bytes) =>
        sign(null, bytes, mlDsa.privateKey).toString("base64"),
    });

    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("approved");

    const { signature, secondarySignature, ...fields } = res.body;
    expect(typeof secondarySignature).toBe("string");

    const canonical = canonicalCheckBytes(fields as InboundCheckFields);
    expect(
      verify(
        null,
        canonical,
        ed25519.publicKey,
        Buffer.from(signature, "base64"),
      ),
    ).toBe(true);
    expect(
      verify(
        null,
        canonical,
        mlDsa.publicKey,
        Buffer.from(secondarySignature, "base64"),
      ),
    ).toBe(true);

    // The stored record carries the same secondary signature the caller received.
    expect(appended).toHaveLength(1);
    expect(appended[0]?.secondarySignature).toBe(secondarySignature);
  });

  it("issues no decision when the secondary signer fails", async () => {
    const { app, appended } = buildApp({
      signSecondary: async () => {
        throw new Error("ml-dsa signer unavailable");
      },
    });
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.outcome).toBeUndefined();
    expect(appended).toHaveLength(0);
  });

  it("leaves the response unchanged when no secondary signer is configured", async () => {
    const { app, appended } = buildApp({});
    const res = await request(app).post("/v1/inbound/checks").send(body);
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("secondarySignature");
    expect(appended[0]).not.toHaveProperty("secondarySignature");
  });
});
