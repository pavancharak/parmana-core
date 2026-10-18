import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  VerificationCrypto,
  verifyExecutionTrustRecordOffline,
} from "@parmana/crypto";
import type { ExecutionTrustRecord } from "@parmana/shared";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";

/**
 * HTTP-level proof of the public-key discovery endpoints (PQC audit
 * RED-2, docs/VERIFICATION-GAPS.md): GET /keys/:keyId and GET
 * /.well-known/jwks.json, deliberately unauthenticated (same category
 * as /refusal/verify and /audit/verify), and their combination with
 * the offline verifier (RED-1) -- fetching a key over HTTP and
 * verifying a fetched record with zero further network calls.
 */
describe("Public-key discovery (HTTP boundary)", () => {
  function buildApp() {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);

    return createApp(application, {
      callerAuth: "disabled",
    });
  }

  it("GET /keys/default returns the real default public key as PEM", async () => {
    const app = buildApp();

    const response = await request(app).get("/keys/default");

    expect(response.status).toBe(200);
    expect(response.body.keyId).toBe("default");
    expect(response.body.algorithm).toBe("ed25519");
    expect(response.body.pem).toContain("-----BEGIN PUBLIC KEY-----");
  });

  it("GET /keys/:keyId returns 404 for an unknown keyId", async () => {
    const app = buildApp();

    const response = await request(app).get("/keys/does-not-exist");

    expect(response.status).toBe(404);
  });

  it("GET /.well-known/jwks.json lists every available key, including 'default'", async () => {
    const app = buildApp();

    const response = await request(app).get("/.well-known/jwks.json");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.keys)).toBe(true);

    const keyIds = response.body.keys.map(
      (entry: { keyId: string }) => entry.keyId,
    );
    expect(keyIds).toContain("default");
  });

  it("does not require caller authentication", async () => {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);

    // Caller-auth genuinely enabled (not "disabled") to prove this
    // route is reachable with no credential even when caller-auth
    // middleware is mounted for every other route -- same proof
    // audit-verify.integration.test.ts makes for POST /audit/verify.
    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "caller-a",
        keyHash: hashApiKey("some-other-caller-raw-key"),
        allowedCapabilities: ["test:fixture-execute"],
      },
    ]);

    const app = createApp(application, {
      callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
    });

    const response = await request(app).get("/keys/default");

    expect(response.status).not.toBe(401);
  });

  it("a key fetched over HTTP verifies a real Trust Record fully offline (RED-1 + RED-2 combined)", async () => {
    const app = buildApp();

    const keyResponse = await request(app).get("/keys/default");
    expect(keyResponse.status).toBe(200);

    const crypto = new VerificationCrypto();

    const draft = {
      trustRecordId: "keys-endpoint-integration",
      businessTransactionId: "keys-endpoint-integration",
      transaction: {
        businessTransactionId: "keys-endpoint-integration",
        status: "RECEIVED",
        createdAt: new Date(),
      },
      overrides: [],
      executions: [],
      verifications: [],
      receipts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ExecutionTrustRecord;

    const trustRecordHash = await crypto.hash(draft);

    const withHash = {
      ...draft,
      trustRecordHash,
      signature: {
        algorithm: "ed25519" as const,
        keyId: "default",
        value: "",
        signedAt: new Date(),
      },
    } as ExecutionTrustRecord;

    const signature = await crypto.sign(withHash);
    const record: ExecutionTrustRecord = { ...withHash, signature };

    const result = await verifyExecutionTrustRecordOffline(record, {
      default: keyResponse.body.pem,
    });

    expect(result.valid).toBe(true);
  });
});
