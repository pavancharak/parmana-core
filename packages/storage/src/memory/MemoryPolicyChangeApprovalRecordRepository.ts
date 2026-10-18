import {
  ConflictError,
  PolicyChangeApprovalRecord,
  PolicyChangeApprovalRecordRepository,
} from "@parmana/shared";

/**
 * In-memory Policy Change Approval Record repository (Policy
 * Governance, maker-checker). Append-only: create() inserts or refuses,
 * never overwrites -- there is no update path in the interface.
 */
export class MemoryPolicyChangeApprovalRecordRepository implements PolicyChangeApprovalRecordRepository {
  private readonly records = new Map<string, PolicyChangeApprovalRecord>();

  /**
   * At most one record per pending change, like the Postgres unique
   * index on pending_policy_change_id. The check and the insert run
   * with no await between them, so concurrent calls cannot both pass.
   */
  async create(
    record: PolicyChangeApprovalRecord,
  ): Promise<PolicyChangeApprovalRecord> {
    for (const existing of this.records.values()) {
      if (existing.pendingPolicyChangeId === record.pendingPolicyChangeId) {
        throw new ConflictError(
          `Pending Policy Change '${record.pendingPolicyChangeId}' already ` +
            "has an approval record -- it was approved concurrently or " +
            "already resolved.",
        );
      }
    }

    this.records.set(record.policyChangeApprovalRecordId, record);

    return record;
  }

  async findById(
    policyChangeApprovalRecordId: string,
  ): Promise<PolicyChangeApprovalRecord | null> {
    return this.records.get(policyChangeApprovalRecordId) ?? null;
  }

  async findByPendingPolicyChangeId(
    pendingPolicyChangeId: string,
  ): Promise<PolicyChangeApprovalRecord | null> {
    const matches = [...this.records.values()].filter(
      (record) => record.pendingPolicyChangeId === pendingPolicyChangeId,
    );

    if (matches.length === 0) {
      return null;
    }

    return matches.reduce((mostRecent, candidate) =>
      candidate.approvedAt > mostRecent.approvedAt ? candidate : mostRecent,
    );
  }

  async list(): Promise<readonly PolicyChangeApprovalRecord[]> {
    return [...this.records.values()];
  }

  async findMostRecentFor(
    policyName: string,
    policyVersion: string,
  ): Promise<PolicyChangeApprovalRecord | null> {
    const matches = [...this.records.values()].filter(
      (record) =>
        record.policyName === policyName &&
        record.policyVersion === policyVersion,
    );

    if (matches.length === 0) {
      return null;
    }

    return matches.reduce((mostRecent, candidate) =>
      candidate.approvedAt > mostRecent.approvedAt ? candidate : mostRecent,
    );
  }

  async findMostRecentForName(
    policyName: string,
  ): Promise<PolicyChangeApprovalRecord | null> {
    const matches = [...this.records.values()].filter(
      (record) => record.policyName === policyName,
    );

    if (matches.length === 0) {
      return null;
    }

    return matches.reduce((mostRecent, candidate) =>
      candidate.approvedAt > mostRecent.approvedAt ? candidate : mostRecent,
    );
  }
}
