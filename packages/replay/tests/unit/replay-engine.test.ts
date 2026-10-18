import { describe, it, expect } from "vitest";
import { ReplayEngine } from "../../src/ReplayEngine.js";
import { DecisionOutcome } from "@parmana/shared";
import { TEST_POLICY } from "../fixtures/policy.js";
describe("ReplayEngine - Deterministic Execution", () => {
  it("should produce identical replay results", () => {
    const engine = new ReplayEngine();

    const trustRecord = {
      executions: [
        {
          decision: {
            decisionId: "d1",
            intentId: "i1",
            policy: TEST_POLICY,
            signals: { riskScore: 10 },
            outcome: DecisionOutcome.APPROVED,
            reason: "ok",
            evaluatedAt: new Date(),
          },
        },
      ],
    };

    const input = {
      trustRecord,
      transaction: {
        signals: { riskScore: 10 },
      },
      policy: TEST_POLICY,
    };

    const r1 = engine.replay(input);
    const r2 = engine.replay(input);

    expect(r1).toEqual(r2);

    // Replay-vs-replay equality alone doesn't catch a replay that
    // deterministically disagrees with the recording every time —
    // the recorded outcome must also match what replay produces.
    expect(r1.matches).toBe(true);
    expect(r1.replayedDecision.outcome).toBe(
      trustRecord.executions[0].decision.outcome,
    );
  });

  it("should preserve execution order", () => {
    const engine = new ReplayEngine();

    const trustRecord = {
      executions: [
        {
          decision: {
            decisionId: "d1",
            intentId: "i1",
            policy: TEST_POLICY,
            signals: { riskScore: 10 },
            outcome: DecisionOutcome.APPROVED,
            reason: "ok",
            evaluatedAt: new Date(),
          },
        },
      ],
    };

    const input = {
      trustRecord,
      transaction: {
        signals: { riskScore: 10 },
      },
      policy: TEST_POLICY,
    };

    const result = engine.replay(input);

    expect(result.recordedDecision.intentId).toBe("i1");
    expect(result.matches).toBe(true);
  });
});
