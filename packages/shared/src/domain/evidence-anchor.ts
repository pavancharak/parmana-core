import type { PolicyGovernanceAnchorStatus } from "./policy-reference.js";

/**
 * The binding artifact the 2026-09-15 evidence anchor audit's
 * GAP-4 finding named as missing, closing its residual "Record 3 is
 * outside all three [policy-governance] mechanisms" gap
 * (docs/VERIFICATION-GAPS.md G-45's "Remaining, not attempted this
 * session" note).
 *
 * Not a NEW cryptographic guarantee -- policyContentHash,
 * governanceAnchor, and connector evidence were already bound together
 * implicitly, since all three sit inside the same ExecutionTrustRecord
 * that trustRecordHash/signature already cover in full. What this adds
 * is a single, explicitly-named, independently-computed pointer an
 * auditor can check WITHOUT already knowing to reach into
 * transaction.policy and executions[].evidence.attributes.connector
 * separately and reconstruct the binding themselves -- the exact
 * "here's proof they're linked" artifact the originating gap audit
 * asked whether one existed.
 *
 * Absent when there is nothing to anchor at all (no policyContentHash,
 * no governanceAnchor, no connectorEvidenceHash -- should not occur for
 * any real ExecutionTrustRecord, since G-24 always stamps
 * policyContentHash, but the type stays honest rather than assuming).
 */
export interface EvidenceAnchor {
  /**
   * Copied from transaction.policy.contentHash (G-24). Present on
   * every real ExecutionTrustRecord.
   */
  readonly policyContentHash?: string;

  /**
   * Copied from transaction.policy.governanceAnchor.status (G-45).
   * Absent only when no PolicyGovernanceAnchorResolver was configured
   * for this deployment -- not the same as NO_APPROVAL_RECORD, which
   * is a real, present status meaning the resolver ran and found
   * nothing.
   */
  readonly governanceAnchorStatus?: PolicyGovernanceAnchorStatus;

  /**
   * Copied from executions[0].evidence.attributes.connector.connectorEvidenceHash,
   * when a real connector executed. Absent for a policy with no
   * connector registered, or when Execution never reached the point of
   * attaching connector evidence.
   */
  readonly connectorEvidenceHash?: string;

  /**
   * sha256 of the canonicalized {policyContentHash, governanceAnchorStatus,
   * connectorEvidenceHash} above -- the explicit binding value. Computed
   * with the same TrustRecordHasher every other artifact hash in this
   * codebase uses.
   */
  readonly anchorHash: string;
}
