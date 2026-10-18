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
 * Investigation-only test, not part of any fix. caller-scoping.integration.test.ts
 * (the existing IDOR regression suite) proves isOwnedByCaller scoping for
 * /transactions, /trust-records, /verify, /verification, /replay, and
 * /receipt* -- but never GET /refusal/:id, even though refusal-get.ts uses
 * the identical isOwnedByCaller check. Closing that specific test-coverage
 * gap here, in the same file's style, rather than assuming the pattern
 * holds because the source looks the same.
 */
describe("Caller scoping (HTTP boundary): GET /refusal/:id", () => {
  const CALLER_A_KEY = "refusal-scoping-caller-a-raw-key-for-tests-only";
  const CALLER_B_KEY = "refusal-scoping-caller-b-raw-key-for-tests-only";

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

  /** Submits a transaction that policy will REJECT (signal/intent binding
   * violation: vendorId no longer matches intent.target), so a real
   * RefusalRecord gets written for it. */
  async function rejectAsCallerA(app: import("express").Express) {
    const transaction = await createBusinessTransaction();

    const rejected = {
      ...transaction,
      signals: {
        ...transaction.signals,
        vendorId: "vendor://a-different-target",
      },
    };

    const response = await request(app)
      .post("/execute")
      .set("Authorization", `Bearer ${CALLER_A_KEY}`)
      .send(rejected);

    expect(response.status).toBe(403);

    return transaction.businessTransactionId as string;
  }

  it("blocks caller-b from GET /refusal/:id for caller-a's refused transaction", async () => {
    const app = buildApp();
    const businessTransactionId = await rejectAsCallerA(app);

    const asCallerB = await request(app)
      .get(`/refusal/${businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_B_KEY}`);

    expect(asCallerB.status).toBe(404);

    const asCallerA = await request(app)
      .get(`/refusal/${businessTransactionId}`)
      .set("Authorization", `Bearer ${CALLER_A_KEY}`);

    expect(asCallerA.status).toBe(200);
    expect(asCallerA.body.businessTransactionId).toBe(businessTransactionId);
  });
});
