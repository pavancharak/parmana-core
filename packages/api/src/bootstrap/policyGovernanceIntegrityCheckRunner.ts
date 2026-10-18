import { PolicyChangeCrypto } from "@parmana/crypto";

import { policyRepository } from "../application.js";
import { policyChangeApprovalRecordRepository } from "../repositories.js";
import { verifyPolicyGovernanceIntegrityAtStartup } from "../governance/verifyPolicyGovernanceIntegrityAtStartup.js";

function logUnexpectedFailure(error: unknown): void {
  console.error({
    event: "policy_governance_integrity_check_unexpected_failure",
    error: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Fires one run of the Policy Governance integrity check (see
 * verifyPolicyGovernanceIntegrityAtStartup.ts) without awaiting it.
 * Shared by the one-time startup call
 * (verifyPolicyGovernanceIntegrityAtStartup.ts) and the periodic
 * scheduler (schedulePolicyGovernanceIntegrityCheck.ts) so both go
 * through the exact same construction and fail-open error handling --
 * see verifyPolicyGovernanceIntegrityAtStartup.ts's own doc comment
 * for why the try/catch here has to wrap construction, not just the
 * returned promise.
 */
export function runPolicyGovernanceIntegrityCheckOnce(): void {
  try {
    verifyPolicyGovernanceIntegrityAtStartup({
      policyRepository,
      policyChangeCrypto: new PolicyChangeCrypto(),
      policyChangeApprovalRecordRepository,
    }).catch(logUnexpectedFailure);
  } catch (error) {
    logUnexpectedFailure(error);
  }
}
