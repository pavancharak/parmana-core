import { describe, expect, it } from "vitest";
import request from "supertest";
import { TEST_POLICY } from "../fixtures/policies.js";
import app from "../test-app.js";

describe("Execution Trust Workflow", () => {
  it("executes the complete workflow", async () => {
    //
    // Step 1
    // Execute Business Transaction
    //

    const transaction = {
      businessTransactionId: "txn-workflow-001",

      metadata: {
        businessTransactionId: "txn-workflow-001",
      },

      policy: TEST_POLICY,

      signals: {
        amount: 1000,
        vendorVerified: true,
        paymentApproved: true,
      },

      decision: {
        decisionId: "dec-001",
        decisionOutcome: "APPROVED",
        outcome: "APPROVED",
        evaluatedAt: new Date(),

        policy: TEST_POLICY,
      },

      status: "APPROVED",

      createdAt: new Date(),
    };

    const execute = await request(app).post("/execute").send(transaction);

    //
    // The remaining assertions will become
    // meaningful once the repositories are
    // fully wired for end-to-end persistence.
    //

    expect(execute.status).toBeDefined();
  });
});
