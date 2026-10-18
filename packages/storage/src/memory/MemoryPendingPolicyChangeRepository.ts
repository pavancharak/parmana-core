import {
  applyPendingPolicyChangeResolution,
  assertNoConflictingPendingChange,
  PendingPolicyChange,
  PendingPolicyChangeNotFoundError,
  PendingPolicyChangeRepository,
  PendingPolicyChangeResolution,
  PendingPolicyChangeStatus,
} from "@parmana/shared";

/**
 * In-memory Pending Policy Change repository (Policy Governance,
 * maker-checker). Mirrors MemoryChallengeRecordRepository's shape:
 * routes every mutation through the shared package's pure
 * enforcement functions so this backend and SupabasePendingPolicyChangeRepository
 * (a later addition) apply identical invariants.
 */
export class MemoryPendingPolicyChangeRepository implements PendingPolicyChangeRepository {
  private readonly changes = new Map<string, PendingPolicyChange>();

  async create(change: PendingPolicyChange): Promise<PendingPolicyChange> {
    const existingPending = await this.findPending(
      change.policyName,
      change.policyVersion,
    );

    assertNoConflictingPendingChange(
      change.policyName,
      change.policyVersion,
      existingPending,
    );

    this.changes.set(change.pendingPolicyChangeId, change);

    return change;
  }

  async findById(
    pendingPolicyChangeId: string,
  ): Promise<PendingPolicyChange | null> {
    return this.changes.get(pendingPolicyChangeId) ?? null;
  }

  async findPending(
    policyName: string,
    policyVersion: string,
  ): Promise<PendingPolicyChange | null> {
    for (const change of this.changes.values()) {
      if (
        change.policyName === policyName &&
        change.policyVersion === policyVersion &&
        change.status === PendingPolicyChangeStatus.PENDING_APPROVAL
      ) {
        return change;
      }
    }

    return null;
  }

  async list(
    status?: PendingPolicyChangeStatus,
  ): Promise<readonly PendingPolicyChange[]> {
    const all = [...this.changes.values()];

    if (status === undefined) {
      return all;
    }

    return all.filter((change) => change.status === status);
  }

  async resolve(
    pendingPolicyChangeId: string,
    resolution: PendingPolicyChangeResolution,
  ): Promise<PendingPolicyChange> {
    const existing = this.changes.get(pendingPolicyChangeId);

    if (!existing) {
      throw new PendingPolicyChangeNotFoundError(pendingPolicyChangeId);
    }

    const updated = applyPendingPolicyChangeResolution(
      existing,
      resolution,
      new Date(),
    );

    this.changes.set(pendingPolicyChangeId, updated);

    return updated;
  }
}
