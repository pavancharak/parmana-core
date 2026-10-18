import { policyGovernanceRelaxed } from "./policyGovernanceRelaxed.js";
import type { CurrentPolicyVersionSource } from "@parmana/policy";

import { policyChangeApprovalRecordRepository } from "../repositories.js";
import { GovernedPolicyVersionSource } from "../governance/GovernedPolicyVersionSource.js";

/**
 * Where a bound capability's policy version comes from (G-66).
 *
 * The same rule as createPolicyExecutionVerifier.ts, on purpose: where
 * policy governance is enforced (everywhere except NODE_ENV test and
 * development, unless POLICY_EXECUTION_VERIFICATION_ENFORCED is "true"),
 * the version in effect is the one most recently approved for the name.
 * Elsewhere this returns undefined and the version written in
 * CANONICAL_CAPABILITY_POLICY_BINDINGS applies, since there are no
 * approvals to take it from.
 */
export function createCurrentPolicyVersionSource():
  CurrentPolicyVersionSource | undefined {
  if (policyGovernanceRelaxed()) {
    return undefined;
  }

  return new GovernedPolicyVersionSource(policyChangeApprovalRecordRepository);
}
