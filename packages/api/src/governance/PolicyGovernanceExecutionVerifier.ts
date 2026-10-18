import type {
  PolicyExecutionVerifier,
  PolicyExecutionViolation,
} from "@parmana/policy";
import type { PolicyChangeCrypto } from "@parmana/crypto";
import type { PolicyChangeApprovalRecordRepository } from "@parmana/shared";

/**
 * Production implementation of PolicyExecutionVerifier (@parmana/policy).
 * Wired into RuntimeEngine only when POLICY_EXECUTION_VERIFICATION_ENFORCED
 * is enabled (see createPolicyExecutionVerifier.ts) -- when it is, no
 * policy executes without a PolicyChangeApprovalRecord whose signature
 * verifies and whose contentHashAfter matches the content actually
 * being evaluated.
 *
 * Reuses exactly the same three checks
 * verifyPolicyGovernanceIntegrityAtStartup.ts already performs for
 * every governed policy on an interval -- this class performs them
 * for one policy, synchronously, in the request path, at the moment
 * that specific policy is about to be evaluated, rather than
 * discovering a bypass up to 5 minutes (or a full deploy cycle) after
 * the fact.
 */
export class PolicyGovernanceExecutionVerifier implements PolicyExecutionVerifier {
  constructor(
    private readonly policyChangeApprovalRecordRepository: PolicyChangeApprovalRecordRepository,
    private readonly policyChangeCrypto: PolicyChangeCrypto,
  ) {}

  async verify(
    policyName: string,
    policyVersion: string,
    policyContentHash: string,
  ): Promise<PolicyExecutionViolation | undefined> {
    const record =
      await this.policyChangeApprovalRecordRepository.findMostRecentFor(
        policyName,
        policyVersion,
      );

    if (record === null) {
      return {
        reason:
          `policy "${policyName}"@"${policyVersion}" has no PolicyChangeApprovalRecord -- ` +
          "it has never completed the Policy Governance approval flow",
      };
    }

    const signatureValid = await this.policyChangeCrypto.verify(record);

    if (!signatureValid) {
      return {
        reason:
          `policy "${policyName}"@"${policyVersion}"'s most recent approval record's ` +
          "signature does not verify -- possible tampering with the approval record itself",
      };
    }

    if (record.contentHashAfter !== policyContentHash) {
      return {
        reason:
          `policy "${policyName}"@"${policyVersion}"'s live content does not match its ` +
          "most recent approval record's contentHashAfter -- edited outside the governed " +
          "approval flow",
      };
    }

    //
    // G-74: approving a new version of a policy retires the older ones,
    // for every policy, not only those bound to a connector capability
    // (G-66). Otherwise a caller could keep naming an older, still
    // approved version whose rules a newer approval replaced. Approving
    // an older version again makes it the current one (a rollback).
    //
    const latest =
      await this.policyChangeApprovalRecordRepository.findMostRecentForName(
        policyName,
      );

    if (latest !== null && latest.policyVersion !== policyVersion) {
      return {
        reason:
          `policy "${policyName}"@"${policyVersion}" was superseded: the version in effect ` +
          `is "${latest.policyVersion}", the one most recently approved`,
      };
    }

    return undefined;
  }
}
