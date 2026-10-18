import {
  AuthorityGrantChangeNotFoundError,
  ConflictError,
  PendingPolicyChangeStatus,
  type AuthorityGrant,
  type AuthorityGrantChange,
  type AuthorityGrantRepository,
} from "@parmana/shared";

/**
 * In memory authority grants (RFC-0023 phase 3), with the same rules the
 * Postgres repository enforces: one pending change and one active grant
 * per caller and capability, and only a pending change resolves.
 */
export class MemoryAuthorityGrantRepository implements AuthorityGrantRepository {
  private readonly grants = new Map<string, AuthorityGrant>();
  private readonly changes = new Map<string, AuthorityGrantChange>();

  async findActive(
    callerId: string,
    capability: string,
  ): Promise<AuthorityGrant | null> {
    for (const grant of this.grants.values()) {
      if (
        grant.callerId === callerId &&
        grant.capability === capability &&
        grant.status === "active"
      ) {
        return grant;
      }
    }

    return null;
  }

  async listGrants(): Promise<readonly AuthorityGrant[]> {
    return [...this.grants.values()];
  }

  async createChange(
    change: AuthorityGrantChange,
  ): Promise<AuthorityGrantChange> {
    for (const existing of this.changes.values()) {
      if (
        existing.status === PendingPolicyChangeStatus.PENDING_APPROVAL &&
        existing.callerId === change.callerId &&
        existing.capability === change.capability
      ) {
        throw authorityGrantPendingConflict(change);
      }
    }

    this.changes.set(change.changeId, change);

    return change;
  }

  async findChange(changeId: string): Promise<AuthorityGrantChange | null> {
    return this.changes.get(changeId) ?? null;
  }

  async listChanges(
    status?: AuthorityGrantChange["status"],
  ): Promise<readonly AuthorityGrantChange[]> {
    // Newest first, as the Postgres repository orders them.
    const all = [...this.changes.values()].reverse();

    return status === undefined
      ? all
      : all.filter((change) => change.status === status);
  }

  async approveChange(
    changeId: string,
    approvedBy: string,
    at: Date,
  ): Promise<AuthorityGrantChange> {
    const change = this.pending(changeId);
    const current = await this.findActive(change.callerId, change.capability);

    if (change.action === "grant") {
      if (current !== null) {
        throw authorityGrantAlreadyActive(change);
      }

      this.grants.set(change.changeId, {
        grantId: change.changeId,
        callerId: change.callerId,
        capability: change.capability,
        ...(change.limits !== undefined && { limits: change.limits }),
        validFrom: change.validFrom ?? at,
        validUntil: change.validUntil ?? at,
        status: "active",
        grantedAt: at,
      });
    } else {
      if (current === null) {
        throw authorityGrantNotActive(change);
      }

      this.grants.set(current.grantId, {
        ...current,
        status: "revoked",
        revokedByChangeId: change.changeId,
        revokedAt: at,
      });
    }

    const resolved: AuthorityGrantChange = {
      ...change,
      status: PendingPolicyChangeStatus.APPROVED,
      resolvedBy: approvedBy,
      resolvedAt: at,
    };

    this.changes.set(changeId, resolved);

    return resolved;
  }

  async rejectChange(
    changeId: string,
    rejectedBy: string,
    rejectionReason: string,
    at: Date,
  ): Promise<AuthorityGrantChange> {
    const change = this.pending(changeId);

    const resolved: AuthorityGrantChange = {
      ...change,
      status: PendingPolicyChangeStatus.REJECTED,
      resolvedBy: rejectedBy,
      resolvedAt: at,
      rejectionReason,
    };

    this.changes.set(changeId, resolved);

    return resolved;
  }

  private pending(changeId: string): AuthorityGrantChange {
    const change = this.changes.get(changeId);

    if (change === undefined) {
      throw new AuthorityGrantChangeNotFoundError(changeId);
    }

    if (change.status !== PendingPolicyChangeStatus.PENDING_APPROVAL) {
      throw authorityGrantAlreadyResolved(change);
    }

    return change;
  }
}

export function authorityGrantPendingConflict(
  change: AuthorityGrantChange,
): ConflictError {
  return new ConflictError(
    `A change for the authority of '${change.callerId}' over '${change.capability}' is already pending. ` +
      "It must be approved or rejected first.",
  );
}

export function authorityGrantAlreadyResolved(
  change: AuthorityGrantChange,
): ConflictError {
  return new ConflictError(
    `Authority grant change '${change.changeId}' is already ${change.status}.`,
  );
}

export function authorityGrantAlreadyActive(
  change: AuthorityGrantChange,
): ConflictError {
  return new ConflictError(
    `'${change.callerId}' already holds a grant for '${change.capability}'. Revoke it first.`,
  );
}

export function authorityGrantNotActive(
  change: AuthorityGrantChange,
): ConflictError {
  return new ConflictError(
    `'${change.callerId}' holds no grant for '${change.capability}'.`,
  );
}
