/**
 * Canonical outcomes produced by PolicyEngine.
 *
 * Policy outcomes describe the result of deterministic
 * policy evaluation. They do NOT authorize execution.
 */
export enum PolicyOutcome {
  APPROVE = "APPROVE",

  REJECT = "REJECT",
}
