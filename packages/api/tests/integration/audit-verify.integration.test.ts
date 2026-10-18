import request from "supertest";
import { describe, expect, it } from "vitest";

import { AuditEventCrypto } from "@parmana/crypto";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";

import type { CallerAuditEvent } from "../../src/auth/CallerAuditSink.js";

/**
 * HTTP-level proof of the audit-sink signing milestone: a signed
 * caller_audit_events row is independently third-party verifiable via
 * POST /audit/verify, the same unauthenticated pattern
 * refusal-record.integration.test.ts already proves for POST /refusal/verify.
 */
describe("Audit event signature verification (HTTP boundary)", () => {
  function buildApp() {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);

    return createApp(application, {
      callerAuth: "disabled",
    });
  }

  const CALLER_EVENT: CallerAuditEvent = {
    type: "caller.rejected",
    occurredAt: "2026-01-01T00:00:00.000Z",
    route: "/execute",
    reason: "missing credential",
  };

  it("reports a genuinely signed caller audit event as valid", async () => {
    const app = buildApp();
    const crypto = new AuditEventCrypto();

    const signature = await crypto.sign(CALLER_EVENT);

    const response = await request(app)
      .post("/audit/verify")
      .send({ event: CALLER_EVENT, signature });

    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(true);
  });

  it("reports a tampered audit event as invalid, not as a crash", async () => {
    const app = buildApp();
    const crypto = new AuditEventCrypto();

    const signature = await crypto.sign(CALLER_EVENT);

    // Simulates an operator (or attacker with database access) editing
    // the persisted row directly after it was signed.
    const tamperedEvent: CallerAuditEvent = {
      ...CALLER_EVENT,
      reason: "actually this was fine, trust me",
    };

    const response = await request(app)
      .post("/audit/verify")
      .send({ event: tamperedEvent, signature });

    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(false);
  });

  it("rejects a structurally malformed verify request with 400, not a 500", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/audit/verify")
      .send({ notAnAuditEvent: true });

    expect(response.status).toBe(400);
  });

  it("requires no caller authentication at all, even when caller-auth is enabled for every other route", async () => {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "caller-a",
        keyHash: hashApiKey("audit-verify-scoping-caller-a-raw-key"),
        allowedPrincipalIds: ["integration-test"],
      },
    ]);

    const app = createApp(application, {
      callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
    });

    const crypto = new AuditEventCrypto();
    const signature = await crypto.sign(CALLER_EVENT);

    // No Authorization header at all -- this is the whole point of the route.
    const response = await request(app)
      .post("/audit/verify")
      .send({ event: CALLER_EVENT, signature });

    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(true);
  });
});
