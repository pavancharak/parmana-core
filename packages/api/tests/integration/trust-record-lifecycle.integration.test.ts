import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

beforeAll(() => {
  process.env.PARMANA_STORAGE = "supabase";
});

import app from "../test-app.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate(
  "Execution Trust Record Lifecycle",
);

describe.skipIf(!databaseConfigured)("Execution Trust Record Lifecycle", () => {
  it("maintains the complete trust lifecycle", async () => {
    const transaction = await createBusinessTransaction();

    //
    // Execute
    //
    const executeResponse = await request(app)
      .post("/execute")
      .send(transaction);

    expect(executeResponse.status).toBe(200);

    const trustRecord = executeResponse.body;

    //
    // Retrieve Trust Record
    //
    const response = await request(app).get(
      `/trust-records/${trustRecord.businessTransactionId}`,
    );

    expect(response.status).toBe(200);

    expect(response.body.executions.length).toBe(1);

    expect(response.body.verifications.length).toBe(1);

    expect(response.body.receipts.length).toBe(1);

    //
    // Invariants
    //
    expect(response.body.businessTransactionId).toBe(
      trustRecord.businessTransactionId,
    );

    expect(response.body.trustRecordHash).toBe(trustRecord.trustRecordHash);
  });
});
