import { CryptoBootstrap, TrustRecordHasher } from "@parmana/crypto";
import {
  POLICY_EVALUATION_METHOD,
  PolicyEngine,
  PolicyOutcome,
} from "@parmana/policy";
import type { Policy } from "@parmana/policy";
import type { Decision, JsonValue } from "@parmana/shared";

/**
 * Re-runs a stored decision against its method, to check the verdict (R3).
 *
 * The verdict is recomputable only when the record and the policy supply everything the method
 * needs. Anything it cannot establish is reported as unverifiable with a reason, never as a pass:
 *
 * - no_evaluation_method: the decision predates the method being recorded.
 * - unsupported_method: the decision names a method or version this engine does not implement, so
 *   this engine cannot say what it would have produced.
 * - no_policy_content_hash: the decision does not pin the policy's content.
 * - policy_content_mismatch: the policy supplied is not the one the decision was made under.
 *
 * Otherwise the result is reproduced, or differs with the fields that differ named.
 */
export type DecisionReplay =
  | { readonly status: "reproduced" }
  | { readonly status: "differs"; readonly differences: readonly string[] }
  | {
      readonly status: "unverifiable";
      readonly reason:
        | "no_evaluation_method"
        | "unsupported_method"
        | "no_policy_content_hash"
        | "policy_content_mismatch";
    };

const EXPECTED_OUTCOME: Record<string, PolicyOutcome> = {
  APPROVED: PolicyOutcome.APPROVE,
  REJECTED: PolicyOutcome.REJECT,
};

/**
 * Re-runs the method a stored decision names, on the signals it was decided on (its `signals`
 * merged with its `trustedValues`, exactly as the runtime merged them), and compares the result.
 */
export async function replayStoredDecision(
  decision: Decision,
  policy: Policy,
): Promise<DecisionReplay> {
  const method = decision.evaluationMethod;

  if (method === undefined) {
    return { status: "unverifiable", reason: "no_evaluation_method" };
  }

  if (
    method.id !== POLICY_EVALUATION_METHOD.id ||
    method.version !== POLICY_EVALUATION_METHOD.version
  ) {
    return { status: "unverifiable", reason: "unsupported_method" };
  }

  const expectedHash = decision.policy.contentHash;

  if (expectedHash === undefined) {
    return { status: "unverifiable", reason: "no_policy_content_hash" };
  }

  const hasher = new TrustRecordHasher(CryptoBootstrap.create());

  if ((await hasher.hash(policy)) !== expectedHash) {
    return { status: "unverifiable", reason: "policy_content_mismatch" };
  }

  const signals: Record<string, JsonValue> = {
    ...decision.signals,
    ...(decision.trustedValues ?? {}),
  };

  const replayed = new PolicyEngine().evaluate(policy, signals);

  const differences: string[] = [];

  if (EXPECTED_OUTCOME[decision.outcome] !== replayed.outcome) {
    differences.push("outcome");
  }

  if (decision.matchedRuleId !== replayed.matchedRuleId) {
    differences.push("matchedRuleId");
  }

  if (
    JSON.stringify(decision.matchedPath ?? []) !==
    JSON.stringify(replayed.matchedPath)
  ) {
    differences.push("matchedPath");
  }

  if (decision.reason !== replayed.reason) {
    differences.push("reason");
  }

  // Evidence is compared only when the record carries it. A decision recorded before evidence was
  // recorded is not reported as differing on a field it never had.
  if (
    decision.evidence !== undefined &&
    JSON.stringify(decision.evidence) !== JSON.stringify(replayed.evidence)
  ) {
    differences.push("evidence");
  }

  return differences.length === 0
    ? { status: "reproduced" }
    : { status: "differs", differences };
}
