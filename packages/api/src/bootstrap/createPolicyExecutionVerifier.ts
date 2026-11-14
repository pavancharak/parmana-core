import type { PolicyExecutionVerifier } from "@parmana/policy";
import { PolicyChangeCrypto } from "@parmana/crypto";

import { policyChangeApprovalRecordRepository } from "../repositories.js";
import { PolicyGovernanceExecutionVerifier } from "../governance/PolicyGovernanceExecutionVerifier.js";

/**
 * Policy Governance execution-time verification is ON in every environment
 * and fails closed: no policy authorizes or releases an execution without a
 * PolicyChangeApprovalRecord whose signature verifies and whose
 * contentHashAfter equals the live policy content hash.
 *
 * No environment variable and no NODE_ENV value turns it off (D19,
 * docs/assurance/POLICY_BINDING_RAZORPAY.md section 17). A deployment
 * must have a signed approval record for every policy it executes
 * (maker-checker approval, or scripts/backfill-legacy-policy-approvals.ts
 * --apply) before executions under that policy are accepted.
 */
export function createPolicyExecutionVerifier(): PolicyExecutionVerifier {
  return new PolicyGovernanceExecutionVerifier(
    policyChangeApprovalRecordRepository,
    new PolicyChangeCrypto(),
  );
}
