import type { CurrentPolicyVersionSource } from "@parmana/policy";
import type { PolicyChangeApprovalRecordRepository } from "@parmana/shared";

/**
 * The version in effect for a policy name is the one most recently
 * approved through policy governance (G-66): approving 1.1.0 makes it
 * current, and approving 1.0.0 again rolls back to it. No deploy.
 *
 * Reads only the approval record's policyVersion. The record itself is
 * verified afterwards, on the same request, by
 * PolicyGovernanceExecutionVerifier (signature, content hash) and again
 * by the Execution Gateway, so a record changed in the database outside
 * the API makes the request fail, not pass.
 */
export class GovernedPolicyVersionSource implements CurrentPolicyVersionSource {
  constructor(
    private readonly approvalRecords: PolicyChangeApprovalRecordRepository,
  ) {}

  async currentVersion(policyName: string): Promise<string | undefined> {
    const record = await this.approvalRecords.findMostRecentForName(policyName);

    return record?.policyVersion;
  }
}
