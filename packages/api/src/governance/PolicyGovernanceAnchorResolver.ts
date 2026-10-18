import type {
  PolicyGovernanceAnchor,
  PolicyGovernanceAnchorResolver as PolicyGovernanceAnchorResolverInterface,
} from "@parmana/policy";
import type { PolicyChangeCrypto } from "@parmana/crypto";
import type { PolicyChangeApprovalRecordRepository } from "@parmana/shared";

/**
 * Production implementation of PolicyGovernanceAnchorResolver
 * (@parmana/policy). Wired unconditionally into RuntimeEngine
 * (createPolicyGovernanceAnchorResolver.ts) -- unlike
 * PolicyGovernanceExecutionVerifier, which is gated behind
 * POLICY_EXECUTION_VERIFICATION_ENFORCED because a false positive
 * there refuses real executions, this class only ever records what it
 * found. A NO_APPROVAL_RECORD result for every one of this
 * deployment's ten real policies today is the expected, informative
 * answer (see docs/CLAIMS.md §2.26's "Legacy-policy backfill"), not a
 * fail-closed condition to guard against.
 *
 * Performs the identical three checks
 * PolicyGovernanceExecutionVerifier does, in the same order, against
 * the same repository -- deliberately not deduplicated into a shared
 * helper: the two classes have different contracts (throw-shaped
 * violation vs. always-succeeding status) and different blast radii
 * if one has a bug, and RFC-0022's own precedent
 * (SignalStateVerifier/PolicyExecutionVerifier) is to keep
 * enforcement and evidentiary concerns in separate types even when
 * their logic overlaps.
 */
export class PolicyGovernanceAnchorResolver implements PolicyGovernanceAnchorResolverInterface {
  constructor(
    private readonly policyChangeApprovalRecordRepository: PolicyChangeApprovalRecordRepository,
    private readonly policyChangeCrypto: PolicyChangeCrypto,
  ) {}

  async resolve(
    policyName: string,
    policyVersion: string,
    policyContentHash: string,
  ): Promise<PolicyGovernanceAnchor> {
    const record =
      await this.policyChangeApprovalRecordRepository.findMostRecentFor(
        policyName,
        policyVersion,
      );

    if (record === null) {
      return { status: "NO_APPROVAL_RECORD" };
    }

    const signatureValid = await this.policyChangeCrypto.verify(record);

    if (!signatureValid) {
      return {
        status: "SIGNATURE_INVALID",
        approvalRecordId: record.policyChangeApprovalRecordId,
      };
    }

    if (record.contentHashAfter !== policyContentHash) {
      return {
        status: "CONTENT_MISMATCH",
        approvalRecordId: record.policyChangeApprovalRecordId,
      };
    }

    return {
      status: "VERIFIED",
      approvalRecordId: record.policyChangeApprovalRecordId,
    };
  }
}
