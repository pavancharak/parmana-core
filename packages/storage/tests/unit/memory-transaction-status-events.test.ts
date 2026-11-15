import { describe, expect, it } from "vitest";

import { InvalidStatusTransitionError } from "@parmana/shared";

import { MemoryTransactionStatusEventRepository } from "../../src/memory/MemoryTransactionStatusEventRepository.js";

const KNOWN = new Set(["btx-1", "btx-2"]);

function repo() {
  return new MemoryTransactionStatusEventRepository({
    has: (id) => KNOWN.has(id),
  });
}

let counter = 0;
function step(
  businessTransactionId: string,
  from: Parameters<MemoryTransactionStatusEventRepository["append"]>[0]["from"],
  to: Parameters<MemoryTransactionStatusEventRepository["append"]>[0]["to"],
  stage: Parameters<
    MemoryTransactionStatusEventRepository["append"]
  >[0]["stage"],
  extra: { reason?: string } = {},
) {
  counter += 1;
  return {
    eventId: `evt-${counter}`,
    businessTransactionId,
    from,
    to,
    stage,
    occurredAt: new Date("2026-11-15T10:00:00Z"),
    ...extra,
  };
}

describe("MemoryTransactionStatusEventRepository", () => {
  it("walks the happy path with sequences 1..n and returns the current status", async () => {
    const r = repo();
    await r.append(step("btx-1", null, "RECEIVED", "declare"));
    await r.append(step("btx-1", "RECEIVED", "POLICY_EVALUATED", "decide"));
    await r.append(step("btx-1", "POLICY_EVALUATED", "APPROVED", "decide"));
    await r.append(step("btx-1", "APPROVED", "EXECUTING", "execute"));
    await r.append(step("btx-1", "EXECUTING", "EXECUTED", "execute"));
    await r.append(step("btx-1", "EXECUTED", "VERIFIED", "verify"));

    const history = await r.history("btx-1");
    expect(history.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(history.map((e) => e.status)).toEqual([
      "RECEIVED",
      "POLICY_EVALUATED",
      "APPROVED",
      "EXECUTING",
      "EXECUTED",
      "VERIFIED",
    ]);
    expect(history.every((e) => e.legacy === false)).toBe(true);
    expect((await r.current("btx-1"))?.status).toBe("VERIFIED");
  });

  it("refuses a first event that is not RECEIVED", async () => {
    const r = repo();
    await expect(
      r.append(step("btx-1", null, "APPROVED", "decide")),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    expect(await r.history("btx-1")).toEqual([]);
  });

  it("refuses a move that the transition table does not allow", async () => {
    const r = repo();
    await r.append(step("btx-1", null, "RECEIVED", "declare"));
    await expect(
      r.append(step("btx-1", "RECEIVED", "EXECUTED", "execute")),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    expect((await r.current("btx-1"))?.status).toBe("RECEIVED");
  });

  it("refuses a stale expected status (the lock-check contract)", async () => {
    const r = repo();
    await r.append(step("btx-1", null, "RECEIVED", "declare"));
    await r.append(step("btx-1", "RECEIVED", "POLICY_EVALUATED", "decide"));
    // A second writer still believes the status is RECEIVED.
    await expect(
      r.append(step("btx-1", "RECEIVED", "POLICY_EVALUATED", "decide")),
    ).rejects.toThrow(/current status is POLICY_EVALUATED, expected RECEIVED/);
    expect((await r.history("btx-1")).length).toBe(2);
  });

  it("refuses an event for an unknown transaction", async () => {
    const r = repo();
    await expect(
      r.append(step("btx-missing", null, "RECEIVED", "declare")),
    ).rejects.toThrow(/btx-missing/);
  });

  it("keeps transactions independent", async () => {
    const r = repo();
    await r.append(step("btx-1", null, "RECEIVED", "declare"));
    await r.append(step("btx-2", null, "RECEIVED", "declare"));
    expect((await r.history("btx-1")).map((e) => e.sequence)).toEqual([1]);
    expect((await r.history("btx-2")).map((e) => e.sequence)).toEqual([1]);
  });

  it("returns null and an empty history for a transaction with no events", async () => {
    const r = repo();
    expect(await r.current("btx-1")).toBeNull();
    expect(await r.history("btx-1")).toEqual([]);
  });

  it("records the reason on a FAILED event and the record reference", async () => {
    const r = repo();
    await r.append(step("btx-1", null, "RECEIVED", "declare"));
    await r.append(step("btx-1", "RECEIVED", "POLICY_EVALUATED", "decide"));
    await r.append(step("btx-1", "POLICY_EVALUATED", "APPROVED", "decide"));
    await r.append(step("btx-1", "APPROVED", "EXECUTING", "execute"));
    const failed = await r.append(
      step("btx-1", "EXECUTING", "FAILED", "execute", {
        reason: "connector timeout",
      }),
    );
    expect(failed.reason).toBe("connector timeout");
    expect(failed.status).toBe("FAILED");
  });
});
