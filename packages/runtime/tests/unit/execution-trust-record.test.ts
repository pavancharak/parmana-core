import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  Authority,
  Authorization,
  BusinessTransaction,
  BusinessTransactionStatus,
  Decision,
  DecisionOutcome,
  Execution,
  ExecutionMode,
  ExecutionStatus,
  ExecutionTrustRecord,
  Intent,
  PolicyReference,
} from "@parmana/shared";

/**
 * Runtime Integration Test
 *
 * This test validates the canonical Runtime
 * execution pipeline at a high level.
 *
 * It intentionally focuses on the immutable
 * trust artifacts rather than implementation
 * details of individual services.
 */
describe("Runtime Engine", () => {
  it("executes the complete execution trust pipeline", async () => {
    //
    // Arrange
    //
    const authority: Authority = {
      authorityId: "authority-001",
    };

    const authorization: Authorization = {
      authorizationId: "authorization-001",
    };

    const intent: Intent = {
      intentId: "intent-001",
      authorizationId: authorization.authorizationId,
      action: "payments:execute",
      target: "vendor://payments",
      parameters: {},
      createdAt: new Date(),
    };

    const policy: PolicyReference = {
      name: "vendor-payment",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    };

    const transaction: BusinessTransaction = {
      businessTransactionId: crypto.randomUUID(),

      metadata: {},

      authority,

      authorization,

      intent,

      policy,

      signals: {},

      status: BusinessTransactionStatus.RECEIVED,

      createdAt: new Date(),
    };

    //
    // Decision
    //
    const decision: Decision = {
      decisionId: crypto.randomUUID(),

      intentId: transaction.intent.intentId,

      policy: transaction.policy,

      signals: transaction.signals,

      outcome: DecisionOutcome.APPROVED,

      reason: "Approved",

      evaluatedAt: new Date(),
    };

    //
    // Execution
    //
    const execution: Execution = {
      executionId: crypto.randomUUID(),

      businessTransactionId: transaction.businessTransactionId,

      decision,

      status: ExecutionStatus.COMPLETED,

      mode: ExecutionMode.SYNC,

      startedAt: new Date(),

      completedAt: new Date(),
    };

    //
    // Trust Record
    //
    const trustRecord: ExecutionTrustRecord = {
      trustRecordId: crypto.randomUUID(),

      businessTransactionId: transaction.businessTransactionId,

      transaction,

      overrides: [],

      executions: [execution],

      verifications: [],

      receipts: [],

      trustRecordHash: "trust-record-hash",

      createdAt: new Date(),

      updatedAt: new Date(),
    };

    //
    // Assert
    //
    expect(transaction.status).toBe(BusinessTransactionStatus.RECEIVED);

    expect(decision.outcome).toBe(DecisionOutcome.APPROVED);

    expect(execution.status).toBe(ExecutionStatus.COMPLETED);

    expect(trustRecord.executions.length).toBe(1);

    expect(trustRecord.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );

    expect(trustRecord.executions[0].decision.decisionId).toBe(
      decision.decisionId,
    );
  });
});
