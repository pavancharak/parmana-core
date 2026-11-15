import { describe, expect, it } from "vitest";

import {
  InvalidStatusTransitionError,
  isAllowedTransition,
  type AppendTransactionStatusEvent,
  type TransactionStatus,
  type TransactionStatusEvent,
  type TransactionStatusEventRepository,
} from "@parmana/shared";

import { TransactionStatusRecorder } from "../../src/services/TransactionStatusRecorder.js";

/**
 * A repository that checks the expected status and the transition table
 * before it appends, as the real repositories do under their lock.
 */
class FakeStatusEvents implements TransactionStatusEventRepository {
  readonly events = new Map<string, TransactionStatusEvent[]>();

  async append(
    input: AppendTransactionStatusEvent,
  ): Promise<TransactionStatusEvent> {
    const list = this.events.get(input.businessTransactionId) ?? [];
    const current = list.at(-1)?.status ?? null;

    if (current !== input.from) {
      throw new InvalidStatusTransitionError(
        input.businessTransactionId,
        `current status is ${current ?? "none"}, expected ${input.from ?? "none"}`,
      );
    }
    if (!isAllowedTransition(current, input.to)) {
      throw new InvalidStatusTransitionError(
        input.businessTransactionId,
        "not allowed",
      );
    }

    const event: TransactionStatusEvent = {
      eventId: input.eventId,
      businessTransactionId: input.businessTransactionId,
      sequence: list.length + 1,
      status: input.to,
      stage: input.stage,
      occurredAt: input.occurredAt,
      ...(input.recordRef !== undefined && { recordRef: input.recordRef }),
      ...(input.reason !== undefined && { reason: input.reason }),
      legacy: false,
    };
    this.events.set(input.businessTransactionId, [...list, event]);
    return event;
  }

  async current(id: string): Promise<TransactionStatusEvent | null> {
    return this.events.get(id)?.at(-1) ?? null;
  }

  async history(id: string): Promise<readonly TransactionStatusEvent[]> {
    return this.events.get(id) ?? [];
  }
}

function recorder(events = new FakeStatusEvents()) {
  let n = 0;
  return {
    events,
    recorder: new TransactionStatusRecorder(
      events,
      () => new Date("2026-11-15T10:00:00Z"),
      () => `evt-${++n}`,
    ),
  };
}

describe("TransactionStatusRecorder", () => {
  it("reads the current status and appends the next one, in order", async () => {
    const { recorder: r } = recorder();

    await r.advance("btx-1", "RECEIVED", "declare");
    await r.advance("btx-1", "POLICY_EVALUATED", "decide");
    const approved = await r.advance("btx-1", "APPROVED", "decide");

    expect(approved.sequence).toBe(3);
    expect((await r.history("btx-1")).map((e) => e.status)).toEqual([
      "RECEIVED",
      "POLICY_EVALUATED",
      "APPROVED",
    ]);
  });

  it("passes the reason and the record reference through to the event", async () => {
    const { recorder: r } = recorder();
    await r.advance("btx-1", "RECEIVED", "declare");
    await r.advance("btx-1", "POLICY_EVALUATED", "decide");
    await r.advance("btx-1", "APPROVED", "decide");
    await r.advance("btx-1", "EXECUTING", "execute");

    const failed = await r.advance("btx-1", "FAILED", "execute", {
      reason: "no connector",
      recordRef: "auth-1",
    });

    expect(failed.reason).toBe("no connector");
    expect(failed.recordRef).toBe("auth-1");
  });

  it("refuses a move the table does not allow, and writes nothing", async () => {
    const { recorder: r, events } = recorder();
    await r.advance("btx-1", "RECEIVED", "declare");

    await expect(
      r.advance("btx-1", "EXECUTED", "execute"),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    expect(events.events.get("btx-1")).toHaveLength(1);
  });

  it("uses a null expected status for the first event, so a first event must be RECEIVED", async () => {
    const { recorder: r } = recorder();

    await expect(
      r.advance("btx-2", "APPROVED" as TransactionStatus, "decide"),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    expect(await r.current("btx-2")).toBeNull();
  });
});
