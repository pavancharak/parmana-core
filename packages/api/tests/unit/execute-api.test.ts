import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";

describe("POST /execute", () => {
  it("returns a validation error for an invalid Business Transaction ID", async () => {
    const response = await request(app)
      .post("/execute")

      .send({
        businessTransactionId: "txn-001",

        status: "AUTHORIZED",

        metadata: {},

        policy: {},

        signals: {},

        decision: {},
      });

    expect(response.status).toBe(400);

    expect(response.body.error).toBe(
      "businessTransactionId must be a valid UUID.",
    );
  });

  it("returns 404 when the referenced policy does not exist (PolicyNotFoundError)", async () => {
    const transaction = await createBusinessTransaction();

    const response = await request(app)
      .post("/execute")
      .send({
        ...transaction,
        policy: {
          name: "does-not-exist",
          version: "9.9.9",
          schemaVersion: "1.0.0",
        },
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("does-not-exist");
    expect(response.body.error).toContain("9.9.9");
  });

  it("returns 409 when the same businessTransactionId is submitted twice (DuplicateBusinessTransactionError)", async () => {
    const transaction = await createBusinessTransaction();

    const first = await request(app).post("/execute").send(transaction);
    expect(first.status).toBe(200);

    const second = await request(app).post("/execute").send(transaction);
    expect(second.status).toBe(409);
    expect(second.body.error).toContain(transaction.businessTransactionId);
    expect(second.body.error).toContain("already exists");
  });
});
