import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

beforeAll(() => {
  process.env.PARMANA_STORAGE = "supabase";
});

import app from "../test-app.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate("Trust Record GET Integration");

describe.skipIf(!databaseConfigured)("Trust Record GET Integration", () => {
  it("retrieves an existing Execution Trust Record", async () => {
    //
    const transaction = await createBusinessTransaction();

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
    const getResponse = await request(app).get(
      `/trust-records/${trustRecord.businessTransactionId}`,
    );

    console.log("TRUST RECORD:", getResponse.status);

    console.log(getResponse.body);

    expect(getResponse.status).toBe(200);

    expect(getResponse.body.businessTransactionId).toBe(
      trustRecord.businessTransactionId,
    );

    expect(getResponse.body.trustRecordId).toBe(trustRecord.trustRecordId);

    expect(getResponse.body.trustRecordHash).toBe(trustRecord.trustRecordHash);
  });

  it("returns an error for an unknown Business Transaction", async () => {
    const response = await request(app).get(
      `/trust-records/${crypto.randomUUID()}`,
    );

    expect(response.status).toBe(404);

    expect(response.body.error).toContain("Execution Trust Record");
  });
});
