import { describe, it, expect } from "vitest";

import {
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  type Execution,
} from "@parmana/shared";

import { ExecutionChainCrypto } from "../../src/index.js";

function draftExecution(overrides: Partial<Execution> = {}): Execution {
  return {
    executionId: "exec-1",
    businessTransactionId: "txn-1",

    decision: {
      decisionId: "decision-1",
      intentId: "intent-1",
      policy: {
        name: "vendor-payment",
        version: "1.0.0",
        schemaVersion: "1.0.0",
      },
      signals: { amount: 100 },
      outcome: DecisionOutcome.APPROVED,
      evaluatedAt: new Date("2026-08-01T00:00:00.000Z"),
    },

    status: ExecutionStatus.PROCESSING,
    mode: ExecutionMode.SYNC,
    startedAt: new Date("2026-08-01T00:00:00.000Z"),

    ...overrides,
  };
}

describe("ExecutionChainCrypto", () => {
  it("chains and verifies a single Execution with no predecessor", async () => {
    const crypto = new ExecutionChainCrypto();

    const draft = draftExecution();

    const chainFields = await crypto.chain(draft, null);

    const execution: Execution = { ...draft, ...chainFields };

    expect(chainFields.previousChainHash).toBeNull();
    await expect(crypto.verifyEntry(execution)).resolves.toBe(true);
  });

  it("detects tampering: status changed after chaining", async () => {
    const crypto = new ExecutionChainCrypto();

    const draft = draftExecution();
    const chainFields = await crypto.chain(draft, null);
    const execution: Execution = { ...draft, ...chainFields };

    const tampered: Execution = {
      ...execution,
      status: ExecutionStatus.COMPLETED,
    };

    await expect(crypto.verifyEntry(tampered)).resolves.toBe(false);
  });

  it("detects tampering: evidence changed after chaining", async () => {
    const crypto = new ExecutionChainCrypto();

    const draft = draftExecution();
    const chainFields = await crypto.chain(draft, null);
    const execution: Execution = { ...draft, ...chainFields };

    const tampered: Execution = {
      ...execution,
      evidence: {
        businessTransactionId: "txn-1",
        action: "PAY",
        target: "vendor/1",
        parameters: { amount: 999 },
        success: true,
        executedAt: new Date("2026-08-01T00:01:00.000Z"),
      },
    };

    await expect(crypto.verifyEntry(tampered)).resolves.toBe(false);
  });

  it("detects tampering: previousChainHash changed without re-signing", async () => {
    const crypto = new ExecutionChainCrypto();

    const draft = draftExecution();
    const chainFields = await crypto.chain(draft, null);
    const execution: Execution = { ...draft, ...chainFields };

    const tampered: Execution = {
      ...execution,
      previousChainHash: "forged-predecessor-hash",
    };

    await expect(crypto.verifyEntry(tampered)).resolves.toBe(false);
  });

  it("verifies a valid two-entry chain", async () => {
    const crypto = new ExecutionChainCrypto();

    const first = draftExecution({ executionId: "exec-1" });
    const firstChain = await crypto.chain(first, null);
    const firstExecution: Execution = { ...first, ...firstChain };

    const second = draftExecution({
      executionId: "exec-2",
      status: ExecutionStatus.COMPLETED,
      completedAt: new Date("2026-08-01T00:02:00.000Z"),
    });
    const secondChain = await crypto.chain(second, firstChain.chainHash);
    const secondExecution: Execution = { ...second, ...secondChain };

    const result = await crypto.verifyChain([firstExecution, secondExecution]);

    expect(result).toEqual({ valid: true });
  });

  it("detects a broken chain: previousChainHash does not reference the actual predecessor", async () => {
    const crypto = new ExecutionChainCrypto();

    const first = draftExecution({ executionId: "exec-1" });
    const firstChain = await crypto.chain(first, null);
    const firstExecution: Execution = { ...first, ...firstChain };

    const second = draftExecution({ executionId: "exec-2" });
    const secondChain = await crypto.chain(second, "wrong-predecessor-hash");
    const secondExecution: Execution = { ...second, ...secondChain };

    const result = await crypto.verifyChain([firstExecution, secondExecution]);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe("exec-2");
  });

  it("treats an Execution with no chain fields as unprotected legacy data, not a break", async () => {
    const crypto = new ExecutionChainCrypto();

    const legacy = draftExecution({ executionId: "exec-legacy" });

    const chained = draftExecution({ executionId: "exec-chained" });
    const chainFields = await crypto.chain(chained, null);
    const chainedExecution: Execution = { ...chained, ...chainFields };

    const result = await crypto.verifyChain([legacy, chainedExecution]);

    expect(result).toEqual({ valid: true });
  });
});
