/**
 * Canonical actions defined by policy rules.
 *
 * These values are authored inside policy definitions.
 * They are interpreted by PolicyEngine to produce a
 * PolicyOutcome.
 */
export enum PolicyAction {
  APPROVE = "approve",

  REJECT = "reject",
}
