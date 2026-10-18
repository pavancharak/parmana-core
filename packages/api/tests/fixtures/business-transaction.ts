import type { BusinessTransaction } from "@parmana/shared";

import { withTestApproval } from "../../../../test-support/approvals.js";

import { TEST_POLICY } from "./policies.js";

/**
 * A transaction its policy approves, with a signed test approval for
 * its target and amount: no agent action is authorized without one.
 */
export function createBusinessTransaction(): Promise<BusinessTransaction> {
  const businessTransactionId = crypto.randomUUID();

  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();

  return withTestApproval({
    businessTransactionId,

    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "integration-test",
      createdAt: new Date(),
    },

    authority: {
      authorityId,
      authorityType: "USER",
      principalId: "integration-test",
      displayName: "Integration Test",
      issuedAt: new Date(),
    },

    authorization: {
      authorizationId,
      authorityId,
      purpose: "Integration Test",
      authorizedAt: new Date(),
    },

    intent: {
      intentId,
      authorizationId,

      // test:fixture-execute (not payments:execute/vendor-payment, removed
      // per docs/VERIFICATION-GAPS.md G-27) -- a generic, test-only
      // capability with no production implication, unbound in
      // CANONICAL_CAPABILITY_POLICY_BINDINGS, existing solely so this
      // shared fixture has a real connector to execute against. Still
      // governed by the vendor-payment/2.1.0 policy below, kept unchanged
      // and unbound from any capability -- policy content and capability
      // identity are independent concepts in this architecture.
      action: "test:fixture-execute",

      target: "vendor://payments",

      parameters: Object.freeze({
        paymentId: "payment-001",
        amount: 1000,
      }),

      createdAt: new Date(),
    },
    policy: TEST_POLICY,
    signals: {
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: 1000,
      riskScore: 10,
      // Must match intent.target exactly: vendor-payment/2.1.0 declares
      // boundSignals requiring vendorId === intent.target.
      vendorId: "vendor://payments",
    },

    decision: {
      outcome: "APPROVED",
    },

    status: "APPROVED",

    createdAt: new Date(),
  });
}
