import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../test-app.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";

/**
 * Investigation-only test, not part of any fix. Proves empirically what the
 * current /execute and /transactions contract actually does when a request
 * reuses a businessTransactionId with different action/target/parameters,
 * and what happens with a never-before-seen id. See the accompanying
 * investigation report for the full analysis this backs.
 */
describe("Authoritative BusinessTransaction investigation", () => {
  it("rejects a same-id, different-fields resubmission as a duplicate BEFORE execution, never runs the caller-supplied override", async () => {
    const original = await createBusinessTransaction();

    const first = await request(app).post("/execute").send(original);
    expect(first.status).toBe(200);

    // Same businessTransactionId, but a materially different intent:
    // different action, different target, different amount.
    const tampered = {
      ...original,
      intent: {
        ...original.intent,
        action: "delete-account",
        target: "account://999",
        parameters: {
          accountId: "account-999",
          amount: 999999,
        },
      },
    };

    const second = await request(app).post("/execute").send(tampered);

    // The duplicate-id check runs before Runtime is ever touched, so the
    // response must be the same 409 the existing "submitted twice" test
    // already proves -- action/target/parameters differing shouldn't change
    // that outcome, because they're never inspected before the duplicate
    // check fires.
    expect(second.status).toBe(409);
    expect(second.body.error).toContain(original.businessTransactionId);
    expect(second.body.error).toContain("already exists");

    // Direct proof the tampered fields never reached anything: read back
    // the persisted transaction by id and confirm it still holds the
    // ORIGINAL action/target/parameters, not the second request's values.
    const stored = await request(app).get(
      `/transactions/${original.businessTransactionId}`,
    );

    expect(stored.status).toBe(200);
    expect(stored.body.intent.action).toBe(original.intent.action);
    expect(stored.body.intent.target).toBe(original.intent.target);
    expect(stored.body.intent.parameters).toEqual(original.intent.parameters);
    expect(stored.body.intent.action).not.toBe("delete-account");
  });

  it("a never-before-used businessTransactionId is NOT rejected as unknown -- it is the normal, expected path (no authoritative-record lookup exists to fail against)", async () => {
    const fresh = await createBusinessTransaction();

    const response = await request(app).post("/execute").send(fresh);

    // There is no "must already exist" check anywhere in this path --
    // accept() only rejects when the id ALREADY exists. A fresh id is
    // the happy path, not a failure mode.
    expect(response.status).toBe(200);
    expect(response.body.businessTransactionId).toBe(
      fresh.businessTransactionId,
    );
  });

  it("POST /transactions has the identical create-and-execute-from-request-body contract as POST /execute, not a separate lookup-by-id path", async () => {
    const original = await createBusinessTransaction();

    const first = await request(app).post("/transactions").send(original);
    expect(first.status).toBe(201);

    const tampered = {
      ...original,
      intent: {
        ...original.intent,
        action: "delete-account",
        target: "account://999",
        parameters: { accountId: "account-999", amount: 999999 },
      },
    };

    const second = await request(app).post("/transactions").send(tampered);

    expect(second.status).toBe(409);
    expect(second.body.error).toContain(original.businessTransactionId);
    expect(second.body.error).toContain("already exists");
  });
});
