import type { PolicyGovernanceAnchorResolver } from "@parmana/policy";
import { PolicyChangeCrypto } from "@parmana/crypto";

import { policyChangeApprovalRecordRepository } from "../repositories.js";
import { PolicyGovernanceAnchorResolver as ConcretePolicyGovernanceAnchorResolver } from "../governance/PolicyGovernanceAnchorResolver.js";

/**
 * Unlike createPolicyExecutionVerifier.ts's sibling, this is wired
 * unconditionally, in every environment -- no env-var gate. Resolving
 * a governance anchor never blocks or rejects execution (see
 * PolicyGovernanceAnchorResolver's own doc comment), so there is no
 * outage risk the way there is for POLICY_EXECUTION_VERIFICATION_ENFORCED:
 * a NO_APPROVAL_RECORD result today, for every one of this
 * deployment's real policies, is simply recorded as the evidentiary
 * fact it is (docs/VERIFICATION-GAPS.md G-45).
 */
export function createPolicyGovernanceAnchorResolver(): PolicyGovernanceAnchorResolver {
  return new ConcretePolicyGovernanceAnchorResolver(
    policyChangeApprovalRecordRepository,
    new PolicyChangeCrypto(),
  );
}
