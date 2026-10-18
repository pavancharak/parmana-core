/**
 * Parmana TypeScript SDK
 *
 * Canonical BusinessTransaction fixture.
 *
 * This fixture represents a valid business transaction
 * used throughout the SDK test suite.
 */

import {
  BusinessTransaction,
  BusinessTransactionStatus,
} from "@parmana/shared";

/**
 * Canonical BusinessTransaction fixture.
 */
export const businessTransaction: BusinessTransaction = {
  businessTransactionId: "txn-000001",

  authority: {
    authorityId: "authority-001",

    authorityType: "SYSTEM",

    authorityName: "Finance Approval Service",
  },

  authorization: {
    authorizationId: "authorization-001",

    authorityId: "authority-001",

    authorizedAt: new Date("2026-01-01T00:00:00Z"),
  },

  intent: {
    intentId: "intent-001",

    // test:fixture-execute (not payments:execute/vendor-payment, removed
    // per docs/VERIFICATION-GAPS.md G-27) -- a generic, test-only
    // capability with no production implication, registered only when
    // NODE_ENV=test (packages/api/src/bootstrap/createTestFixtureConnector.ts).
    action: "test:fixture-execute",

    resource: "invoice",

    description: "Approve vendor payment.",
  },

  policy: {
    name: "vendor-payment",
    version: "2.0.0",
    schemaVersion: "1.0.0",
  },

  signals: {
    vendorVerified: true,
    invoiceVerified: true,
    paymentApproved: true,
    sufficientFunds: true,
    paymentAmount: 100,
    riskScore: 10,
  },

  metadata: {
    executionMode: "SYNC",

    source: "sdk-test",

    environment: "test",
  },

  status: BusinessTransactionStatus.RECEIVED,

  createdAt: new Date("2026-01-01T00:00:00Z"),
};
