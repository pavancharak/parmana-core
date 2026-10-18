/**
 * Parmana TypeScript SDK
 *
 * Canonical ExecutionTrustRecord fixture.
 */

import {
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  ExecutionTrustRecord,
  VerificationStatus,
} from "@parmana/shared";

import { businessTransaction } from "./business-transaction.js";

/**
 * Canonical ExecutionTrustRecord fixture.
 */
export const executionTrustRecord: ExecutionTrustRecord = {
  trustRecordId: "trust-001",

  businessTransactionId: businessTransaction.businessTransactionId,

  transaction: businessTransaction,

  overrides: [],

  executions: [
    {
      executionId: "execution-001",

      businessTransactionId: businessTransaction.businessTransactionId,

      decision: {
        decisionId: "decision-001",

        intentId: businessTransaction.intent.intentId,

        policy: businessTransaction.policy,

        signals: businessTransaction.signals,

        outcome: DecisionOutcome.APPROVED,

        reason: "Policy conditions satisfied.",

        evaluatedAt: new Date("2026-01-01T00:00:00Z"),
      },

      status: ExecutionStatus.COMPLETED,

      mode: ExecutionMode.SYNC,

      startedAt: new Date("2026-01-01T00:00:00Z"),

      completedAt: new Date("2026-01-01T00:00:01Z"),
    },
  ],

  verifications: [
    {
      verificationId: "verification-001",

      businessTransactionId: businessTransaction.businessTransactionId,

      status: VerificationStatus.VERIFIED,

      message: "Execution Trust Record verified.",

      verifiedAt: new Date("2026-01-01T00:00:02Z"),

      trustRecordHash: "sha256:trust-record-hash",
    },
  ],

  receipts: [],

  trustRecordHash: "sha256:trust-record-hash",

  createdAt: new Date("2026-01-01T00:00:00Z"),

  updatedAt: new Date("2026-01-01T00:00:02Z"),
};
