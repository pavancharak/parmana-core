/**
 * One reason a policy was refused execution-time verification.
 */
export interface PolicyExecutionViolation {
  readonly reason: string;
}

/**
 * Verifies, at the moment a policy is about to be evaluated, that the
 * policy itself is legitimate under Policy Governance (maker-checker)
 * -- distinct from PolicyEngine.evaluate(), which evaluates *rules
 * within* an already-trusted policy document and has no concept of
 * approval records at all.
 *
 * Optional by design, the same idiom as SignalStateVerifier and
 * CapabilityPolicyBinder: RuntimeEngine treats an unconfigured
 * verifier as "not enforced" (current behavior, unchanged), never as
 * "verification passed." A concrete implementation
 * (PolicyGovernanceExecutionVerifier, packages/api/src/governance)
 * checks the policy's most recent PolicyChangeApprovalRecord -- that
 * one exists at all, that its signature verifies, and that the live
 * content actually being evaluated matches it -- so a policy that
 * predates Policy Governance, or was edited outside its approval API,
 * or has a tampered approval record, can be refused *before* any rule
 * in it is ever evaluated, rather than only detected later by a
 * separate deploy-time scan.
 */
export interface PolicyExecutionVerifier {
  /**
   * Returns the violation found, or undefined when the policy is
   * clean -- the same undefined-means-clean shape
   * CapabilityPolicyBinder.findViolation uses.
   */
  verify(
    policyName: string,
    policyVersion: string,
    policyContentHash: string,
  ): Promise<PolicyExecutionViolation | undefined>;
}
