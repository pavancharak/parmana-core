import {
  BusinessSignalSourceChangeNotFoundError,
  ConflictError,
  PendingPolicyChangeStatus,
  type BusinessSignalSourceChange,
  type BusinessSignalSourceRegistration,
  type BusinessSignalSourceRepository,
} from "@parmana/shared";

/**
 * In memory business signal sources (RFC-0023 phase 2), with the same
 * rules the Postgres repository enforces: one pending change and one
 * active registration per name, and only a pending change resolves.
 */
export class MemoryBusinessSignalSourceRepository implements BusinessSignalSourceRepository {
  private readonly registrations = new Map<
    string,
    BusinessSignalSourceRegistration
  >();
  private readonly changes = new Map<string, BusinessSignalSourceChange>();

  async findActive(
    name: string,
  ): Promise<BusinessSignalSourceRegistration | null> {
    for (const registration of this.registrations.values()) {
      if (registration.name === name && registration.status === "active") {
        return registration;
      }
    }

    return null;
  }

  async listRegistrations(): Promise<
    readonly BusinessSignalSourceRegistration[]
  > {
    return [...this.registrations.values()];
  }

  async createChange(
    change: BusinessSignalSourceChange,
  ): Promise<BusinessSignalSourceChange> {
    for (const existing of this.changes.values()) {
      if (
        existing.status === PendingPolicyChangeStatus.PENDING_APPROVAL &&
        existing.name === change.name
      ) {
        throw businessSignalSourcePendingConflict(change);
      }
    }

    this.changes.set(change.changeId, change);

    return change;
  }

  async findChange(
    changeId: string,
  ): Promise<BusinessSignalSourceChange | null> {
    return this.changes.get(changeId) ?? null;
  }

  async listChanges(
    status?: BusinessSignalSourceChange["status"],
  ): Promise<readonly BusinessSignalSourceChange[]> {
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
  ): Promise<BusinessSignalSourceChange> {
    const change = this.pending(changeId);
    const current = await this.findActive(change.name);

    if (change.action === "register") {
      if (current !== null) {
        throw businessSignalSourceAlreadyActive(change);
      }

      this.registrations.set(change.changeId, {
        registrationId: change.changeId,
        name: change.name,
        endpointUrl: change.endpointUrl ?? "",
        timeoutMs: change.timeoutMs ?? 0,
        ...(change.publicKeyPem !== undefined && {
          publicKeyPem: change.publicKeyPem,
        }),
        ...(change.keyId !== undefined && { keyId: change.keyId }),
        status: "active",
        registeredAt: at,
      });
    } else {
      if (current === null) {
        throw businessSignalSourceNotActive(change);
      }

      this.registrations.set(current.registrationId, {
        ...current,
        status: "revoked",
        revokedByChangeId: change.changeId,
        revokedAt: at,
      });
    }

    const resolved: BusinessSignalSourceChange = {
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
  ): Promise<BusinessSignalSourceChange> {
    const change = this.pending(changeId);

    const resolved: BusinessSignalSourceChange = {
      ...change,
      status: PendingPolicyChangeStatus.REJECTED,
      resolvedBy: rejectedBy,
      resolvedAt: at,
      rejectionReason,
    };

    this.changes.set(changeId, resolved);

    return resolved;
  }

  private pending(changeId: string): BusinessSignalSourceChange {
    const change = this.changes.get(changeId);

    if (change === undefined) {
      throw new BusinessSignalSourceChangeNotFoundError(changeId);
    }

    if (change.status !== PendingPolicyChangeStatus.PENDING_APPROVAL) {
      throw businessSignalSourceAlreadyResolved(change);
    }

    return change;
  }
}

export function businessSignalSourcePendingConflict(
  change: BusinessSignalSourceChange,
): ConflictError {
  return new ConflictError(
    `A change for business signal source '${change.name}' is already pending. ` +
      "It must be approved or rejected first.",
  );
}

export function businessSignalSourceAlreadyResolved(
  change: BusinessSignalSourceChange,
): ConflictError {
  return new ConflictError(
    `Business signal source change '${change.changeId}' is already ${change.status}.`,
  );
}

export function businessSignalSourceAlreadyActive(
  change: BusinessSignalSourceChange,
): ConflictError {
  return new ConflictError(
    `Business signal source '${change.name}' is already registered. Revoke it first.`,
  );
}

export function businessSignalSourceNotActive(
  change: BusinessSignalSourceChange,
): ConflictError {
  return new ConflictError(
    `Business signal source '${change.name}' is not registered.`,
  );
}
