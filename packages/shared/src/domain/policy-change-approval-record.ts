import type { Signature } from "./signature.js";

/**
 * Policy Change Approval Record (Policy Governance, maker-checker).
 *
 * Durable, signed, permanent evidence that a specific human (checker)
 * approved a specific human's (maker) proposed change to a specific
 * policy's content -- created exactly once, at the moment a
 * PendingPolicyChange is approved. Rejections produce no record of
 * this type; a rejected PendingPolicyChange (with its
 * rejectionReason) is itself the evidence a rejection leaves behind.
 *
 * Signed with the same signing mechanism, key, and canonicalization
 * as ExecutionTrustRecord (see PolicyChangeCrypto in @parmana/crypto,
 * which reuses VerificationCrypto's own CryptoBootstrap/
 * FileKeyProvider/ArtifactSigner rather than a separate signer) --
 * this is deliberately the same trust root, not a parallel one.
 *
 * `contentHashBefore`/`contentHashAfter` are sha256 hashes (via the
 * same CanonicalSerializer + SHA256HashProvider pair every other hash
 * in this codebase uses) of the canonicalized policy JSON immediately
 * before and after this approval -- the G-24 remediation's content-
 * addressed evidence, so a later audit can confirm exactly what
 * content this approval covered, not merely which version string.
 */
export interface PolicyChangeApprovalRecord {
  /**
   * Unique Policy Change Approval Record identifier.
   */
  readonly policyChangeApprovalRecordId: string;

  /**
   * The PendingPolicyChange this record resolves.
   */
  readonly pendingPolicyChangeId: string;

  readonly policyName: string;

  /**
   * The version this approval put into force -- the write target
   * derived from the approved proposal's own
   * `proposedContent.policyVersion`, which may or may not equal the
   * PendingPolicyChange's `policyVersion` ("the version being
   * replaced"). See PendingPolicyChange's own doc comment.
   */
  readonly policyVersion: string;

  readonly proposedBy: string;

  readonly approvedBy: string;

  readonly proposedAt: Date;

  readonly approvedAt: Date;

  /**
   * sha256 of the canonicalized content at the write target path
   * immediately before this approval was applied. Absent (rather
   * than a sentinel value) only for a proposal whose target path had
   * no existing file -- a genuinely new version, not a replacement.
   */
  readonly contentHashBefore?: string;

  /**
   * sha256 of the canonicalized `proposedContent` that was written.
   * Always present -- an approval always has content it approved.
   */
  readonly contentHashAfter: string;

  /**
   * sha256 of the canonicalized *prior* approval record for this same
   * (policyName, policyVersion) -- i.e. of the full record returned
   * by PolicyChangeApprovalRecordRepository.findMostRecentFor at the
   * moment this record was created, computed the same way
   * contentHashAfter is (PolicyChangeCrypto.hashPolicyContent).
   * Absent only for the first approval ever recorded for this
   * (policyName, policyVersion) pair. Included in this record's own
   * signed payload (see PolicyChangeCrypto.canonicalRecord), so a
   * later attempt to delete, reorder, or substitute a record in the
   * approval-record store -- as opposed to editing the live
   * policy.json, which contentHashAfter alone already detects -- is
   * independently detectable by re-deriving the chain.
   */
  readonly previousRecordHash?: string;

  /**
   * Signature over the canonical serialization of this record (every
   * field above, excluding this field itself) -- see
   * PolicyChangeCrypto.
   */
  readonly signature: Signature;
}
