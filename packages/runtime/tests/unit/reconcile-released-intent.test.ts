import { describe, expect, it } from "vitest";

import {
  InvalidStatusTransitionError,
  isAllowedTransition,
  type AppendTransactionStatusEvent,
  type BusinessTransaction,
  type TransactionStatusEvent,
  type TransactionStatusEventRepository,
} from "@parmana/shared";

import { ExecutionTrustApplication } from "../../src/ExecutionTrustApplication.js";
import { TransactionStatusRecorder } from "../../src/services/TransactionStatusRecorder.js";

const TX = "55555555-5555-4555-8555-555555555555";
const AUTH = "auth-released-1";

class Events implements TransactionStatusEventRepository {
  readonly events: TransactionStatusEvent[] = [];

  async append(
    input: AppendTransactionStatusEvent,
  ): Promise<TransactionStatusEvent> {
    const current = this.events.at(-1)?.status ?? null;
    if (current !== input.from || !isAllowedTransition(current, input.to)) {
      throw new InvalidStatusTransitionError(
        input.businessTransactionId,
        "refused",
      );
    }
    const event: TransactionStatusEvent = {
      eventId: input.eventId,
      businessTransactionId: input.businessTransactionId,
      sequence: this.events.length + 1,
      status: input.to,
      stage: input.stage,
      occurredAt: input.occurredAt,
      ...(input.recordRef !== undefined && { recordRef: input.recordRef }),
      ...(input.reason !== undefined && { reason: input.reason }),
      legacy: false,
    };
    this.events.push(event);
    return event;
  }

  async current(): Promise<TransactionStatusEvent | null> {
    return this.events.at(-1) ?? null;
  }

  async history(): Promise<readonly TransactionStatusEvent[]> {
    return this.events;
  }
}

/**
 * A transaction whose release reached the connector, but whose EXECUTED write
 * failed: the status is EXECUTING, and the execution intent holds the state
 * given by `intent`.
 */
function executingWithIntent(
  intent: { state: string; resolution?: string; note?: string } | null,
) {
  const events = new Events();
  const recorder = new TransactionStatusRecorder(
    events,
    () => new Date("2026-11-15T10:00:00Z"),
    () => "e",
  );
  for (const to of [
    "RECEIVED",
    "POLICY_EVALUATED",
    "APPROVED",
    "EXECUTING",
  ] as const) {
    events.events.push({
      eventId: `seed-${to}`,
      businessTransactionId: TX,
      sequence: events.events.length + 1,
      status: to,
      stage:
        to === "RECEIVED"
          ? "declare"
          : to === "EXECUTING"
            ? "execute"
            : "decide",
      occurredAt: new Date("2026-11-15T10:00:00Z"),
      legacy: false,
    });
  }

  const storedIntent = intent && {
    intent: { authorizationId: AUTH },
    status: {
      state: intent.state,
      resolution: intent.resolution,
      resolutionNote: intent.note,
    },
  };

  const app = new ExecutionTrustApplication(
    {
      get: async () => ({ businessTransactionId: TX }) as BusinessTransaction,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    { get: async () => storedIntent } as never,
    undefined,
    recorder,
  );
  return { app, events };
}

describe("reconcileTransaction from the execution intent", () => {
  it("writes EXECUTED, with the authorization as the record, when the intent is RELEASED", async () => {
    const { app, events } = executingWithIntent({ state: "RELEASED" });

    const result = await app.reconcileTransaction(TX, "operator-1");

    expect(result).toEqual({ changed: true, status: "EXECUTED" });
    const last = events.events.at(-1)!;
    expect(last.status).toBe("EXECUTED");
    expect(last.stage).toBe("reconcile");
    expect(last.recordRef).toBe(AUTH);
    expect(last.reason).toBe(
      "reconciled by operator operator-1: the release is recorded",
    );
  });

  it("writes EXECUTED when the intent is FINALIZED", async () => {
    const { app } = executingWithIntent({ state: "FINALIZED" });
    expect(await app.reconcileTransaction(TX, "operator-1")).toEqual({
      changed: true,
      status: "EXECUTED",
    });
  });

  it("writes EXECUTED when an operator resolved the intent as EXECUTED", async () => {
    const { app } = executingWithIntent({
      state: "RESOLVED",
      resolution: "EXECUTED",
    });
    expect(await app.reconcileTransaction(TX, "operator-1")).toEqual({
      changed: true,
      status: "EXECUTED",
    });
  });

  it("writes FAILED, with the operator's note, when the intent is resolved as NOT_EXECUTED", async () => {
    const { app, events } = executingWithIntent({
      state: "RESOLVED",
      resolution: "NOT_EXECUTED",
      note: "the connector has no such refund",
    });

    expect(await app.reconcileTransaction(TX, "operator-1")).toEqual({
      changed: true,
      status: "FAILED",
    });
    expect(events.events.at(-1)!.reason).toBe(
      "reconciled by operator operator-1: the connector has no such refund",
    );
  });

  it("refuses with outcome unknown, and writes nothing, when the intent is only PREPARED or ERRORED", async () => {
    for (const state of ["PREPARED", "ERRORED"]) {
      const { app, events } = executingWithIntent({ state });
      await expect(app.reconcileTransaction(TX, "operator-1")).rejects.toThrow(
        /outcome unknown/,
      );
      expect(events.events.at(-1)!.status).toBe("EXECUTING");
    }
  });

  it("refuses with outcome unknown when there is no intent", async () => {
    const { app, events } = executingWithIntent(null);
    await expect(app.reconcileTransaction(TX, "operator-1")).rejects.toThrow(
      /outcome unknown/,
    );
    expect(events.events.at(-1)!.status).toBe("EXECUTING");
  });

  it("changes nothing when the status is already EXECUTED, so a second reconcile is a no-op", async () => {
    const { app, events } = executingWithIntent({ state: "RELEASED" });
    await app.reconcileTransaction(TX, "operator-1");
    const before = events.events.length;

    expect(await app.reconcileTransaction(TX, "operator-2")).toEqual({
      changed: false,
      status: "EXECUTED",
    });
    expect(events.events.length).toBe(before);
  });
});
