import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";

/**
 * Investigation-only test, not part of any fix. Proves empirically whether
 * BusinessTransactionService.accept()'s exists()-then-create() check-then-act
 * gap is an actual race (two concurrent requests for the same brand-new
 * businessTransactionId both succeeding with different content), or whether
 * the repository's own independently-atomic create() closes it regardless.
 */
describe("Concurrent same-id resubmission investigation", () => {
  it("of two concurrent POST /execute requests for the same brand-new id with different content, exactly one succeeds and one is rejected as a duplicate -- never both", async () => {
    const base = await createBusinessTransaction();

    const variantA = base;
    const variantB = {
      ...base,
      intent: {
        ...base.intent,
        action: "delete-account",
        target: "account://999",
        parameters: { accountId: "account-999", amount: 999999 },
      },
    };

    const [responseA, responseB] = await Promise.all([
      request(app).post("/execute").send(variantA),
      request(app).post("/execute").send(variantB),
    ]);

    const statuses = [responseA.status, responseB.status].sort();

    // Exactly one 200 and one 409 -- never 200/200 (both executed) and
    // never 409/409 (neither executed, which would itself be a different,
    // separate bug).
    expect(statuses).toEqual([200, 409]);

    // Whichever one succeeded, confirm the persisted record reflects only
    // ONE coherent set of values, not some mixed/corrupted state.
    const stored = await request(app).get(
      `/transactions/${base.businessTransactionId}`,
    );
    expect(stored.status).toBe(200);

    const persistedAction = stored.body.intent.action;
    expect(["test:fixture-execute", "delete-account"]).toContain(
      persistedAction,
    );
  });
});
