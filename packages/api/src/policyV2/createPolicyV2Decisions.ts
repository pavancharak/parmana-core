import { policyV2 } from "@parmana/policy";
import { PostgresPoolFactory } from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "../bootstrap/assertDatabaseUrlConfigured.js";

import { PolicyV2DecisionService } from "./policyV2Decisions.js";

/**
 * Builds the policy version 2 decision service from the environment. Off unless
 * PARMANA_POLICY_V2_DECISIONS is "true". When it is on, PARMANA_POLICY_V2_CAPABILITIES names the
 * capabilities that accept decisions, and the database must be configured.
 */
export function createPolicyV2Decisions(
  env: NodeJS.ProcessEnv = process.env,
): PolicyV2DecisionService | undefined {
  const flag = env.PARMANA_POLICY_V2_DECISIONS;
  if (flag === undefined || flag.trim() === "" || flag === "false") {
    return undefined;
  }
  if (flag !== "true") {
    throw new Error(
      `PARMANA_POLICY_V2_DECISIONS must be "true" or "false", got "${flag}".`,
    );
  }

  const capabilities = (env.PARMANA_POLICY_V2_CAPABILITIES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");
  if (capabilities.length === 0) {
    throw new Error(
      "PARMANA_POLICY_V2_CAPABILITIES must name at least one capability when policy version 2 decisions are on.",
    );
  }

  assertDatabaseUrlConfigured("PolicyV2Decisions");
  const store = new policyV2.persistence.PolicyV2Store(
    PostgresPoolFactory.create(),
  );

  return new PolicyV2DecisionService({
    store,
    enabledCapabilities: new Set(capabilities),
    // No approved policy versions exist yet, so every capability refuses. Policy approval is not built.
    policies: () => undefined,
    // No source integration is connected, so sourced values refuse as unavailable.
    sources: async () => {
      throw new Error("No source integration is connected.");
    },
    approvers: new policyV2.approvals.ApproverKeys(),
  });
}
