import { describe, expect, it } from "vitest";

import { CryptoBootstrap, TrustRecordHasher } from "@parmana/crypto";
import { POLICY_EVALUATION_METHOD, PolicyEngine } from "@parmana/policy";
import type { Policy, PolicySignals } from "@parmana/policy";
import type { Decision, JsonValue } from "@parmana/shared";

import { replayStoredDecision } from "../../src/DecisionReplay.js";

/**
 * R3, re-run. A stored decision is checked by re-running the method it names, on the signals it
 * was decided on. Anything that cannot be established is unverifiable, never a pass.
 */

const hasher = new TrustRecordHasher(CryptoBootstrap.create());

const fact = (name: string, operator: string, value?: unknown) =>
  ({
    fact: name,
    operator,
    value,
  }) as unknown as Policy["rules"][number]["condition"];

const policy = {
  policyId: "refund",
  policyVersion: "1.0.0",
  schemaVersion: "1.0",
  rules: [
    {
      id: "reject-high-risk",
      condition: fact("risk_score", "gt", 70),
      outcome: { action: "reject", reason: "high risk" },
    },
    {
      id: "approve-inr",
      condition: fact("currency", "eq", "INR"),
      outcome: { action: "approve", reason: "inr" },
    },
  ],
} as unknown as Policy;

const otherPolicy = {
  ...policy,
  rules: [
    {
      id: "approve-all",
      condition: { always: true },
      outcome: { action: "approve", reason: "all" },
    },
  ],
} as unknown as Policy;

/** Builds the decision the runtime would record for this policy and signals. */
async function recordedDecision(
  signals: Record<string, JsonValue>,
  trustedValues?: Record<string, JsonValue>,
): Promise<Decision> {
  const evaluated = { ...signals, ...(trustedValues ?? {}) } as PolicySignals;
  const verdict = new PolicyEngine().evaluate(policy, evaluated);

  return {
    decisionId: "decision-replay-1",
    intentId: "intent-replay-1",
    policy: {
      name: policy.policyId,
      version: policy.policyVersion,
      schemaVersion: policy.schemaVersion,
      contentHash: await hasher.hash(policy),
    },
    signals,
    ...(trustedValues !== undefined && Object.keys(trustedValues).length > 0
      ? { trustedValues }
      : {}),
    outcome: verdict.outcome === "APPROVE" ? "APPROVED" : "REJECTED",
    reason: verdict.reason,
    matchedRuleId: verdict.matchedRuleId,
    evaluatedRules: verdict.evaluatedRules,
    matchedPath: verdict.matchedPath,
    evaluationMethod: { ...POLICY_EVALUATION_METHOD },
    evidence: verdict.evidence,
    evaluatedAt: new Date("2026-11-24T00:00:00Z"),
  } as unknown as Decision;
}

describe("replayStoredDecision (R3)", () => {
  it("reproduces an untampered decision on a refusal with complete evidence", async () => {
    const decision = await recordedDecision({
      risk_score: 90,
      currency: "INR",
    });

    expect(await replayStoredDecision(decision, policy)).toEqual({
      status: "reproduced",
    });
  });

  it("reproduces an untampered decision on an insufficient-evidence refusal", async () => {
    const decision = await recordedDecision({ currency: "INR" });

    expect(await replayStoredDecision(decision, policy)).toEqual({
      status: "reproduced",
    });
  });

  it("reports the outcome as differing when a recorded outcome was changed", async () => {
    const decision = await recordedDecision({
      risk_score: 90,
      currency: "INR",
    });
    const tampered = { ...decision, outcome: "APPROVED" } as Decision;

    const result = await replayStoredDecision(tampered, policy);

    expect(result).toEqual({ status: "differs", differences: ["outcome"] });
  });

  it("names every field that differs", async () => {
    const decision = await recordedDecision({
      risk_score: 90,
      currency: "INR",
    });
    const tampered = {
      ...decision,
      matchedRuleId: "approve-inr",
      evidence: { status: "insufficient", missingFacts: ["risk_score"] },
    } as unknown as Decision;

    const result = await replayStoredDecision(tampered, policy);

    expect(result.status).toBe("differs");
    if (result.status === "differs") {
      expect(result.differences).toEqual(
        expect.arrayContaining(["matchedRuleId", "evidence"]),
      );
    }
  });

  it("replays with the trusted values the runtime merged in, and differs without them", async () => {
    // The runtime supplied risk_score itself. The raw signals lack it, so the verdict depends on it.
    const decision = await recordedDecision(
      { currency: "INR" },
      { risk_score: 10 },
    );

    expect(decision.trustedValues).toEqual({ risk_score: 10 });
    expect(await replayStoredDecision(decision, policy)).toEqual({
      status: "reproduced",
    });

    const withoutTrusted = {
      ...decision,
      trustedValues: undefined,
    } as Decision;
    const result = await replayStoredDecision(withoutTrusted, policy);

    expect(result.status).toBe("differs");
  });

  it("is unverifiable when the decision predates the evaluation method", async () => {
    const decision = await recordedDecision({ currency: "INR" });
    const legacy = { ...decision, evaluationMethod: undefined } as Decision;

    expect(await replayStoredDecision(legacy, policy)).toEqual({
      status: "unverifiable",
      reason: "no_evaluation_method",
    });
  });

  it("is unverifiable, not a pass, when the named method version is not implemented here", async () => {
    const decision = await recordedDecision({ currency: "INR" });
    const future = {
      ...decision,
      evaluationMethod: { id: POLICY_EVALUATION_METHOD.id, version: "99" },
    } as Decision;

    expect(await replayStoredDecision(future, policy)).toEqual({
      status: "unverifiable",
      reason: "unsupported_method",
    });
  });

  it("is unverifiable when a runtime gate, not the engine, produced the decision", async () => {
    const decision = await recordedDecision({ currency: "INR" });
    const gate = {
      ...decision,
      evaluationMethod: { id: "runtime-gate", version: "1" },
    } as Decision;

    expect(await replayStoredDecision(gate, policy)).toEqual({
      status: "unverifiable",
      reason: "unsupported_method",
    });
  });

  it("is unverifiable when the decision does not pin the policy's content", async () => {
    const decision = await recordedDecision({ currency: "INR" });
    const unpinned = {
      ...decision,
      policy: { ...decision.policy, contentHash: undefined },
    } as Decision;

    expect(await replayStoredDecision(unpinned, policy)).toEqual({
      status: "unverifiable",
      reason: "no_policy_content_hash",
    });
  });

  it("is unverifiable when the policy supplied is not the one the decision was made under", async () => {
    const decision = await recordedDecision({ currency: "INR" });

    expect(await replayStoredDecision(decision, otherPolicy)).toEqual({
      status: "unverifiable",
      reason: "policy_content_mismatch",
    });
  });
});
