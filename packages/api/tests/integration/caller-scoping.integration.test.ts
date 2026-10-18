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
 * Found by adversarial testing: /transactions, /trust-records, /verify,
 * /verification, /replay, and /receipt* all keyed purely off
 * businessTransactionId with zero ownership check — any authenticated
 * caller could read any other caller's complete transaction, trust
 * record, and receipt history (IDOR / broken object-level
 * authorization). Live PoC: a single ordinary API key listed all 17
 * transactions created by every other caller during a test session.
 *
 * This file proves caller-a cannot reach caller-b's data through any
 * of the affected routes, and that caller-b's own data remains fully
 * reachable to caller-b (the fix must not become a caller-a-shaped
 * false negative that also breaks caller-b's legitimate access).
 */
describe("Caller scoping (HTTP boundary, IDOR regression)", () => {
  const CALLER_A_KEY = "scoping-caller-a-raw-key-for-tests-only";
  const CALLER_B_KEY = "scoping-caller-b-raw-key-for-tests-only";

  function buildApp() {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "caller-a",
        keyHash: hashApiKey(CALLER_A_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
      },
      {
        callerId: "caller-b",
        keyHash: hashApiKey(CALLER_B_KEY),
        allowedPrincipalIds: ["integration-test"],
        allowedCapabilities: ["test:fixture-execute"],
      },
    ]);

    const app = createApp(application, {
      callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
    });

    return app;
  }

  async function executeAsCallerA(app: import("express").Express) {
    const transaction = await createBusinessTransaction();

    const response = await request(app)
      .post("/execute")
      .set("Authorization", `Bearer ${CALLER_A_KEY}`)
      .send(transaction);

    expect(response.status).toBe(200);

    return transaction.businessTransactionId as string;
  }

  it("blocks the exact live exploit: caller-b cannot list caller-a's transactions", async () => {
    const app = buildApp();
    const businessTransactionId = await executeAsCallerA(app);

    const asCallerB = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${CALLER_B_KEY}`);

    expect(asCallerB.status).toBe(200);
    expect(
      asCallerB.body.map(
        (t: { businessTransactionId: string }) => t.businessTransactionId,
      ),
    ).not.toContain(businessTransactionId);

    const asCallerA = await request(app)
      .get("/transactions")
      .set("Authorization", `Bearer ${CALLER_A_KEY}`);

    expect(
      asCallerA.body.map(
        (t: { businessTransactionId: string }) => t.businessTransactionId,
      ),
    ).toContain(businessTransactionId);
  });

  it("blocks caller-b from GET /transactions/:id for caller-a's transaction", async () => {
    const app = buildApp();
    const businessTransactionId = await executeAsCallerA(app);

    const asCallerB = await request(app)
      .get(`/transactions/${businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_B_KEY}`);

    expect(asCallerB.status).toBe(404);

    const asCallerA = await request(app)
      .get(`/transactions/${businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_A_KEY}`);

    expect(asCallerA.status).toBe(200);
  });

  it("blocks caller-b from GET /trust-records/:id for caller-a's transaction", async () => {
    const app = buildApp();
    const businessTransactionId = await executeAsCallerA(app);

    const asCallerB = await request(app)
      .get(`/trust-records/${businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_B_KEY}`);

    expect(asCallerB.status).toBe(404);

    const asCallerA = await request(app)
      .get(`/trust-records/${businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_A_KEY}`);

    expect(asCallerA.status).toBe(200);
  });

  it("blocks caller-b from POST /verify for caller-a's transaction", async () => {
    const app = buildApp();
    const businessTransactionId = await executeAsCallerA(app);

    const asCallerB = await request(app)
      .post("/verify")
      .set("Authorization", `Bearer ${CALLER_B_KEY}`)
      .send({ businessTransactionId });

    expect(asCallerB.status).toBe(404);

    const asCallerA = await request(app)
      .post("/verify")
      .set("Authorization", `Bearer ${CALLER_A_KEY}`)
      .send({ businessTransactionId });

    expect(asCallerA.status).toBe(200);
  });

  it("blocks caller-b from GET /verification/:id for caller-a's transaction", async () => {
    const app = buildApp();
    const businessTransactionId = await executeAsCallerA(app);

    const asCallerB = await request(app)
      .get(`/verification/${businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_B_KEY}`);

    expect(asCallerB.status).toBe(404);
  });

  it("blocks caller-b from POST /replay for caller-a's transaction", async () => {
    const app = buildApp();
    const businessTransactionId = await executeAsCallerA(app);

    const asCallerB = await request(app)
      .post("/replay")
      .set("Authorization", `Bearer ${CALLER_B_KEY}`)
      .send({ businessTransactionId });

    expect(asCallerB.status).toBe(404);

    const asCallerA = await request(app)
      .post("/replay")
      .set("Authorization", `Bearer ${CALLER_A_KEY}`)
      .send({ businessTransactionId });

    expect(asCallerA.status).toBe(200);
  });

  it("blocks caller-b from POST /receipt for caller-a's transaction", async () => {
    const app = buildApp();
    const businessTransactionId = await executeAsCallerA(app);

    const asCallerB = await request(app)
      .post("/receipt")
      .set("Authorization", `Bearer ${CALLER_B_KEY}`)
      .send({ businessTransactionId });

    expect(asCallerB.status).toBe(404);

    const asCallerA = await request(app)
      .post("/receipt")
      .set("Authorization", `Bearer ${CALLER_A_KEY}`)
      .send({ businessTransactionId });

    expect(asCallerA.status).toBe(200);
  });

  it("blocks caller-b from GET /receipt/latest/:id for caller-a's transaction", async () => {
    const app = buildApp();
    const businessTransactionId = await executeAsCallerA(app);

    const asCallerB = await request(app)
      .get(`/receipt/latest/${businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_B_KEY}`);

    expect(asCallerB.status).toBe(404);

    const asCallerA = await request(app)
      .get(`/receipt/latest/${businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_A_KEY}`);

    expect(asCallerA.status).toBe(200);
  });
});
