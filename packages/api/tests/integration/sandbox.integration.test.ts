import { generateKeyPairSync } from "node:crypto";

import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  ApprovalVerifier,
  StaticApprovalIssuerRegistry,
} from "@parmana/approval";
import { APPROVAL_ARTIFACT_CRYPTO_PROVIDER } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { SignedApproval } from "@parmana/shared";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import {
  SANDBOX_APPROVAL_TTL_SECONDS,
  SANDBOX_CAPABILITY,
} from "../../src/routes/sandbox-approvals.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * ADR-0014 at the HTTP boundary: CORS for listed origins only, and the
 * sandbox's demo approver, which exists only in sandbox mode and signs
 * an approval the server's own verifier accepts once.
 */

const VISITOR_KEY = "sandbox-visitor-raw-key-for-tests-only";
const DOCS = "https://docs.parmanasystems.com";

const demo = generateKeyPairSync("ed25519");
const DEMO_APPROVER = {
  approverId: "sandbox-demo-approver",
  keyId: "sandbox-demo-approver-key-1",
};

function buildApp(
  options: { sandbox?: boolean; corsOrigins?: readonly string[] } = {},
) {
  const { executionSystem } = createInspectableExecutionSystem();

  return createApp(createApplication(executionSystem), {
    callerAuth: {
      authenticator: new StaticKeyAuthenticator([
        {
          callerId: "sandbox-visitor",
          keyHash: hashApiKey(VISITOR_KEY),
          allowedCapabilities: [SANDBOX_CAPABILITY],
        },
      ]),
      auditSink: new InMemoryCallerAuditSink(),
    },
    ...(options.corsOrigins !== undefined
      ? { corsOrigins: options.corsOrigins }
      : {}),
    ...(options.sandbox === true
      ? { sandboxApprover: { ...DEMO_APPROVER, privateKey: demo.privateKey } }
      : {}),
  });
}

function sandboxVerifier() {
  return new ApprovalVerifier({
    crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
    issuerRegistry: new StaticApprovalIssuerRegistry([
      { ...DEMO_APPROVER, publicKey: demo.publicKey, revoked: false },
    ]),
    nonceStore: new MemoryNonceStore(),
  });
}

describe("CORS (PARMANA_CORS_ORIGINS)", () => {
  it("answers a preflight from a listed origin before authentication", async () => {
    const response = await request(buildApp({ corsOrigins: [DOCS] }))
      .options("/execute")
      .set("Origin", DOCS)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(DOCS);
    expect(response.headers["access-control-allow-headers"]).toBe(
      "Authorization, Content-Type",
    );
    expect(response.headers["access-control-allow-methods"]).toBe(
      "GET, POST, OPTIONS",
    );
  });

  it("names the listed origin on a real request, never *", async () => {
    const response = await request(buildApp({ corsOrigins: [DOCS] }))
      .get("/callers/me")
      .set("Origin", DOCS)
      .set("Authorization", `Bearer ${VISITOR_KEY}`);

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(DOCS);
    expect(response.headers.vary).toMatch(/Origin/);
  });

  it("still requires the key on a real request from a listed origin", async () => {
    const response = await request(buildApp({ corsOrigins: [DOCS] }))
      .get("/callers/me")
      .set("Origin", DOCS);

    expect(response.status).toBe(401);
  });

  it("refuses a preflight from another origin, with no CORS header", async () => {
    const response = await request(buildApp({ corsOrigins: [DOCS] }))
      .options("/execute")
      .set("Origin", "https://attacker.example")
      .set("Access-Control-Request-Method", "POST");

    expect(response.status).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends no CORS header to another origin on a real request", async () => {
    const response = await request(buildApp({ corsOrigins: [DOCS] }))
      .get("/health")
      .set("Origin", "https://attacker.example");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends no CORS header at all when no origin is configured", async () => {
    const response = await request(buildApp())
      .get("/health")
      .set("Origin", DOCS);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("POST /sandbox/approvals (PARMANA_SANDBOX=true)", () => {
  it("does not exist outside sandbox mode", async () => {
    const response = await request(buildApp())
      .post("/sandbox/approvals")
      .set("Authorization", `Bearer ${VISITOR_KEY}`)
      .send({ capability: SANDBOX_CAPABILITY, resourceId: "demo-1" });

    expect(response.status).toBe(404);
  });

  it("requires the key", async () => {
    const response = await request(buildApp({ sandbox: true }))
      .post("/sandbox/approvals")
      .send({ capability: SANDBOX_CAPABILITY, resourceId: "demo-1" });

    expect(response.status).toBe(401);
  });

  it.each(["paytm:refund", "github:pr-merge", undefined])(
    "refuses to sign for capability %s",
    async (capability) => {
      const response = await request(buildApp({ sandbox: true }))
        .post("/sandbox/approvals")
        .set("Authorization", `Bearer ${VISITOR_KEY}`)
        .send({ capability, resourceId: "demo-1" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVALID_SANDBOX_APPROVAL_REQUEST");
    },
  );

  it.each([undefined, "", "x".repeat(201), 42])(
    "refuses resourceId %s",
    async (resourceId) => {
      const response = await request(buildApp({ sandbox: true }))
        .post("/sandbox/approvals")
        .set("Authorization", `Bearer ${VISITOR_KEY}`)
        .send({ capability: SANDBOX_CAPABILITY, resourceId });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVALID_SANDBOX_APPROVAL_REQUEST");
    },
  );

  it("signs an approval the server's verifier accepts once, for that resource only", async () => {
    const response = await request(buildApp({ sandbox: true }))
      .post("/sandbox/approvals")
      .set("Authorization", `Bearer ${VISITOR_KEY}`)
      .send({ capability: SANDBOX_CAPABILITY, resourceId: "demo-1" });

    expect(response.status).toBe(201);

    const approval = response.body as SignedApproval;

    expect(approval.payload).toMatchObject({
      issuer: DEMO_APPROVER,
      capability: SANDBOX_CAPABILITY,
      resourceId: "demo-1",
      scope: { field: "resourceId", comparator: "eq", value: "demo-1" },
    });
    expect(
      Date.parse(approval.payload.expiresAt) -
        Date.parse(approval.payload.issuedAt),
    ).toBe(SANDBOX_APPROVAL_TTL_SECONDS * 1000);

    const verifier = sandboxVerifier();
    const forDemo = {
      action: SANDBOX_CAPABILITY,
      resourceId: "demo-1",
      requestedValue: "demo-1",
    };

    const otherResource = await verifier.verify(approval, {
      ...forDemo,
      resourceId: "demo-2",
      requestedValue: "demo-2",
      consumeNonce: false,
    });
    expect(otherResource.valid).toBe(false);
    expect(otherResource.checks.resourceMatches).toBe(false);

    const first = await verifier.verify(approval, forDemo);
    expect(first.valid, JSON.stringify(first.checks)).toBe(true);

    const reused = await verifier.verify(approval, forDemo);
    expect(reused.valid).toBe(false);
    expect(reused.checks.nonceUnseen).toBe(false);
  });

  it("is refused by a verifier that does not trust the demo approver", async () => {
    const response = await request(buildApp({ sandbox: true }))
      .post("/sandbox/approvals")
      .set("Authorization", `Bearer ${VISITOR_KEY}`)
      .send({ capability: SANDBOX_CAPABILITY, resourceId: "demo-1" });

    const production = new ApprovalVerifier({
      crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
      issuerRegistry: new StaticApprovalIssuerRegistry([]),
      nonceStore: new MemoryNonceStore(),
    });

    const result = await production.verify(response.body as SignedApproval, {
      action: SANDBOX_CAPABILITY,
      resourceId: "demo-1",
      requestedValue: "demo-1",
    });

    expect(result.valid).toBe(false);
    expect(result.checks.issuerKnown).toBe(false);
  });
});
