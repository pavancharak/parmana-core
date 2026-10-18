import { describe, expect, it } from "vitest";

import { DefaultExecutionSystem } from "../../src/DefaultExecutionSystem.js";

describe("DefaultExecutionSystem", () => {
  it("should execute a request successfully", async () => {
    const system = new DefaultExecutionSystem();

    const result = await system.execute({
      businessTransactionId: "tx-1",
      action: "PAY",
      target: "Vendor",
      parameters: {
        amount: 100,
      },
      authorization: {
        payload: {
          authorizationId: "auth-1",
          nonce: "nonce-1",
          decisionId: "decision-1",
          businessTransactionId: "tx-1",
          policyName: "policy-a",
          policyVersion: "1.0.0",
          authorizedAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-01-01T00:02:00.000Z",
        },
        signature: "signature",
        keyId: "default",
        algorithm: "ed25519",
      },
    });

    expect(result.success).toBe(true);
    expect(result.businessTransactionId).toBe("tx-1");
    expect(result.action).toBe("PAY");
    expect(result.target).toBe("Vendor");
  });
});
