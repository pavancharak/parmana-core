import type { PolicySignals } from "./PolicySignals.js";

export interface ExecutionRecord {
  executionId: string;

  policyId: string;
  policyVersion: string;

  input: PolicySignals;

  matchedRuleId: string;

  action: "approve" | "reject" | "override";

  reason: string;

  trace: {
    evaluatedRules: number;
    matchedPath: string[];
  };

  hash: string;

  timestamp: number;
}
