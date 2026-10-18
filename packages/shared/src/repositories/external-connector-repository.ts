import type {
  ExternalConnectorChange,
  ExternalConnectorRegistration,
} from "../domain/external-connector.js";

/**
 * External connectors registered through maker checker, and the
 * changes that register or revoke them (ADR-0013).
 */
export interface ExternalConnectorRepository {
  /**
   * The active registration for a capability, or null.
   */
  findActive(capability: string): Promise<ExternalConnectorRegistration | null>;

  /**
   * Every registration, active and revoked.
   */
  listRegistrations(): Promise<readonly ExternalConnectorRegistration[]>;

  /**
   * Stores a new PENDING_APPROVAL change. Throws ConflictError when
   * another change for the same capability is still pending.
   */
  createChange(
    change: ExternalConnectorChange,
  ): Promise<ExternalConnectorChange>;

  findChange(changeId: string): Promise<ExternalConnectorChange | null>;

  listChanges(
    status?: ExternalConnectorChange["status"],
  ): Promise<readonly ExternalConnectorChange[]>;

  /**
   * Resolves a pending change to APPROVED and applies it, in one step:
   * register adds an active registration, revoke marks the active one
   * revoked. Throws ExternalConnectorChangeNotFoundError for an unknown
   * id, and ConflictError when the change is no longer pending, the
   * capability to register already has an active registration, or the
   * capability to revoke has none. Nothing is written when it throws.
   */
  approveChange(
    changeId: string,
    approvedBy: string,
    at: Date,
  ): Promise<ExternalConnectorChange>;

  /**
   * Resolves a pending change to REJECTED. Throws as approveChange does
   * for an unknown or already resolved change.
   */
  rejectChange(
    changeId: string,
    rejectedBy: string,
    rejectionReason: string,
    at: Date,
  ): Promise<ExternalConnectorChange>;
}
