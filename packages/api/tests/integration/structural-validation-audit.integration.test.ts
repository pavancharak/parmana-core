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
 * HTTP-level proof that structural/admission-time rejections -- a
 * malformed or oversized request body, an invalid businessTransactionId,
 * a structurally invalid Business Transaction, and a duplicate
 * businessTransactionId -- are now durably audited (G-29,
 * docs/VERIFICATION-GAPS.md), closing the gap found during a broader
 * gap audit: unlike a policy REJECT (RefusalRecord, RFC-0021) or a
 * caller-identity denial (caller.capability_denied /
 * caller.principal_denied, already audited), these four rejection
 * points previously produced no durable record of any kind. Every
 * assertion here about HTTP status is a *regression* check -- the
 * correct status was already being returned before G-29; the new
 * behavior under test is the audit record.
 *
 * Mirrors caller-principal-scoping.integration.test.ts's shape and
 * conventions.
 */
describe("Structural validation audit trail (G-29, HTTP boundary)", () => {
  const VALID_KEY = "structural-audit-valid-caller-raw-key-for-tests-only";

  function buildApp() {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "integration-test",
        keyHash: hashApiKey(VALID_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
      },
    ]);

    const callerAuditSink = new InMemoryCallerAuditSink();

    const app = createApp(application, {
      callerAuth: { authenticator, auditSink: callerAuditSink },
    });

    return { app, callerAuditSink };
  }

  function structuralEvents(callerAuditSink: InMemoryCallerAuditSink) {
    return callerAuditSink.events.filter(
      (event) => event.type === "caller.structural_rejected",
    );
  }

  describe("malformed businessTransactionId (post-auth, UUID-format check)", () => {
    it("POST /execute: rejects with 400 and audits the invalid value, with the authenticated callerId", async () => {
      const { app, callerAuditSink } = buildApp();

      const transaction = await createBusinessTransaction();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${VALID_KEY}`)
        .send({ ...transaction, businessTransactionId: "not-a-uuid" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "businessTransactionId must be a valid UUID.",
      );

      const [event] = structuralEvents(callerAuditSink);
      expect(event).toMatchObject({
        type: "caller.structural_rejected",
        callerId: "integration-test",
        businessTransactionId: "not-a-uuid",
        reason: "businessTransactionId must be a valid UUID.",
      });
    });

    it("POST /transactions: rejects with 400 and audits the same way", async () => {
      const { app, callerAuditSink } = buildApp();

      const transaction = await createBusinessTransaction();

      const response = await request(app)
        .post("/transactions")
        .set("Authorization", `Bearer ${VALID_KEY}`)
        .send({ ...transaction, businessTransactionId: "not-a-uuid" });

      expect(response.status).toBe(400);

      const [event] = structuralEvents(callerAuditSink);
      expect(event).toMatchObject({
        type: "caller.structural_rejected",
        callerId: "integration-test",
        businessTransactionId: "not-a-uuid",
      });
    });

    it("does not record businessTransactionId on the event when the field wasn't even a string", async () => {
      const { app, callerAuditSink } = buildApp();

      const transaction = await createBusinessTransaction();

      await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${VALID_KEY}`)
        .send({ ...transaction, businessTransactionId: 12345 });

      const [event] = structuralEvents(callerAuditSink);
      expect(event?.businessTransactionId).toBeUndefined();
    });

    it("does not record a structural_rejected event on the valid path", async () => {
      const { app, callerAuditSink } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${VALID_KEY}`)
        .send(await createBusinessTransaction());

      expect(response.status).toBe(200);
      expect(structuralEvents(callerAuditSink)).toHaveLength(0);
    });
  });

  describe("structurally invalid Business Transaction (post-auth, inside application.execute())", () => {
    it("POST /execute: a mismatched metadata.businessTransactionId is rejected 400 and audited with the reason and the declared id", async () => {
      const { app, callerAuditSink } = buildApp();

      const transaction = await createBusinessTransaction();
      const mismatched = {
        ...transaction,
        metadata: {
          ...transaction.metadata,
          businessTransactionId: crypto.randomUUID(),
        },
      };

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${VALID_KEY}`)
        .send(mismatched);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "metadata.businessTransactionId must match businessTransactionId.",
      );

      const [event] = structuralEvents(callerAuditSink);
      expect(event).toMatchObject({
        type: "caller.structural_rejected",
        callerId: "integration-test",
        businessTransactionId: transaction.businessTransactionId,
        reason:
          "metadata.businessTransactionId must match businessTransactionId.",
      });
    });
  });

  describe("duplicate businessTransactionId (post-auth, inside application.execute())", () => {
    it("POST /execute: the second submission is rejected 409 and audited; the first, accepted submission is not", async () => {
      const { app, callerAuditSink } = buildApp();

      const transaction = await createBusinessTransaction();

      const first = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${VALID_KEY}`)
        .send(transaction);

      expect(first.status).toBe(200);
      expect(structuralEvents(callerAuditSink)).toHaveLength(0);

      const second = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${VALID_KEY}`)
        .send(transaction);

      expect(second.status).toBe(409);

      const [event] = structuralEvents(callerAuditSink);
      expect(event).toMatchObject({
        type: "caller.structural_rejected",
        callerId: "integration-test",
        businessTransactionId: transaction.businessTransactionId,
        reason: `Business Transaction '${transaction.businessTransactionId}' already exists.`,
      });
    });
  });

  describe("malformed / oversized request body (pre-auth, express.json() itself)", () => {
    it("malformed JSON: rejects with 400 and audits with no callerId (caller-auth never ran)", async () => {
      const { app, callerAuditSink } = buildApp();

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${VALID_KEY}`)
        .set("Content-Type", "application/json")
        .send("{not valid json");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Malformed JSON body.");

      const [event] = structuralEvents(callerAuditSink);
      expect(event).toMatchObject({
        type: "caller.structural_rejected",
        reason: "malformed JSON body",
      });
      expect(event?.callerId).toBeUndefined();
      expect(event?.businessTransactionId).toBeUndefined();
    });

    it("oversized body: rejects with 413 and audits with no callerId", async () => {
      const { app, callerAuditSink } = buildApp();

      const oversized = JSON.stringify({
        ...(await createBusinessTransaction()),
        padding: "x".repeat(200 * 1024),
      });

      const response = await request(app)
        .post("/execute")
        .set("Authorization", `Bearer ${VALID_KEY}`)
        .set("Content-Type", "application/json")
        .send(oversized);

      expect(response.status).toBe(413);
      expect(response.body.error).toBe("Payload too large.");

      const [event] = structuralEvents(callerAuditSink);
      expect(event).toMatchObject({
        type: "caller.structural_rejected",
        reason: "payload too large",
      });
      expect(event?.callerId).toBeUndefined();
    });

    it("malformed JSON is not audited at all when caller-auth is disabled (no auditSink to write to)", async () => {
      const { executionSystem } = createInspectableExecutionSystem();
      const application = createApplication(executionSystem);
      const app = createApp(application, { callerAuth: "disabled" });

      const response = await request(app)
        .post("/execute")
        .set("Content-Type", "application/json")
        .send("{not valid json");

      // Same, correct 400 either way -- no auditSink is available to
      // write to when caller-auth itself is disabled, and this path is
      // deliberately fail-open (see error-handler.ts's own comment), so
      // there is nothing to assert on the audit side here beyond "the
      // app doesn't crash without one."
      expect(response.status).toBe(400);
    });
  });

  describe("no request body at all", () => {
    // Express 5 leaves req.body undefined when a request has no body
    // (Express 4 set it to {}); a bare destructure of req.body would
    // then throw and return 500 instead of the 400 below.
    for (const route of ["/execute", "/transactions"]) {
      it(`POST ${route}: rejects with 400 and audits it`, async () => {
        const { app, callerAuditSink } = buildApp();

        const response = await request(app)
          .post(route)
          .set("Authorization", `Bearer ${VALID_KEY}`);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe(
          "businessTransactionId must be a valid UUID.",
        );
        expect(structuralEvents(callerAuditSink)).toHaveLength(1);
      });
    }
  });
});
