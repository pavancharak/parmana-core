/**
 * @parmana/policy
 *
 * Canonical public API.
 */

// -----------------------------------------------------------------------------
// Engine
// -----------------------------------------------------------------------------

export { PolicyEngine } from "./PolicyEngine.js";
export { SignalIntentBinder } from "./SignalIntentBinder.js";
export type {
  IntentSnapshot,
  SignalIntentBindingViolation,
} from "./SignalIntentBinder.js";

export type {
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "./types/SignalStateVerifier.js";

export { CompositeSignalStateVerifier } from "./CompositeSignalStateVerifier.js";

export type {
  PolicyExecutionVerifier,
  PolicyExecutionViolation,
} from "./types/PolicyExecutionVerifier.js";

export type {
  PolicyGovernanceAnchor,
  PolicyGovernanceAnchorResolver,
  PolicyGovernanceAnchorStatus,
} from "./types/PolicyGovernanceAnchor.js";

export {
  CANONICAL_CAPABILITY_POLICY_BINDINGS,
  CapabilityPolicyBinder,
} from "@parmana/capability-registry";
export type {
  CapabilityPolicyBindingViolation,
  CurrentPolicyVersionSource,
  ExternalPolicyBindingSource,
  PolicyInEffect,
} from "@parmana/capability-registry";

// -----------------------------------------------------------------------------
// Routing & Registry
// -----------------------------------------------------------------------------

export { PolicyRegistry } from "./PolicyRegistry.js";
export { PolicyRouter } from "./PolicyRouter.js";

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export {
  DEFAULT_APPROVAL_ARTIFACT_SIGNAL,
  PolicyValidator,
} from "./PolicyValidator.js";
export type { RuleConflictWarning } from "./PolicyValidator.js";

// -----------------------------------------------------------------------------
// Repositories
// -----------------------------------------------------------------------------

export type { PolicyRepository } from "./PolicyRepository.js";
export { FilePolicyRepository } from "./FilePolicyRepository.js";
export { SupabasePolicyRepository } from "./SupabasePolicyRepository.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type {
  ApprovalSignalDeclaration,
  SignalSourceDeclaration,
  Policy,
  PolicyCondition,
  PolicyInput,
  PolicyRule,
  PolicyRuleOutcome,
} from "./types/Policy.js";

export type { PolicySignals } from "./types/PolicySignals.js";

export {
  collectReferencedFacts,
  describePolicySignalRequirements,
} from "./policySignalRequirements.js";
export type { PolicySignalRequirements } from "./policySignalRequirements.js";

export type { PolicyDecision } from "./types/PolicyDecision.js";

export { PolicyAction } from "./types/PolicyAction.js";

export { PolicyOutcome } from "./types/PolicyOutcome.js";

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export * from "./errors/index.js";
export {
  findSignalTypeViolations,
  SIGNAL_TYPES,
  type SignalType,
  type SignalTypeViolation,
} from "./signalTypes.js";
