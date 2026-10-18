import type { PolicyReference } from "./policy.js";

export type DecisionOutcome = "APPROVED" | "REJECTED";

export interface Decision {
  readonly decisionId: string;
  readonly intentId: string;
  readonly policy: PolicyReference;
  readonly signals: Record<string, unknown>;
  readonly outcome: DecisionOutcome;
  readonly reason?: string;
  /** Identifier of the Policy rule that matched, or "none". Absent on a Decision built before this field existed. */
  readonly matchedRuleId?: string;
  /** Number of rules evaluated before reaching a match (or exhausting the rule list). */
  readonly evaluatedRules?: number;
  /** Ordered rule-id trace evaluation walked to reach matchedRuleId. */
  readonly matchedPath?: readonly string[];
  readonly evaluatedAt: Date;
}

export type ExecutionStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export type ExecutionMode = "SYNC" | "ASYNC";

export interface Execution {
  readonly executionId: string;
  readonly businessTransactionId: string;
  readonly decision: Decision;
  readonly status: ExecutionStatus;
  readonly mode: ExecutionMode;
  readonly startedAt: Date;
  /** Present only for terminal executions. */
  readonly completedAt?: Date;
  /**
   * businessTransactionId, action, target, parameters, success,
   * executedAt, and an optional attributes bag (e.g. Connector SDK
   * evidence). Left as a generic bag here, same as the real schema
   * (schemas/common/execution.schema.json), not a nested model.
   */
  readonly evidence?: Record<string, unknown>;
  /**
   * Execution-specific metadata. Currently populated with
   * authorizationId when the Execution is APPROVED.
   */
  readonly metadata?: Record<string, unknown>;
}
