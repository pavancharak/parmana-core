export interface PolicyReference {
  /**
   * Policy identifier.
   */
  readonly name: string;

  /**
   * Business policy version.
   */
  readonly version: string;

  /**
   * Policy schema version.
   */
  readonly schemaVersion: string;

  /**
   * sha256 of the canonicalized policy.json content actually loaded
   * for this decision (G-24 remediation). Optional and caller-
   * unsettable: a request-supplied PolicyReference never carries this
   * -- it is computed by RuntimeEngine from the real loaded Policy
   * document, after policyRouter.load, and merged into the copy of
   * this reference embedded in ExecutionTrustRecord.transaction.policy
   * only. Lets a later audit confirm exactly which policy *content*
   * (not merely which version string) was in force for a specific
   * past decision, closing the gap where an in-place edit to an
   * existing version's file (see VERIFICATION-GAPS.md G-24's own
   * precedent for this) would otherwise be undetectable from the
   * trust record alone.
   */
  readonly contentHash?: string;

  /**
   * Whether the policy content above is traceable to a completed
   * Policy Governance approval, resolved at decision time
   * (docs/VERIFICATION-GAPS.md G-45). Same provenance and optionality
   * as contentHash: computed by RuntimeEngine, from the real loaded
   * Policy document, merged only into the copy of this reference
   * embedded in ExecutionTrustRecord.transaction.policy -- never
   * caller-settable, absent on a Decision built before this field
   * existed. Unlike contentHash, this is resolved unconditionally
   * (PolicyGovernanceAnchorResolver never blocks execution), so its
   * presence does not imply POLICY_EXECUTION_VERIFICATION_ENFORCED is
   * on -- only that the lookup itself ran and recorded what it found,
   * which may honestly be "no approval record exists for this policy
   * yet."
   */
  readonly governanceAnchor?: PolicyGovernanceAnchor;
}

/**
 * Mirrors @parmana/policy's PolicyGovernanceAnchor exactly.
 * Duplicated here (not imported) because @parmana/shared sits below
 * @parmana/policy in the dependency graph (policy depends on shared,
 * never the reverse) -- the same constraint PendingPolicyChange's own
 * doc comment explains for JsonValue vs. the real Policy type.
 */
export type PolicyGovernanceAnchorStatus =
  "VERIFIED" | "NO_APPROVAL_RECORD" | "SIGNATURE_INVALID" | "CONTENT_MISMATCH";

export interface PolicyGovernanceAnchor {
  readonly status: PolicyGovernanceAnchorStatus;

  readonly approvalRecordId?: string;
}
