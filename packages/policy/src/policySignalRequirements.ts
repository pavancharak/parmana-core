import type {
  ApprovalSignalDeclaration,
  Policy,
  PolicyCondition,
  SignalSourceDeclaration,
} from "./types/Policy.js";

/**
 * Every fact any rule condition of the policy reads, sorted.
 */
export function collectReferencedFacts(policy: Policy): string[] {
  const referenced = new Set<string>();

  const walk = (condition: PolicyCondition): void => {
    if ("fact" in condition) {
      referenced.add(condition.fact);
      return;
    }

    if ("all" in condition) {
      condition.all.forEach(walk);
      return;
    }

    if ("any" in condition) {
      condition.any.forEach(walk);
    }
  };

  for (const rule of policy.rules) {
    walk(rule.condition);
  }

  return Array.from(referenced).sort();
}

/**
 * What a caller must send for a policy, without its rules: which facts
 * the rules read, their declared types, which facts must equal a value
 * of the Intent, and which need a signed approval and what that approval
 * names. Returned by GET /policies/in-effect so an agent can build a
 * request from the server's answer instead of from a copy of the policy.
 * Rule conditions are deliberately left out.
 */
export interface PolicySignalRequirements {
  readonly facts: readonly string[];
  readonly schema: Readonly<Record<string, string>>;
  readonly bound: Readonly<Record<string, string>>;
  readonly approval: Readonly<Record<string, ApprovalSignalDeclaration>>;
  /**
   * Facts Parmana asks a business system for itself (RFC-0023). Present
   * only when the policy declares any. A caller need not send them; a
   * value it sends that differs from the source's is refused.
   */
  readonly sourced?: Readonly<Record<string, SignalSourceDeclaration>>;
}

export function describePolicySignalRequirements(
  policy: Policy,
): PolicySignalRequirements {
  return {
    facts: collectReferencedFacts(policy),
    schema: { ...(policy.signalsSchema ?? {}) },
    bound: { ...(policy.boundSignals ?? {}) },
    approval: { ...(policy.approvalSignals ?? {}) },
    ...(policy.signalSources !== undefined && {
      sourced: { ...policy.signalSources },
    }),
  };
}
