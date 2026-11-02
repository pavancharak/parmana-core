import { describe, expect, it } from "vitest";

import { MemoryInboundDecisionRepository } from "../../src/memory/MemoryInboundDecisionRepository.js";
import type { InboundDecisionRecord } from "@parmana/shared";

function record(
  overrides: Partial<InboundDecisionRecord> = {},
): InboundDecisionRecord {
  return {
    decisionId: "dec-1",
    outcome: "approved",
    partnerId: "partner-a",
    paymentId: "pay_ABC123",
    limitInr: 1000,
    expiresAt: "2026-11-02T10:10:00.000Z",
    audience: "billing.example",
    signature: "c2ln",
    issuedAt: new Date("2026-11-02T10:00:00.000Z"),
    ...overrides,
  };
}

describe("MemoryInboundDecisionRepository", () => {
  it("stores a decision and finds it by ID", async () => {
    const repo = new MemoryInboundDecisionRepository();
    await repo.append(record());
    expect((await repo.findById("dec-1"))?.paymentId).toBe("pay_ABC123");
  });

  it("returns null for an unknown decision", async () => {
    const repo = new MemoryInboundDecisionRepository();
    expect(await repo.findById("missing")).toBeNull();
  });

  it("refuses a second decision with the same ID", async () => {
    const repo = new MemoryInboundDecisionRepository();
    await repo.append(record());
    await expect(repo.append(record({ outcome: "rejected" }))).rejects.toThrow(
      /already exists/,
    );
    expect((await repo.findById("dec-1"))?.outcome).toBe("approved");
  });

  it("keeps a rejection with its reason", async () => {
    const repo = new MemoryInboundDecisionRepository();
    await repo.append(
      record({
        decisionId: "dec-2",
        outcome: "rejected",
        reason: "approval_required",
      }),
    );
    const found = await repo.findById("dec-2");
    expect(found?.outcome).toBe("rejected");
    expect(found?.reason).toBe("approval_required");
  });
});
