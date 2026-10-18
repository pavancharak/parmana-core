/**
 * @parmana/capability-registry
 *
 * Canonical public API.
 */

export {
  CANONICAL_CAPABILITY_POLICY_BINDINGS,
  CapabilityPolicyBinder,
} from "./CapabilityPolicyBinding.js";
export type {
  CapabilityPolicyBindingViolation,
  CurrentPolicyVersionSource,
  ExternalPolicyBindingSource,
  PolicyInEffect,
} from "./CapabilityPolicyBinding.js";
