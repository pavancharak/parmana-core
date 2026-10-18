import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";

import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * HTTP-level proof that a principal-binding violation (an authenticated
 * caller asserting an authority.principalId it isn't permitted to assert)
 * is now durably audited, closing the evidence-completeness gap found
 * during a broader gap audit: isPrincipalAllowed's rejection previously
 * wrote no record of any kind -- only the routine caller.authenticated
 * event that fires at the middleware layer before this check even runs --
 * while the structurally adjacent isCapabilityAllowed rejection, a few
 * lines below it in the same route file, already wrote a signed
 * caller.capability_denied record. Both checks were always correctly
 * fail-closed (both return 403, no bypass ever existed); this closes the
 * audit-trail asymmetry between them, not a security hole.
 *
 * Mirrors caller-capability-scoping.integration.test.ts's own shape and
 * conventions exactly, one layer over: caller.principal_denied instead of
 * caller.capability_denied, allowedPrincipalIds instead of
 * allowedCapabilities.
 */
describe("Caller principal scoping (HTTP boundary)", () => {
  const SCOPED_KEY = "principal-scoping-scoped-caller-raw-key-for-tests-only";
  const UNSCOPED_KEY =
    "principal-scoping-unscoped-caller-raw-key-for-tests-only";

  function buildApp() {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "scoped-caller",
        keyHash: hashApiKey(SCOPED_KEY),
        // Only permitted to assert its own identity as principal.
        allowedPrincipalIds: ["scoped-caller"],
        allowedCapabilities: ["test:fixture-execute"],
      },
      {
        callerId: "unscoped-caller",
        keyHash: hashApiKey(UNSCOPED_KEY),
        // Permitted to assert only "someone-else", never its own identity
        // and never "scoped-caller" -- deliberately outside both, so
        // asserting its own callerId as principal is ALSO a violation.
        allowedPrincipalIds: ["someone-else"],
        allowedCapabilities: ["test:fixture-execute"],
      },
    ]);

    const callerAuditSink = new InMemoryCallerAuditSink();

    const app = createApp(application, {
      callerAuth: { authenticator, auditSink: callerAuditSink },
    });

    return { app, callerAuditSink };
  }

  async function withPrincipal(principalId: string) {
    const transaction = await createBusinessTransaction();
    return {
      ...transaction,
      authority: { ...transaction.authority, principalId },
    };
  }

  describe("POST /execute", () => {
    it("allows a caller asserting a principal it's explicitly scoped to", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${SCOPED_KEY}`)
        .send(await withPrincipal("scoped-caller"));

      expect(response.status).toBe(200);
    });

    it("blocks a caller asserting a principal outside its allowedPrincipalIds, before policy evaluation ever runs", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${UNSCOPED_KEY}`)
        .send(await withPrincipal("unscoped-caller"));

      expect(response.status).toBe(403);
      expect(response.body.error).toBe(
        "Caller is not permitted to assert this authority.principalId.",
      );
    });

    it("records a caller.principal_denied audit event with the asserted principalId and callerId, never the raw key", async () => {
      const { app, callerAuditSink } = buildApp();

      await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${UNSCOPED_KEY}`)
        .send(await withPrincipal("unscoped-caller"));

      const denied = callerAuditSink.events.find(
        (event) => event.type === "caller.principal_denied",
      );

      expect(denied).toMatchObject({
        type: "caller.principal_denied",
        callerId: "unscoped-caller",
        principalId: "unscoped-caller",
        reason: "principal not allowed",
      });

      const serialized = JSON.stringify(callerAuditSink.events);
      expect(serialized).not.toContain(UNSCOPED_KEY);
    });

    it("does not record a caller.principal_denied event on the allowed path", async () => {
      const { app, callerAuditSink } = buildApp();

      await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${SCOPED_KEY}`)
        .send(await withPrincipal("scoped-caller"));

      expect(
        callerAuditSink.events.some(
          (event) => event.type === "caller.principal_denied",
        ),
      ).toBe(false);
    });
  });

  describe("POST /transactions", () => {
    it("allows a caller asserting a principal it's explicitly scoped to", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post("/transactions")
        .set("Authorization", `Bearer ${SCOPED_KEY}`)
        .send(await withPrincipal("scoped-caller"));

      expect(response.status).toBe(201);
    });

    it("blocks a caller asserting a principal outside its allowedPrincipalIds, and records it", async () => {
      const { app, callerAuditSink } = buildApp();

      const response = await request(app)
        .post("/transactions")
        .set("Authorization", `Bearer ${UNSCOPED_KEY}`)
        .send(await withPrincipal("unscoped-caller"));

      expect(response.status).toBe(403);

      const denied = callerAuditSink.events.find(
        (event) => event.type === "caller.principal_denied",
      );

      expect(denied).toMatchObject({
        type: "caller.principal_denied",
        callerId: "unscoped-caller",
        principalId: "unscoped-caller",
        reason: "principal not allowed",
      });
    });
  });
});
