/**
 * Decides whether an authenticated caller may invoke a given
 * capability (Business Transaction intent.action) at all.
 *
 * Without this check, capability-based routing/policy binding
 * (CapabilityPolicyBinder, PolicyEngine) is entirely caller-agnostic
 * by design — any authenticated caller can trigger any registered
 * capability. This closes that gap at the identity boundary, the
 * same layer isPrincipalAllowed.ts already enforces
 * authority.principalId scope at.
 *
 * Fail-closed default, the opposite of isPrincipalAllowed's default:
 * an unset or empty allowedCapabilities denies every capability.
 * There is no meaningful "may invoke its own capability" fallback
 * the way "may only assert itself" is for principals — an
 * unconfigured key proves identity but is authorized to invoke
 * nothing until explicitly granted.
 *
 * The literal string "*" as an included entry is an explicit,
 * auditable wildcard: every capability is allowed. It is never an
 * implicit default — only ever a deliberate, visible grant in
 * configuration.
 */
export function isCapabilityAllowed(
  action: string | undefined,
  allowedCapabilities: readonly string[] | undefined,
): boolean {
  if (!action) {
    return false;
  }

  if (!allowedCapabilities || allowedCapabilities.length === 0) {
    return false;
  }

  if (allowedCapabilities.includes("*")) {
    return true;
  }

  return allowedCapabilities.includes(action);
}
