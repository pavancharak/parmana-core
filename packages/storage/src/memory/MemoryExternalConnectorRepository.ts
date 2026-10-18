import {
  ConflictError,
  ExternalConnectorChangeNotFoundError,
  PendingPolicyChangeStatus,
  type ExternalConnectorChange,
  type ExternalConnectorRegistration,
  type ExternalConnectorRepository,
} from "@parmana/shared";

/**
 * In memory ExternalConnectorRepository, with the same rules as the
 * Postgres one.
 */
export class MemoryExternalConnectorRepository implements ExternalConnectorRepository {
  private readonly registrations = new Map<
    string,
    ExternalConnectorRegistration
  >();
  private readonly changes = new Map<string, ExternalConnectorChange>();

  async findActive(
    capability: string,
  ): Promise<ExternalConnectorRegistration | null> {
    for (const registration of this.registrations.values()) {
      if (
        registration.capability === capability &&
        registration.status === "active"
      ) {
        return registration;
      }
    }

    return null;
  }

  async listRegistrations(): Promise<readonly ExternalConnectorRegistration[]> {
    return [...this.registrations.values()];
  }

  async createChange(
    change: ExternalConnectorChange,
  ): Promise<ExternalConnectorChange> {
    for (const existing of this.changes.values()) {
      if (
        existing.status === PendingPolicyChangeStatus.PENDING_APPROVAL &&
        existing.capability === change.capability
      ) {
        throw externalConnectorPendingConflict(change);
      }
    }

    this.changes.set(change.changeId, change);

    return change;
  }

  async findChange(changeId: string): Promise<ExternalConnectorChange | null> {
    return this.changes.get(changeId) ?? null;
  }

  async listChanges(
    status?: ExternalConnectorChange["status"],
  ): Promise<readonly ExternalConnectorChange[]> {
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
  ): Promise<ExternalConnectorChange> {
    const change = this.pending(changeId);
    const current = await this.findActive(change.capability);

    if (change.action === "register") {
      if (current !== null) {
        throw externalConnectorAlreadyActive(change);
      }

      this.registrations.set(change.changeId, {
        registrationId: change.changeId,
        capability: change.capability,
        endpointUrl: change.endpointUrl ?? "",
        policy: change.policy ?? "",
        allowedParameters: change.allowedParameters ?? [],
        timeoutMs: change.timeoutMs ?? 0,
        status: "active",
        registeredAt: at,
      });
    } else {
      if (current === null) {
        throw externalConnectorNotActive(change);
      }

      this.registrations.set(current.registrationId, {
        ...current,
        status: "revoked",
        revokedByChangeId: change.changeId,
        revokedAt: at,
      });
    }

    const resolved: ExternalConnectorChange = {
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
  ): Promise<ExternalConnectorChange> {
    const change = this.pending(changeId);

    const resolved: ExternalConnectorChange = {
      ...change,
      status: PendingPolicyChangeStatus.REJECTED,
      resolvedBy: rejectedBy,
      resolvedAt: at,
      rejectionReason,
    };

    this.changes.set(changeId, resolved);

    return resolved;
  }

  private pending(changeId: string): ExternalConnectorChange {
    const change = this.changes.get(changeId);

    if (change === undefined) {
      throw new ExternalConnectorChangeNotFoundError(changeId);
    }

    if (change.status !== PendingPolicyChangeStatus.PENDING_APPROVAL) {
      throw externalConnectorAlreadyResolved(change);
    }

    return change;
  }
}

export function externalConnectorPendingConflict(
  change: ExternalConnectorChange,
): ConflictError {
  return new ConflictError(
    `A change for capability '${change.capability}' is already pending. ` +
      "It must be approved or rejected first.",
  );
}

export function externalConnectorAlreadyResolved(
  change: ExternalConnectorChange,
): ConflictError {
  return new ConflictError(
    `External connector change '${change.changeId}' is already ${change.status}.`,
  );
}

export function externalConnectorAlreadyActive(
  change: ExternalConnectorChange,
): ConflictError {
  return new ConflictError(
    `Capability '${change.capability}' already has an active external connector. Revoke it first.`,
  );
}

export function externalConnectorNotActive(
  change: ExternalConnectorChange,
): ConflictError {
  return new ConflictError(
    `Capability '${change.capability}' has no active external connector.`,
  );
}
