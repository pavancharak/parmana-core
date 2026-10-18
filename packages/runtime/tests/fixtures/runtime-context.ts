import type { RuntimeContext } from "../../src/context/RuntimeContext.js";

import {
  BusinessTransactionStatus,
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  type BusinessTransaction,
  type Execution,
} from "@parmana/shared";

export function createRuntimeContext(): RuntimeContext {
  const transaction: BusinessTransaction = {
    businessTransactionId: "txn-001",

    metadata: {
      businessTransactionId: "txn-001",
    },

    policy: {
      name: "payment-approval",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },

    signals: {},

    decision: {
      decisionId: "decision-001",
      outcome: DecisionOutcome.APPROVED,
      evaluatedAt: new Date("2026-01-01T00:00:00Z"),

      policy: {
        name: "payment-approval",
        version: "1.0.0",
        schemaVersion: "1.0",
      },
    },

    status: BusinessTransactionStatus.EXECUTING,

    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  const execution: Execution = {
    executionId: "exec-001",

    businessTransactionId: transaction.businessTransactionId,

    status: ExecutionStatus.COMPLETED,

    mode: ExecutionMode.SYNC,

    startedAt: new Date("2026-01-01T00:00:01Z"),

    completedAt: new Date("2026-01-01T00:00:02Z"),
  };

  return {
    transaction,

    execution,
  };
}
