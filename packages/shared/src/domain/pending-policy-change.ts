import type { JsonValue } from "../types/Json.js";

/**
 * Pending Policy Change (Policy Governance, maker-checker).
 *
 * Parmana previously took no position on who may author or change a
 * policy document -- the early design documents (removed 2026-09-28)
 * all named policy authoring as external to Parmana's scope. This
 * type is the first artifact of that scope changing: a proposed
 * change to an existing policy's content, held in a durable pending
 * state until a second, distinct human explicitly approves or
 * rejects it. Nothing in this file writes to `policies/` directly --
 * see PendingPolicyChangeRepository and the service that resolves an
 * approval into a filesystem write and a signed
 * PolicyChangeApprovalRecord.
 *
 * `proposedContent` is deliberately typed as JsonValue, not
 * `@parmana/policy`'s `Policy` type: `@parmana/shared` sits below
 * `@parmana/policy` in the dependency graph (policy depends on
 * shared, never the reverse), so this package cannot reference that
 * type without an import cycle. Structural validation against the
 * Policy schema (PolicyValidator) happens one layer up, before a
 * PendingPolicyChange is ever created -- this type only guarantees
 * "some JSON was proposed," never "the JSON is a valid policy."
 */
export interface PendingPolicyChange {
  /**
   * Unique Pending Policy Change identifier.
   */
  readonly pendingPolicyChangeId: string;

  /**
   * The policy this proposal targets -- same identifier as
   * `Policy.policyId` / `PolicyReference.name`.
   */
  readonly policyName: string;

  /**
   * The existing version this proposal is a change against ("the
   * version being replaced"). Not necessarily distinct from
   * `proposedContent`'s own declared version: an in-place content
   * patch to an existing version number, and a proposal that
   * introduces a new version number, are both legitimate --
   * VERIFICATION-GAPS.md's G-24 entry records an in-place patch to an
   * existing policy version as accepted precedent elsewhere in this
   * codebase. The resolving service derives the actual write target
   * from `proposedContent.policyVersion`, not from this field.
   */
  readonly policyVersion: string;

  /**
   * The full proposed policy.json content, in its entirety -- not a
   * diff or patch. Compared against the current file's content (by
   * the resolving service, via GET .../pending-changes' diff view and
   * PolicyChangeApprovalRecord.contentHashBefore/After) rather than
   * modeled as an edit script here.
   */
  readonly proposedContent: JsonValue;

  /**
   * Identity of the proposer (maker). Must be a human-authenticated
   * (AuthorityType.USER) caller -- enforced at the API layer, before
   * a PendingPolicyChange is ever constructed; this type has no way
   * to verify that claim on its own.
   */
  readonly proposedBy: string;

  /**
   * UTC timestamp when the change was proposed.
   */
  readonly proposedAt: Date;

  /**
   * Lifecycle status. Only ever moves from PENDING_APPROVAL to
   * APPROVED or REJECTED, exactly once -- never back to
   * PENDING_APPROVAL, never from one terminal state to the other. See
   * PendingPolicyChangeRepository.resolve, which enforces this.
   */
  readonly status: PendingPolicyChangeStatus;

  /**
   * Free-text justification from the proposer. Required at creation
   * -- a policy change with no stated reason gives a checker nothing
   * to evaluate.
   */
  readonly reason: string;

  /**
   * Identity of the resolver (checker). Absent while PENDING_APPROVAL.
   * MUST NOT equal `proposedBy` -- enforced at the API layer
   * (SameActorCannotApproveOwnChangeError), not by this type or its
   * repository, since only the caller-auth layer knows the resolving
   * caller's verified identity.
   */
  readonly resolvedBy?: string;

  /**
   * UTC timestamp when the change was approved or rejected. Absent
   * while PENDING_APPROVAL.
   */
  readonly resolvedAt?: Date;

  /**
   * Required free-text reason when status is REJECTED. Absent
   * otherwise -- approval needs no rejection reason, and a rejection
   * with no stated reason gives the proposer nothing to act on.
   */
  readonly rejectionReason?: string;
}

/**
 * Fixed lifecycle vocabulary, matching the SCREAMING_SNAKE style
 * already used by this codebase's other enum-like domain fields
 * (AuthorityType, DecisionOutcome).
 */
export enum PendingPolicyChangeStatus {
  PENDING_APPROVAL = "PENDING_APPROVAL",

  APPROVED = "APPROVED",

  REJECTED = "REJECTED",
}
