import { describe, expect, it } from "vitest";

import { MemoryInboundOutcomeRepository } from "../../src/memory/MemoryInboundOutcomeRepository.js";
import type { InboundOutcomeRecord } from "@parmana/shared";

function outcome(
  overrides: Partial<InboundOutcomeRecord> = {},
): InboundOutcomeRecord {
  return {
    decisionId: "dec-1",
    partnerId: "partner-a",
    orderId: "4412",
    paymentId: "pay_ABC123",
    amountInr: 800,
    status: "refunded",
    refundId: "rfnd_1",
    recordedAt: new Date("2026-11-02T10:00:00.000Z"),
    ...overrides,
  };
}

describe("MemoryInboundOutcomeRepository", () => {
  it("stores an outcome and finds it by decision", async () => {
    const repo = new MemoryInboundOutcomeRepository();
    expect(await repo.append(outcome())).toBe(true);
    expect((await repo.findByDecisionId("dec-1"))?.refundId).toBe("rfnd_1");
  });

  it("returns false and keeps the first outcome for a second record on the same decision", async () => {
    const repo = new MemoryInboundOutcomeRepository();
    await repo.append(outcome());
    expect(
      await repo.append(outcome({ status: "error", refundId: undefined })),
    ).toBe(false);
    expect((await repo.findByDecisionId("dec-1"))?.status).toBe("refunded");
  });

  it("returns null for a decision with no outcome", async () => {
    const repo = new MemoryInboundOutcomeRepository();
    expect(await repo.findByDecisionId("missing")).toBeNull();
  });
});
