import type { CurrentPolicyVersionSource } from "@parmana/policy";

import { policyChangeApprovalRecordRepository } from "../repositories.js";
import { GovernedPolicyVersionSource } from "../governance/GovernedPolicyVersionSource.js";

/**
 * Where a bound capability's policy version comes from (G-66).
 *
 * The version in effect is the one most recently approved for the policy
 * name, in every environment. There is no fallback to the version written
 * in CANONICAL_CAPABILITY_POLICY_BINDINGS, and no environment setting turns
 * this off. A bound capability with no approved version is refused
 * (D18, docs/assurance/POLICY_BINDING_RAZORPAY.md section 15).
 */
export function createCurrentPolicyVersionSource(): CurrentPolicyVersionSource {
  return new GovernedPolicyVersionSource(policyChangeApprovalRecordRepository);
}
