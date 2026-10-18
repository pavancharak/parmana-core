import { PolicyChangeApprovalRecord } from "../domain/index.js";

/**
 * Repository for Policy Change Approval Records (Policy Governance,
 * maker-checker). Append-only and immutable, same discipline as
 * ExecutionTrustRecordRepository: a record is created exactly once,
 * at approval time, and never updated.
 */
export interface PolicyChangeApprovalRecordRepository {
  create(
    record: PolicyChangeApprovalRecord,
  ): Promise<PolicyChangeApprovalRecord>;

  findById(
    policyChangeApprovalRecordId: string,
  ): Promise<PolicyChangeApprovalRecord | null>;

  list(): Promise<readonly PolicyChangeApprovalRecord[]>;

  /**
   * The approval record written for a pending change (the most recent
   * one, if a pending change approved before 2026-10-03 has two), or
   * null if none exists yet. Lets a retry after a partial failure reuse
   * the record its first attempt wrote, instead of signing another.
   */
  findByPendingPolicyChangeId(
    pendingPolicyChangeId: string,
  ): Promise<PolicyChangeApprovalRecord | null>;

  /**
   * The most recent approval record for a given (policyName,
   * policyVersion), or null if that policy version has never been
   * through this repository's approval flow (e.g. it predates Policy
   * Governance, or was seeded directly). This is what a later
   * startup/deploy integrity check compares the live
   * policies/{name}/{version}/policy.json content against, to detect
   * a file edited outside the pending-change API -- a bypass of
   * governance, not merely an unusual but legitimate path.
   */
  findMostRecentFor(
    policyName: string,
    policyVersion: string,
  ): Promise<PolicyChangeApprovalRecord | null>;

  /**
   * The most recent approval record for a policy name, across all its
   * versions (latest approvedAt), or null if no version of it was ever
   * approved. Its policyVersion is the version currently in effect for
   * that name (G-66): approving a version makes it current, and
   * approving an older version again rolls back to it.
   */
  findMostRecentForName(
    policyName: string,
  ): Promise<PolicyChangeApprovalRecord | null>;
}
