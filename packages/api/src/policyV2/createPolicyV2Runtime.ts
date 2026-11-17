import { policyV2 } from "@parmana/policy";
import { PostgresPoolFactory } from "@parmana/storage";

import { assertDatabaseUrlConfigured } from "../bootstrap/assertDatabaseUrlConfigured.js";

import { PolicyV2DecisionService } from "./policyV2Decisions.js";
import { PolicyV2RegisterService } from "./policyV2Register.js";

export interface PolicyV2Runtime {
  readonly decisions: PolicyV2DecisionService;
  readonly register: PolicyV2RegisterService;
}

/**
 * Builds the policy version 2 runtime from the environment. Off unless
 * PARMANA_POLICY_V2_DECISIONS is "true". When it is on, PARMANA_POLICY_V2_CAPABILITIES names the
 * capabilities that accept decisions, and the database must be configured. The register's write
 * path is on whenever the runtime is on.
 */
export function createPolicyV2Runtime(
  env: NodeJS.ProcessEnv = process.env,
): PolicyV2Runtime | undefined {
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

  assertDatabaseUrlConfigured("PolicyV2");
  const pool = PostgresPoolFactory.create();
  const store = new policyV2.persistence.PolicyV2Store(pool);

  const decisions = new PolicyV2DecisionService({
    store,
    enabledCapabilities: new Set(capabilities),
    // No approved policy versions exist yet, so every capability refuses. Policy approval is not built.
    policies: () => undefined,
    // No source integration is connected, so sourced values refuse as unavailable.
    sources: async () => {
      throw new Error("No source integration is connected.");
    },
    nonces: new policyV2.persistence.PolicyV2NonceStore(pool),
  });

  const register = new PolicyV2RegisterService({ state: store });

  return { decisions, register };
}

/**
 * Sets up the first Parmana owner from PARMANA_POLICY_V2_BOOTSTRAP_OWNER. It takes effect only
 * while the register has no owner, so setting it again later changes nothing. Returns true if
 * an owner was set up by this call.
 */
export async function bootstrapPolicyV2Owner(
  runtime: PolicyV2Runtime,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const owner = env.PARMANA_POLICY_V2_BOOTSTRAP_OWNER?.trim();
  if (owner === undefined || owner === "") return false;
  return runtime.register.bootstrapOwner(owner);
}
