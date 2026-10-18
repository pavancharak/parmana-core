/**
 * Parmana Policy Reference.
 *
 * Versioned policy reference.
 */

export type PolicyGovernanceAnchorStatus =
  "VERIFIED" | "NO_APPROVAL_RECORD" | "SIGNATURE_INVALID" | "CONTENT_MISMATCH";

export interface PolicyGovernanceAnchor {
  readonly status: PolicyGovernanceAnchorStatus;

  readonly approvalRecordId?: string;
}

export interface PolicyReference {
  readonly name: string;

  readonly version: string;

  readonly schemaVersion: string;

  /**
   * sha256 of the canonicalized policy.json content actually loaded for
   * this decision (G-24). Server-computed, never caller-settable; absent
   * on a PolicyReference built before this field existed.
   */
  readonly contentHash?: string;

  /**
   * Whether the policy content above is traceable to a completed Policy
   * Governance approval, resolved at decision time (G-45). Absent on a
   * PolicyReference built before this field existed. Its presence does
   * not imply enforcement was on -- only that the lookup ran and
   * recorded what it found, which may honestly be "no approval record
   * exists for this policy yet."
   */
  readonly governanceAnchor?: PolicyGovernanceAnchor;
}
