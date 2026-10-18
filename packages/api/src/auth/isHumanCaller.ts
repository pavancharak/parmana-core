import { AuthorityType } from "@parmana/shared";

/**
 * Decides whether an authenticated caller's credential was
 * provisioned as belonging to a verified human (AuthorityType.USER).
 *
 * Deliberately narrow: called only from the four
 * pending-policy-changes.ts handlers (propose, list, approve,
 * reject), the one place this codebase discriminates by actor type.
 * Not wired into caller-auth.ts middleware globally, and not touching
 * RuntimeEngine/PolicyEngine/ExecutionGate or execute.ts/
 * transactions.ts — the core execution pipeline's actor-agnostic
 * behavior stays untouched.
 *
 * Fail-closed default, matching isPrincipalAllowed/isCapabilityAllowed:
 * an undefined credentialHolderType (a key provisioned before this
 * field existed, or never given an opinion on it) is treated as "not
 * verified," never "assume human." Only an exact AuthorityType.USER
 * match returns true — ROLE, SERVICE, and ORGANIZATION credentials are
 * all denied the same as an unset one.
 */
export function isHumanCaller(
  credentialHolderType: AuthorityType | undefined,
): boolean {
  return credentialHolderType === AuthorityType.USER;
}
