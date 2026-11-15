import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";

/**
 * Declare open point 15, decided 2026-11-15: a repeat of an identical declaration
 * returns 200 with the stored record. A repeat with a different body is still 409.
 */
describe("POST /transactions: a repeat declaration", () => {
  it("returns 200 with the stored record when the body is identical", async () => {
    const original = await createBusinessTransaction();

    const first = await request(app).post("/transactions").send(original);
    expect(first.status).toBe(201);

    const repeat = await request(app).post("/transactions").send(original);

    expect(repeat.status).toBe(200);
    expect(repeat.body.businessTransactionId).toBe(original.businessTransactionId);
    expect(repeat.body.status).toBe("RECEIVED");
    expect(repeat.body.transaction.businessTransactionId).toBe(original.businessTransactionId);
  });

  it("treats a key-order change in the same body as identical", async () => {
    const original = await createBusinessTransaction();
    const reordered = Object.fromEntries(Object.entries(original).reverse());

    expect((await request(app).post("/transactions").send(original)).status).toBe(201);

    const repeat = await request(app).post("/transactions").send(reordered);

    expect(repeat.status).toBe(200);
  });

  it("refuses with 409 when the same ID comes with a different body", async () => {
    const original = await createBusinessTransaction();
    const tampered = {
      ...original,
      intent: {
        ...original.intent,
        target: "account://999",
        parameters: { accountId: "account-999", amount: 999999 },
      },
    };

    expect((await request(app).post("/transactions").send(original)).status).toBe(201);

    const second = await request(app).post("/transactions").send(tampered);

    expect(second.status).toBe(409);
    expect(second.body.error).toContain(original.businessTransactionId);
  });
});
