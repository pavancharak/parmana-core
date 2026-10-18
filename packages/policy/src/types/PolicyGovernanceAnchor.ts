/**
 * The result of resolving a policy's governance provenance at decision
 * time -- distinct from PolicyExecutionVerifier, which performs the
 * identical three checks but only to decide ALLOW/REJECT and is
 * gated behind POLICY_EXECUTION_VERIFICATION_ENFORCED (see that
 * type's own doc comment). PolicyGovernanceAnchorResolver never
 * blocks execution; it only records what it found, always, so an
 * auditor examining a signed ExecutionTrustRecord can tell -- without
 * needing enforcement to have been turned on -- whether the policy
 * content that decision was made under is traceable to a governance
 * approval, and if not, exactly why not.
 *
 * docs/VERIFICATION-GAPS.md G-45: the policy-governance chain
 * (G-24/§2.27/PolicyGovernanceExecutionVerifier) already binds Record
 * 1 (governance approval) to Record 2 (the decision) as an
 * enforcement gate, but a passing check left no artifact of its own
 * -- only a failure (an ordinary policy rejection) was durably
 * recorded. This type is that missing positive-pass artifact.
 */
export type PolicyGovernanceAnchorStatus =
  "VERIFIED" | "NO_APPROVAL_RECORD" | "SIGNATURE_INVALID" | "CONTENT_MISMATCH";

export interface PolicyGovernanceAnchor {
  readonly status: PolicyGovernanceAnchorStatus;

  /**
   * The PolicyChangeApprovalRecord this anchor resolved against.
   * Present only when a record was found at all (status is VERIFIED,
   * SIGNATURE_INVALID, or CONTENT_MISMATCH) -- absent for
   * NO_APPROVAL_RECORD, since there is nothing to identify.
   */
  readonly approvalRecordId?: string;
}

/**
 * Resolves a policy's most recent PolicyChangeApprovalRecord against
 * the content actually being evaluated, purely for evidentiary
 * purposes. Never throws, never blocks execution, and unlike
 * PolicyExecutionVerifier is safe to wire unconditionally in every
 * deployment (createPolicyGovernanceAnchorResolver.ts, packages/api):
 * a NO_APPROVAL_RECORD result is expected and informative today, for
 * every one of this deployment's real policies, not evidence of a
 * misconfiguration to fail closed on.
 */
export interface PolicyGovernanceAnchorResolver {
  resolve(
    policyName: string,
    policyVersion: string,
    policyContentHash: string,
  ): Promise<PolicyGovernanceAnchor>;
}
