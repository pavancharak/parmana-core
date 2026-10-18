import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";

describe("GET /verification/:id", () => {
  it("returns 404 when the Execution Trust Record does not exist", async () => {
    const response = await request(app).get("/verification/txn-001");

    expect(response.status).toBe(404);

    expect(response.body.error).toBe("Execution Trust Record not found.");
  });

  it("returns 404 when no Verification exists", async () => {
    // This test becomes meaningful once an
    // Execution Trust Record can exist without
    // any Verification artifacts.
    //
    // For now, the repository returns the same
    // "Execution Trust Record not found." error.

    const response = await request(app).get("/verification/txn-001");

    expect(response.status).toBe(404);
  });

  it("returns the latest Verification after a successful execution (200 path, previously untested)", async () => {
    const transaction = await createBusinessTransaction();

    const execute = await request(app).post("/execute").send(transaction);
    expect(execute.status).toBe(200);

    const response = await request(app).get(
      `/verification/${transaction.businessTransactionId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );
    expect(response.body.status).toBe("VERIFIED");
    expect(response.body.trustRecordHash).toBe(execute.body.trustRecordHash);
  });
});
