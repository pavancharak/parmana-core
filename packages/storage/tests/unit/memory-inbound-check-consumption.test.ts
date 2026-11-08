import { describe, expect, it } from "vitest";

import {
  ApprovalAlreadyUsedError,
  type InboundCheckRecord,
} from "@parmana/shared";

import { MemoryInboundCheckRepository } from "../../src/memory/MemoryInboundCheckRepository.js";

/** G-143, O1: the decision and the consumption of its approvals are one unit. */

function record(decisionId: string): InboundCheckRecord {
  return {
    decisionId,
    outcome: "approved",
    partnerId: "partner-a",
    capability: "erp:release-goods",
    expiresAt: "2026-11-02T10:10:00.000Z",
    audience: "erp.example",
    signature: "sig",
    issuedAt: new Date("2026-11-02T10:00:00Z"),
  };
}

describe("MemoryInboundCheckRepository.appendConsumingApprovals (G-143, O1)", () => {
  it("records the decision and consumes its approval", async () => {
    const repo = new MemoryInboundCheckRepository();
    await repo.appendConsumingApprovals(record("chk-1"), [
      { nonce: "n-1", expiresAt: "2026-11-02T10:10:00.000Z" },
    ]);
    expect(await repo.findById("chk-1")).not.toBeNull();
  });

  it("refuses a second use of an approval, and records nothing for that second decision", async () => {
    const repo = new MemoryInboundCheckRepository();
    await repo.appendConsumingApprovals(record("chk-1"), [
      { nonce: "n-1", expiresAt: "2026-11-02T10:10:00.000Z" },
    ]);
    await expect(
      repo.appendConsumingApprovals(record("chk-2"), [
        { nonce: "n-1", expiresAt: "2026-11-02T10:10:00.000Z" },
      ]),
    ).rejects.toBeInstanceOf(ApprovalAlreadyUsedError);
    expect(await repo.findById("chk-2")).toBeNull();
  });

  it("consumes nothing when any approval in the batch was already used", async () => {
    const repo = new MemoryInboundCheckRepository();
    await repo.appendConsumingApprovals(record("chk-1"), [
      { nonce: "n-used", expiresAt: "2026-11-02T10:10:00.000Z" },
    ]);
    await expect(
      repo.appendConsumingApprovals(record("chk-2"), [
        { nonce: "n-fresh", expiresAt: "2026-11-02T10:10:00.000Z" },
        { nonce: "n-used", expiresAt: "2026-11-02T10:10:00.000Z" },
      ]),
    ).rejects.toBeInstanceOf(ApprovalAlreadyUsedError);
    // n-fresh was not consumed, because the batch was refused as a whole.
    await expect(
      repo.appendConsumingApprovals(record("chk-3"), [
        { nonce: "n-fresh", expiresAt: "2026-11-02T10:10:00.000Z" },
      ]),
    ).resolves.toBeUndefined();
  });
});
