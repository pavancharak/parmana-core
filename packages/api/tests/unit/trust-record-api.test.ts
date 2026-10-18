import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";

describe("GET /trust-records/:id", () => {
  it("returns 404 when the Execution Trust Record does not exist", async () => {
    const response = await request(app).get("/trust-records/txn-001");

    expect(response.status).toBe(404);

    expect(response.body.error).toBe("Execution Trust Record not found.");
  });
});

describe("GET /trust-records (bulk export)", () => {
  it("returns an empty array when nothing has executed yet", async () => {
    const response = await request(app).get("/trust-records");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("returns the full signed Trust Record for each executed transaction on the page", async () => {
    const transaction = await createBusinessTransaction();

    const executeResponse = await request(app)
      .post("/execute")
      .send(transaction);
    expect(executeResponse.status).toBe(200);

    const response = await request(app).get(
      "/trust-records?page=1&pageSize=25",
    );

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const record = response.body.find(
      (candidate: { businessTransactionId: string }) =>
        candidate.businessTransactionId === transaction.businessTransactionId,
    );

    expect(record).toBeDefined();
    expect(record.trustRecordId).toBe(executeResponse.body.trustRecordId);
    expect(record.transaction.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );
  });

  it("filters by since/until against transaction.createdAt", async () => {
    const transaction = await createBusinessTransaction();
    await request(app).post("/execute").send(transaction);

    const farFuture = await request(app).get(
      `/trust-records?since=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`,
    );
    expect(
      farFuture.body.some(
        (r: { businessTransactionId: string }) =>
          r.businessTransactionId === transaction.businessTransactionId,
      ),
    ).toBe(false);

    const farPast = await request(app).get(
      `/trust-records?since=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}`,
    );
    expect(
      farPast.body.some(
        (r: { businessTransactionId: string }) =>
          r.businessTransactionId === transaction.businessTransactionId,
      ),
    ).toBe(true);
  });
});
