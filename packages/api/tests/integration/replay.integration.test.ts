import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

beforeAll(() => {
  process.env.PARMANA_STORAGE = "supabase";
});

import app from "../test-app.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate("Replay Integration");

describe.skipIf(!databaseConfigured)("Replay Integration", () => {
  it("replays a previously executed Business Transaction", async () => {
    //
    // Execute
    //
    const transaction = await createBusinessTransaction();

    const execute = await request(app).post("/execute").send(transaction);

    expect(execute.status).toBe(200);

    //
    // Verify
    //
    const verify = await request(app).post("/verify").send({
      businessTransactionId: execute.body.businessTransactionId,
    });

    console.log("VERIFY RESPONSE");
    console.dir(verify.body, { depth: null });
    console.log("VERIFY STATUS", verify.status);

    //
    // Receipt
    //
    const receipt = await request(app).post("/receipt").send({
      businessTransactionId: execute.body.businessTransactionId,
    });

    console.log("RECEIPT RESPONSE");
    console.dir(receipt.body, { depth: null });
    console.log("RECEIPT STATUS", receipt.status);

    //
    // Replay
    //
    const replay = await request(app).post("/replay").send({
      businessTransactionId: execute.body.businessTransactionId,
    });

    expect(replay.status).toBe(200);

    //
    // Replay should produce the same
    // deterministic Trust Record hash.
    //
    expect(replay.body.businessTransactionId).toBe(
      execute.body.businessTransactionId,
    );

    expect(replay.body.trustRecordHash).toBe(execute.body.trustRecordHash);

    expect(replay.body.verified).toBe(true);
  }, 30000);

  it("fails with 404 for an unknown Business Transaction", async () => {
    const response = await request(app).post("/replay").send({
      businessTransactionId: crypto.randomUUID(),
    });

    expect(response.status).toBe(404);

    expect(response.body.error).toBe("Execution Trust Record not found.");
  });
});
