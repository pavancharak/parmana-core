/**
 * Parmana TypeScript SDK
 *
 * createBusinessTransaction unit tests.
 *
 * Proves the one property this builder exists for: every id pair
 * BusinessTransactionValidator cross-checks server-side
 * (packages/runtime/src/validators/BusinessTransactionValidator.ts)
 * is structurally consistent in the object this function produces,
 * for every call, not just by convention.
 */

import { describe, expect, it } from "vitest";

import { createBusinessTransaction } from "../src/builders/createBusinessTransaction.js";

const BASE_OPTIONS = {
  principalId: "e2e-test-agent",
  purpose: "Unit test",
  action: "paytm:refund",
  target: "order-1",
  parameters: { orderId: "order-1", transactionId: "txn-1", amount: 5 },
  policy: { name: "customer-refund", version: "1.0.0", schemaVersion: "1.0.0" },
  signals: {
    refundEligible: true,
    managerApproved: true,
    fraudCheckPassed: true,
    refundAmount: 5,
  },
} as const;

describe("createBusinessTransaction", () => {
  it("sets metadata.businessTransactionId equal to businessTransactionId", () => {
    const transaction = createBusinessTransaction(BASE_OPTIONS);

    expect(transaction.metadata.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );
  });

  it("sets authorization.authorityId equal to authority.authorityId", () => {
    const transaction = createBusinessTransaction(BASE_OPTIONS);

    expect(transaction.authorization.authorityId).toBe(
      transaction.authority.authorityId,
    );
  });

  it("sets intent.authorizationId equal to authorization.authorizationId", () => {
    const transaction = createBusinessTransaction(BASE_OPTIONS);

    expect(transaction.intent.authorizationId).toBe(
      transaction.authorization.authorizationId,
    );
  });

  it("generates a fresh, valid UUID businessTransactionId when none is supplied", () => {
    const a = createBusinessTransaction(BASE_OPTIONS);
    const b = createBusinessTransaction(BASE_OPTIONS);

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(a.businessTransactionId).toMatch(uuidPattern);
    expect(a.businessTransactionId).not.toBe(b.businessTransactionId);
  });

  it("uses a caller-supplied businessTransactionId verbatim, still kept consistent with metadata", () => {
    const transaction = createBusinessTransaction({
      ...BASE_OPTIONS,
      businessTransactionId: "11111111-1111-4111-8111-111111111111",
    });

    expect(transaction.businessTransactionId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(transaction.metadata.businessTransactionId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("defaults authorityType to SERVICE, never AGENT (which does not exist server-side)", () => {
    const transaction = createBusinessTransaction(BASE_OPTIONS);

    expect(transaction.authority.authorityType).toBe("SERVICE");
  });

  it("accepts an explicit authorityType override", () => {
    const transaction = createBusinessTransaction({
      ...BASE_OPTIONS,
      authorityType: "USER",
    });

    expect(transaction.authority.authorityType).toBe("USER");
  });

  it("sets status to RECEIVED and a real createdAt Date", () => {
    const transaction = createBusinessTransaction(BASE_OPTIONS);

    expect(transaction.status).toBe("RECEIVED");
    expect(transaction.createdAt).toBeInstanceOf(Date);
  });

  it("passes action/target/parameters/policy/signals through unchanged", () => {
    const transaction = createBusinessTransaction(BASE_OPTIONS);

    expect(transaction.intent.action).toBe("paytm:refund");
    expect(transaction.intent.target).toBe("order-1");
    expect(transaction.intent.parameters).toEqual(BASE_OPTIONS.parameters);
    expect(transaction.policy).toEqual(BASE_OPTIONS.policy);
    expect(transaction.signals).toEqual(BASE_OPTIONS.signals);
  });

  it("omits optional metadata fields entirely when not supplied, rather than setting them to undefined", () => {
    const transaction = createBusinessTransaction(BASE_OPTIONS);

    expect(Object.keys(transaction.metadata)).toEqual([
      "businessTransactionId",
    ]);
  });

  it("includes optional metadata fields when supplied", () => {
    const transaction = createBusinessTransaction({
      ...BASE_OPTIONS,
      correlationId: "corr-1",
      tenantId: "tenant-1",
      sourceSystem: "unit-test",
      submittedBy: "e2e-test-agent",
    });

    expect(transaction.metadata.correlationId).toBe("corr-1");
    expect(transaction.metadata.tenantId).toBe("tenant-1");
    expect(transaction.metadata.sourceSystem).toBe("unit-test");
    expect(transaction.metadata.submittedBy).toBe("e2e-test-agent");
  });
});
