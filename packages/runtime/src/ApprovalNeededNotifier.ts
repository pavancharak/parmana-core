import {
  PolicyOutcome,
  type Policy,
  type PolicyEngine,
  type PolicySignals,
} from "@parmana/policy";

/**
 * One approval a refused request is waiting for: the approval backed
 * signal, and what the approver must sign for, read from the Intent at
 * the paths the policy's approvalSignals declare.
 */
export interface NeededApproval {
  readonly signal: string;
  readonly resourceId: string | undefined;
  readonly value?: number;
}

/**
 * Sent when a request was refused and a signed approval would have
 * authorized it. Carries what the approver needs to decide and sign,
 * not the request's other parameters or signals.
 */
export interface ApprovalNeededEvent {
  readonly type: "approval.needed";
  readonly occurredAt: string;
  readonly businessTransactionId: string;
  readonly decisionId: string;
  readonly action: string;
  readonly target: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly reason: string | undefined;
  readonly submittedBy?: string;
  readonly approvals: readonly NeededApproval[];
}

/**
 * Tells a person that a refused request is waiting for their approval.
 * Best effort: RuntimeEngine never lets a failure here change, delay
 * past a bounded wait, or undo the refusal itself.
 */
export interface ApprovalNeededNotifier {
  notify(event: ApprovalNeededEvent): Promise<void>;
}

function resolveIntentPath(
  intent: { readonly target: string; readonly parameters: unknown },
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, intent);
}

/**
 * The approvals a refused request is waiting for, or undefined when an
 * approval would not help. A request is waiting for approval when the
 * policy declares approvalSignals, and evaluating the same policy with
 * every declared approval signal set to true approves it: the refusal
 * then comes only from the missing (or unverified) approval, not from
 * another rule such as a failed fraud check.
 */
export function findNeededApprovals(
  policyEngine: PolicyEngine,
  policy: Policy,
  signals: PolicySignals,
  intent: { readonly target: string; readonly parameters: unknown },
): readonly NeededApproval[] | undefined {
  const declarations = policy.approvalSignals;

  if (declarations === undefined || Object.keys(declarations).length === 0) {
    return undefined;
  }

  const entries = Object.entries(declarations).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  const approved: PolicySignals = { ...signals };

  for (const [key] of entries) {
    approved[key] = true;
  }

  if (
    policyEngine.evaluate(policy, approved).outcome !== PolicyOutcome.APPROVE
  ) {
    return undefined;
  }

  return entries.map(([signal, declaration]) => {
    const resource = resolveIntentPath(intent, declaration.resourceId);
    const value =
      declaration.value !== undefined
        ? resolveIntentPath(intent, declaration.value)
        : undefined;

    return {
      signal,
      resourceId:
        typeof resource === "string" || typeof resource === "number"
          ? String(resource)
          : undefined,
      ...(typeof value === "number" && Number.isFinite(value) ? { value } : {}),
    };
  });
}
