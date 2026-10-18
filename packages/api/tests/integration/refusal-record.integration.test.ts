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
 * HTTP-level proof of RFC-0021: a policy REJECT (both the ordinary
 * PolicyEngine.evaluate shape and the G-24 signal/intent-binding
 * shape) now produces a durable, signed, independently verifiable
 * Refusal Record -- proven through the real Express app and the real
 * vendor-payment/2.0.0 policy file (boundSignals: paymentAmount ->
 * parameters.amount, vendorId -> target), not a stub.
 */
describe("Refusal Record (RFC-0021, HTTP boundary)", () => {
  function buildApp() {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);
    const app = createApp(application, {
      callerAuth: "disabled",
    });

    return app;
  }

  it("blocks the exact G-24 exploit shape and produces a verifiable Refusal Record with the mismatched fields", async () => {
    const app = buildApp();

    const transaction = await createBusinessTransaction();

    // What is declared to the policy engine: a small, fully-verified
    // payment to a known vendor (same signals createBusinessTransaction
    // already sets up to pass every rule).
    // What actually executes: a different amount, to a different
    // target -- the exact live exploit shape.
    transaction.intent = {
      ...transaction.intent,
      target: "ATTACKER-CONTROLLED-ACCOUNT-9999",
      parameters: { paymentId: "payment-001", amount: 999999999 },
    };

    const executeResponse = await request(app)
      .post("/execute")
      .send(transaction);

    expect(executeResponse.status).toBe(403);
    expect(executeResponse.body.code).toBe("POLICY_DENIED");

    const refusalResponse = await request(app).get(
      `/refusal/${transaction.businessTransactionId}`,
    );

    expect(refusalResponse.status).toBe(200);

    const refusalRecord = refusalResponse.body;

    expect(refusalRecord.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );
    expect(refusalRecord.decision.outcome).toBe("REJECTED");
    expect(refusalRecord.bindingViolations).toBeDefined();

    const paymentAmountViolation = refusalRecord.bindingViolations.find(
      (violation: { signalKey: string }) =>
        violation.signalKey === "paymentAmount",
    );
    expect(paymentAmountViolation).toMatchObject({
      signalKey: "paymentAmount",
      intentPath: "parameters.amount",
      signalValue: 1000,
      intentValue: 999999999,
    });

    const vendorIdViolation = refusalRecord.bindingViolations.find(
      (violation: { signalKey: string }) => violation.signalKey === "vendorId",
    );
    expect(vendorIdViolation).toMatchObject({
      signalKey: "vendorId",
      intentPath: "target",
      signalValue: "vendor://payments",
      intentValue: "ATTACKER-CONTROLLED-ACCOUNT-9999",
    });

    const verifyResponse = await request(app)
      .post("/refusal/verify")
      .send(refusalRecord);

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.valid).toBe(true);
  });

  it("produces a verifiable Refusal Record with no bindingViolations for an ordinary policy REJECT", async () => {
    const app = buildApp();

    const transaction = await createBusinessTransaction();

    // Signals stay consistent with intent (no binding violation) but
    // fail the policy's own risk-score rule (requires <= 20) -- an
    // ordinary PolicyEngine.evaluate REJECT, never reaching
    // SignalIntentBinder's violation logic at all.
    transaction.signals = {
      ...transaction.signals,
      riskScore: 999,
    };

    const executeResponse = await request(app)
      .post("/execute")
      .send(transaction);

    expect(executeResponse.status).toBe(403);
    expect(executeResponse.body.code).toBe("POLICY_DENIED");

    const refusalResponse = await request(app).get(
      `/refusal/${transaction.businessTransactionId}`,
    );

    expect(refusalResponse.status).toBe(200);

    const refusalRecord = refusalResponse.body;

    expect(refusalRecord.decision.outcome).toBe("REJECTED");
    expect(refusalRecord.bindingViolations).toBeUndefined();

    const verifyResponse = await request(app)
      .post("/refusal/verify")
      .send(refusalRecord);

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.valid).toBe(true);
  });

  it("reports a tampered Refusal Record as invalid, not as a crash", async () => {
    const app = buildApp();

    const transaction = await createBusinessTransaction();
    transaction.signals = { ...transaction.signals, riskScore: 999 };

    await request(app).post("/execute").send(transaction);

    const refusalResponse = await request(app).get(
      `/refusal/${transaction.businessTransactionId}`,
    );

    const genuineRecord = refusalResponse.body;

    // Simulates an operator (or attacker with database access) editing
    // the persisted row directly -- this is exactly the scenario a
    // plain unsigned audit row (caller_audit_events,
    // razorpay_webhook_audit_events) cannot detect, and the one this
    // whole feature exists to make detectable.
    const tamperedRecord = {
      ...genuineRecord,
      decision: {
        ...genuineRecord.decision,
        reason: "actually this was approved, trust me",
      },
    };

    const verifyGenuine = await request(app)
      .post("/refusal/verify")
      .send(genuineRecord);
    expect(verifyGenuine.body.valid).toBe(true);

    const verifyTampered = await request(app)
      .post("/refusal/verify")
      .send(tamperedRecord);

    expect(verifyTampered.status).toBe(200);
    expect(verifyTampered.body.valid).toBe(false);
  });

  it("rejects a structurally malformed verify request with 400, not a 500", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/refusal/verify")
      .send({ notARefusalRecord: true });

    expect(response.status).toBe(400);
  });
});

describe("Refusal Record ownership scoping (RFC-0021, IDOR regression)", () => {
  const CALLER_A_KEY = "refusal-scoping-caller-a-raw-key-for-tests-only";
  const CALLER_B_KEY = "refusal-scoping-caller-b-raw-key-for-tests-only";

  function buildScopedApp() {
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

    return createApp(application, {
      callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
    });
  }

  it("blocks caller-b from reading caller-a's Refusal Record (GET /refusal/:id), but caller-a can read their own", async () => {
    const app = buildScopedApp();

    const transaction = await createBusinessTransaction();
    transaction.signals = { ...transaction.signals, riskScore: 999 };

    const executeResponse = await request(app)
      .post("/execute")
      .set("Authorization", `Bearer ${CALLER_A_KEY}`)
      .send(transaction);

    expect(executeResponse.status).toBe(403);

    const asCallerB = await request(app)
      .get(`/refusal/${transaction.businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_B_KEY}`);

    expect(asCallerB.status).toBe(404);

    const asCallerA = await request(app)
      .get(`/refusal/${transaction.businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_A_KEY}`);

    expect(asCallerA.status).toBe(200);
    expect(asCallerA.body.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );
  });

  it("POST /refusal/verify requires no caller authentication at all, even when caller-auth is enabled for every other route", async () => {
    const app = buildScopedApp();

    const transaction = await createBusinessTransaction();
    transaction.signals = { ...transaction.signals, riskScore: 999 };

    await request(app)
      .post("/execute")
      .set("Authorization", `Bearer ${CALLER_A_KEY}`)
      .send(transaction);

    const refusalRecord = (
      await request(app)
        .get(`/refusal/${transaction.businessTransactionId}`)
        .set("Authorization", `Bearer ${CALLER_A_KEY}`)
    ).body;

    // No Authorization header at all -- this is the whole point of
    // the route.
    const verifyResponse = await request(app)
      .post("/refusal/verify")
      .send(refusalRecord);

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.valid).toBe(true);
  });
});
