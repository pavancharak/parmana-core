import {
  PendingPolicyChange,
  PendingPolicyChangeStatus,
} from "../domain/index.js";

import { ConflictError } from "../errors/conflict-error.js";

/**
 * One resolution of an existing PENDING_APPROVAL change. Exactly one
 * of these per `resolve()` call -- mirrors
 * ChallengeRecordAppendOperation's one-operation-at-a-time shape, for
 * the same reason: every mutation should be an explicit, individually
 * reviewable step.
 */
export type PendingPolicyChangeResolution =
  | { readonly outcome: "approved"; readonly resolvedBy: string }
  | {
      readonly outcome: "rejected";
      readonly resolvedBy: string;
      readonly rejectionReason: string;
    };

/**
 * Repository for Pending Policy Changes (Policy Governance,
 * maker-checker).
 */
export interface PendingPolicyChangeRepository {
  /**
   * Creates a new PENDING_APPROVAL change. Throws ConflictError if a
   * PENDING_APPROVAL change already exists for the same (policyName,
   * policyVersion) -- enforced by `assertNoConflictingPendingChange`
   * below, which every implementation should call to keep the check
   * identical across backends (same pattern
   * ChallengeRecordRepository already uses for its own append-only
   * invariants).
   */
  create(change: PendingPolicyChange): Promise<PendingPolicyChange>;

  findById(pendingPolicyChangeId: string): Promise<PendingPolicyChange | null>;

  /**
   * The at-most-one PENDING_APPROVAL change for a given
   * (policyName, policyVersion), or null if none exists.
   */
  findPending(
    policyName: string,
    policyVersion: string,
  ): Promise<PendingPolicyChange | null>;

  /**
   * Lists changes, optionally filtered by status. Omitting `status`
   * returns every change regardless of lifecycle state.
   */
  list(
    status?: PendingPolicyChangeStatus,
  ): Promise<readonly PendingPolicyChange[]>;

  /**
   * Resolves an existing PENDING_APPROVAL change to APPROVED or
   * REJECTED. Throws PendingPolicyChangeNotFoundError if no change
   * exists for the given id, or ConflictError if the change is not
   * currently PENDING_APPROVAL (see `applyPendingPolicyChangeResolution`,
   * which every implementation should route through).
   *
   * Does NOT enforce maker != checker -- that check requires the
   * resolving caller's own verified identity, which only the API/auth
   * layer has. This method resolves whatever `resolvedBy` it is
   * given.
   */
  resolve(
    pendingPolicyChangeId: string,
    resolution: PendingPolicyChangeResolution,
  ): Promise<PendingPolicyChange>;
}

/**
 * Pure, backend-independent enforcement of the "exactly one
 * PENDING_APPROVAL per (policyName, policyVersion)" invariant.
 * Implementations call this with whatever PENDING_APPROVAL change (if
 * any) they already found for the target (policyName, policyVersion)
 * before inserting the new one.
 */
export function assertNoConflictingPendingChange(
  policyName: string,
  policyVersion: string,
  existingPending: PendingPolicyChange | null,
): void {
  if (existingPending === null) {
    return;
  }

  throw new ConflictError(
    `A PENDING_APPROVAL change already exists for policy '${policyName}' version ` +
      `'${policyVersion}' (pendingPolicyChangeId '${existingPending.pendingPolicyChangeId}'). ` +
      "It must be approved or rejected before a new proposal against the same policy " +
      "version can be created.",
  );
}

/**
 * Pure, backend-independent enforcement of
 * PendingPolicyChangeRepository.resolve's transition rule: only a
 * PENDING_APPROVAL change may be resolved, and only into a terminal
 * state, exactly once.
 */
export function applyPendingPolicyChangeResolution(
  existing: PendingPolicyChange,
  resolution: PendingPolicyChangeResolution,
  resolvedAt: Date,
): PendingPolicyChange {
  if (existing.status !== PendingPolicyChangeStatus.PENDING_APPROVAL) {
    throw new ConflictError(
      `Pending Policy Change '${existing.pendingPolicyChangeId}' is already ` +
        `'${existing.status}' -- only a PENDING_APPROVAL change can be approved or rejected.`,
    );
  }

  if (resolution.outcome === "approved") {
    return {
      ...existing,
      status: PendingPolicyChangeStatus.APPROVED,
      resolvedBy: resolution.resolvedBy,
      resolvedAt,
    };
  }

  return {
    ...existing,
    status: PendingPolicyChangeStatus.REJECTED,
    resolvedBy: resolution.resolvedBy,
    resolvedAt,
    rejectionReason: resolution.rejectionReason,
  };
}
