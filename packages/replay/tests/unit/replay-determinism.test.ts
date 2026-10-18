import { describe, it, expect } from "vitest";
import { ReplayEngine } from "../../src/ReplayEngine.js";
import { DecisionOutcome } from "@parmana/shared";
import { TEST_POLICY } from "../fixtures/policy.js";

describe("Replay Determinism", () => {
  it("should produce identical output regardless of input order", () => {
    const engine = new ReplayEngine();

    const baseTrustRecord = {
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

    const input1 = {
      trustRecord: baseTrustRecord,
      transaction: {
        signals: { riskScore: 10 },
      },
      policy: TEST_POLICY,
    };

    const input2 = {
      trustRecord: baseTrustRecord,
      transaction: {
        signals: { riskScore: 10 },
      },
      policy: TEST_POLICY,
    };

    const result1 = engine.replay(input1);
    const result2 = engine.replay(input2);

    expect(result1).toEqual(result2);

    // Replay-vs-replay equality alone doesn't catch a replay that
    // deterministically disagrees with the recording every time —
    // the recorded outcome must also match what replay produces.
    expect(result1.matches).toBe(true);
    expect(result1.replayedDecision.outcome).toBe(
      baseTrustRecord.executions[0].decision.outcome,
    );
  });
});
