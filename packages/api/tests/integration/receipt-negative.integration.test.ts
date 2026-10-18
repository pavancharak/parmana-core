import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

beforeAll(() => {
  process.env.PARMANA_STORAGE = "supabase";
});

import app from "../test-app.js";
import { executionTrustRecordRepository } from "../../src/repositories.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate("Receipt Negative Integration");

describe.skipIf(!databaseConfigured)("Receipt Negative Integration", () => {
  it("fails with 404 for an unknown Business Transaction", async () => {
    const response = await request(app).post("/receipt").send({
      businessTransactionId: crypto.randomUUID(),
    });

    expect(response.status).toBe(404);

    expect(response.body.error).toBe("Execution Trust Record not found.");
  });

  it("fails with 409 when the latest Verification did not succeed", async () => {
    //
    // Execute a real transaction, then tamper the persisted
    // Execution so a re-verification fails, appending a FAILED
    // Verification as the most recent one. Receipt generation
    // consults only the latest Verification's status, so this
    // reproduces "not yet verified" without touching storage
    // internals directly.
    //
    const transaction = await createBusinessTransaction();

    const execute = await request(app).post("/execute").send(transaction);

    expect(execute.status).toBe(200);

    await executionTrustRecordRepository.replaceExecution({
      ...execute.body.executions[0],
      metadata: {
        ...execute.body.executions[0].metadata,
        authorizationId: "tampered-authorization-id",
      },
    });

    const verify = await request(app).post("/verify").send({
      businessTransactionId: transaction.businessTransactionId,
    });

    expect(verify.status).toBe(200);

    expect(verify.body.status).toBe("FAILED");

    const receipt = await request(app).post("/receipt").send({
      businessTransactionId: transaction.businessTransactionId,
    });

    expect(receipt.status).toBe(409);

    expect(receipt.body.error).toBe(
      "Execution Trust Record must be successfully verified before a Receipt can be generated.",
    );
  });

  it("fails when Business Transaction ID is missing", async () => {
    const response = await request(app).post("/receipt").send({});

    expect(response.status).toBe(400);
  });

  it("fails for an invalid Business Transaction ID", async () => {
    const response = await request(app).post("/receipt").send({
      businessTransactionId: "abc",
    });

    expect(response.status).toBe(400);
  });
});
