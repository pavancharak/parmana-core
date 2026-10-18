import type {
  BusinessSignalSourceChange,
  BusinessSignalSourceRegistration,
} from "../domain/business-signal-source.js";

/**
 * Business signal sources and the changes that register and revoke them
 * (RFC-0023 phase 2). Only approveChange touches registrations, and it
 * applies the change and resolves it in one step. At most one active
 * registration and one pending change exist per name.
 */
export interface BusinessSignalSourceRepository {
  findActive(name: string): Promise<BusinessSignalSourceRegistration | null>;

  listRegistrations(): Promise<readonly BusinessSignalSourceRegistration[]>;

  createChange(
    change: BusinessSignalSourceChange,
  ): Promise<BusinessSignalSourceChange>;

  findChange(changeId: string): Promise<BusinessSignalSourceChange | null>;

  listChanges(
    status?: BusinessSignalSourceChange["status"],
  ): Promise<readonly BusinessSignalSourceChange[]>;

  approveChange(
    changeId: string,
    approvedBy: string,
    at: Date,
  ): Promise<BusinessSignalSourceChange>;

  rejectChange(
    changeId: string,
    rejectedBy: string,
    rejectionReason: string,
    at: Date,
  ): Promise<BusinessSignalSourceChange>;
}
