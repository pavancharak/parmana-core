import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

beforeAll(() => {
  process.env.PARMANA_STORAGE = "supabase";
});

import app from "../test-app.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate("Negative Workflow Integration");

describe.skipIf(!databaseConfigured)("Negative Workflow Integration", () => {
  it("fails verification for an unknown Business Transaction", async () => {
    const response = await request(app).post("/verify").send({
      businessTransactionId: crypto.randomUUID(),
    });

    expect(response.status).toBe(404);

    expect(response.body.error).toContain("Execution Trust Record not found.");
  });

  it("returns the generated receipt after execution", async () => {
    //
    // Execute a Business Transaction.
    //
    const transaction = await createBusinessTransaction();

    const execute = await request(app).post("/execute").send(transaction);

    expect(execute.status).toBe(200);

    //
    // The canonical runtime automatically performs
    // verification and generates a receipt.
    //
    const receipt = await request(app).post("/receipt").send({
      businessTransactionId: execute.body.businessTransactionId,
    });

    expect(receipt.status).toBe(200);

    expect(receipt.body.receiptId).toBeDefined();

    expect(receipt.body.businessTransactionId).toBe(
      execute.body.businessTransactionId,
    );

    expect(receipt.body.receiptHash).toBeDefined();

    expect(receipt.body.signature).toBeDefined();
  });

  it("fails for an unknown Trust Record", async () => {
    const response = await request(app).get(
      `/trust-records/${crypto.randomUUID()}`,
    );

    expect(response.status).toBe(404);
  });

  it("fails verification when Business Transaction ID is missing", async () => {
    const response = await request(app).post("/verify").send({});

    expect(response.status).toBe(400);
  });

  it("fails verification for an invalid Business Transaction ID", async () => {
    const response = await request(app).post("/verify").send({
      businessTransactionId: "not-a-uuid",
    });

    expect(response.status).toBe(400);
  });
});
