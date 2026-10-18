import {
  ApprovalIssuerChangeNotFoundError,
  ConflictError,
  PendingPolicyChangeStatus,
  type ApprovalIssuerChange,
  type ApprovalIssuerRecord,
  type ApprovalIssuerRepository,
} from "@parmana/shared";

function issuerKey(approverId: string, keyId: string): string {
  return `${approverId}\u0000${keyId}`;
}

/**
 * In memory ApprovalIssuerRepository, with the same rules as the
 * Postgres one.
 */
export class MemoryApprovalIssuerRepository implements ApprovalIssuerRepository {
  private readonly issuers = new Map<string, ApprovalIssuerRecord>();
  private readonly changes = new Map<string, ApprovalIssuerChange>();

  async findIssuer(
    approverId: string,
    keyId: string,
  ): Promise<ApprovalIssuerRecord | null> {
    return this.issuers.get(issuerKey(approverId, keyId)) ?? null;
  }

  async listIssuers(): Promise<readonly ApprovalIssuerRecord[]> {
    return [...this.issuers.values()];
  }

  async createChange(
    change: ApprovalIssuerChange,
  ): Promise<ApprovalIssuerChange> {
    for (const existing of this.changes.values()) {
      if (
        existing.status === PendingPolicyChangeStatus.PENDING_APPROVAL &&
        existing.approverId === change.approverId &&
        existing.keyId === change.keyId
      ) {
        throw pendingConflict(change);
      }
    }

    this.changes.set(change.changeId, change);

    return change;
  }

  async findChange(changeId: string): Promise<ApprovalIssuerChange | null> {
    return this.changes.get(changeId) ?? null;
  }

  async listChanges(
    status?: ApprovalIssuerChange["status"],
  ): Promise<readonly ApprovalIssuerChange[]> {
    const all = [...this.changes.values()];

    return status === undefined
      ? all
      : all.filter((change) => change.status === status);
  }

  async approveChange(
    changeId: string,
    approvedBy: string,
    at: Date,
  ): Promise<ApprovalIssuerChange> {
    const change = this.pending(changeId);
    const key = issuerKey(change.approverId, change.keyId);
    const current = this.issuers.get(key);

    if (change.action === "add") {
      if (current !== undefined) {
        throw alreadyExists(change);
      }

      this.issuers.set(key, {
        approverId: change.approverId,
        keyId: change.keyId,
        publicKeyPem: change.publicKeyPem ?? "",
        revoked: false,
        addedByChangeId: change.changeId,
        addedAt: at,
      });
    } else {
      if (current === undefined || current.revoked) {
        throw notRevocable(change);
      }

      this.issuers.set(key, {
        ...current,
        revoked: true,
        revokedByChangeId: change.changeId,
        revokedAt: at,
      });
    }

    const resolved: ApprovalIssuerChange = {
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
  ): Promise<ApprovalIssuerChange> {
    const change = this.pending(changeId);

    const resolved: ApprovalIssuerChange = {
      ...change,
      status: PendingPolicyChangeStatus.REJECTED,
      resolvedBy: rejectedBy,
      resolvedAt: at,
      rejectionReason,
    };

    this.changes.set(changeId, resolved);

    return resolved;
  }

  private pending(changeId: string): ApprovalIssuerChange {
    const change = this.changes.get(changeId);

    if (change === undefined) {
      throw new ApprovalIssuerChangeNotFoundError(changeId);
    }

    if (change.status !== PendingPolicyChangeStatus.PENDING_APPROVAL) {
      throw alreadyResolved(change);
    }

    return change;
  }
}

export function pendingConflict(change: ApprovalIssuerChange): ConflictError {
  return new ConflictError(
    `A change for approver '${change.approverId}' key '${change.keyId}' is already pending. ` +
      "It must be approved or rejected first.",
  );
}

export function alreadyResolved(change: ApprovalIssuerChange): ConflictError {
  return new ConflictError(
    `Approver change '${change.changeId}' is already ${change.status}.`,
  );
}

export function alreadyExists(change: ApprovalIssuerChange): ConflictError {
  return new ConflictError(
    `Approver '${change.approverId}' key '${change.keyId}' already exists. Use a new key id to add a new key.`,
  );
}

export function notRevocable(change: ApprovalIssuerChange): ConflictError {
  return new ConflictError(
    `Approver '${change.approverId}' key '${change.keyId}' is not an active key added through approver changes.`,
  );
}
