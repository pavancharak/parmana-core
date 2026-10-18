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
  normalizePolicy,
  PolicyReference,
} from "@parmana/shared";

import { PolicyEngine } from "@parmana/policy";

import { ReplayEngine } from "../src/ReplayEngine.js";
import type { ReplayInput } from "../src/types/ReplayInput.js";
import { toPolicySignals } from "../src/utils/to-policy-signals.js";

/**
 * Replay Integration Test
 *
 * Ensures deterministic replay of execution
 * trust decisions using the same policy engine.
 */
describe("Replay Engine", () => {
  it("replays a recorded decision deterministically", () => {
    const policyEngine = new PolicyEngine();
    const replayEngine = new ReplayEngine();

    //
    // Arrange
    //
    const policy: PolicyReference = {
      name: "default",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    };

    const authority: Authority = {
      authorityId: "authority-1",
    };

    const authorization: Authorization = {
      authorizationId: "authorization-1",
    };

    const intent: Intent = {
      intentId: "intent-1",
      authorizationId: "authorization-1",
      action: "payments:execute",
      target: "vendor://payments",
      parameters: {},
      createdAt: new Date(),
    };

    const transaction: BusinessTransaction = {
      businessTransactionId: "tx-1",

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
    // Generate the recorded decision using the SAME
    // PolicyEngine used by ReplayEngine.
    //
    const ledger = policyEngine.evaluate(
      normalizePolicy(transaction.policy),
      toPolicySignals(transaction.signals),
    );

    const recordedDecision: Decision = {
      decisionId: "dec-1",

      intentId: transaction.intent.intentId,

      policy: transaction.policy,

      signals: transaction.signals,

      outcome:
        ledger.action === "approve"
          ? DecisionOutcome.APPROVED
          : DecisionOutcome.REJECTED,

      reason: ledger.reason,

      evaluatedAt: new Date(),
    };

    const execution: Execution = {
      executionId: "exec-1",

      businessTransactionId: transaction.businessTransactionId,

      decision: recordedDecision,

      status: ExecutionStatus.COMPLETED,

      mode: ExecutionMode.SYNC,

      startedAt: new Date(),

      completedAt: new Date(),
    };

    const trustRecord: ExecutionTrustRecord = {
      trustRecordId: "tr-1",

      businessTransactionId: transaction.businessTransactionId,

      transaction,

      overrides: [],

      executions: [execution],

      verifications: [],

      receipts: [],

      trustRecordHash: "hash",

      createdAt: new Date(),

      updatedAt: new Date(),
    };

    const input: ReplayInput = {
      trustRecord,
      transaction,
      policy: transaction.policy,
    };

    //
    // Act
    //
    const result = replayEngine.replay(input);

    //
    // Assert
    //
    expect(result.recordedDecision.decisionId).toBe(
      recordedDecision.decisionId,
    );

    expect(result.matches).toBe(true);

    expect(result.replayedDecision.outcome).toBe(recordedDecision.outcome);
  });
});
