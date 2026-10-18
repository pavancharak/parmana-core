import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../test-app.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";

describe("Execution Trust Lifecycle", () => {
  it("should execute, verify, generate a receipt and replay a business transaction", async () => {
    //
    // Arrange
    //
    const transaction = await createBusinessTransaction();

    //
    // Execute
    //
    const execute = await request(app).post("/execute").send(transaction);

    expect(execute.status).toBe(200);

    //
    // Verify
    //
    const verify = await request(app).post("/verify").send({
      businessTransactionId: transaction.businessTransactionId,
    });

    expect(verify.status).toBe(200);

    //
    // Receipt
    //
    const receipt = await request(app).post("/receipt").send({
      businessTransactionId: transaction.businessTransactionId,
    });

    expect(receipt.status).toBe(200);

    //
    // Replay
    //
    const replay = await request(app).post("/replay").send({
      businessTransactionId: transaction.businessTransactionId,
    });

    expect(replay.status).toBe(200);

    //
    // Validate replay result
    //
    expect(replay.body.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );

    expect(replay.body.trustRecordHash).toBe(execute.body.trustRecordHash);

    expect(replay.body.verified).toBe(true);
  }, 30000);
});
