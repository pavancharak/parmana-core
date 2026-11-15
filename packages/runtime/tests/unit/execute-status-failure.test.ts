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
import { ExecutionStatusPendingError } from "../../src/errors/ExecutionStatusPendingError.js";
import { TransactionStatusRecorder } from "../../src/services/TransactionStatusRecorder.js";

class FakeStatusEvents implements TransactionStatusEventRepository {
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

const TX_ID = "11111111-1111-4111-8111-111111111111";

/** Builds the application with the parts execute() reaches, stubbed. */
function application(
  runtimeExecute: (recorder: TransactionStatusRecorder) => Promise<void>,
) {
  const events = new FakeStatusEvents();
  let n = 0;
  const recorder = new TransactionStatusRecorder(
    events,
    () => new Date("2026-11-15T10:00:00Z"),
    () => `evt-${++n}`,
  );
  const transaction = { businessTransactionId: TX_ID } as BusinessTransaction;

  const app = new ExecutionTrustApplication(
    {
      accept: async () => transaction,
      get: async () => transaction,
    } as never,
    {
      execute: async () => runtimeExecute(recorder),
    } as never,
    { verify: async () => ({ status: "VERIFIED" }) } as never,
    { generate: async () => ({}) } as never,
    {
      findByTransactionId: async () => ({ businessTransactionId: TX_ID }),
    } as never,
    undefined,
    undefined,
    undefined,
    recorder,
  );

  return { app, events };
}

describe("ExecutionTrustApplication: a failure before the release", () => {
  it("ends an APPROVED transaction as FAILED with the reason, so it can be declared again", async () => {
    const { app, events } = application(async (recorder) => {
      await recorder
        .advance(TX_ID, "RECEIVED", "declare")
        .catch(() => undefined);
      await recorder.advance(TX_ID, "POLICY_EVALUATED", "decide");
      await recorder.advance(TX_ID, "APPROVED", "decide");
      throw new Error("signing unavailable");
    });
    await app.declare({ businessTransactionId: TX_ID } as never);

    await expect(app.executeAccepted(TX_ID)).rejects.toThrow(
      "signing unavailable",
    );

    const last = events.events.at(-1);
    expect(last?.status).toBe("FAILED");
    expect(last?.reason).toBe("signing unavailable");
  });

  it("leaves an EXECUTING transaction as it is: its outcome is pending, not failed", async () => {
    const { app, events } = application(async (recorder) => {
      await recorder.advance(TX_ID, "POLICY_EVALUATED", "decide");
      await recorder.advance(TX_ID, "APPROVED", "decide");
      await recorder.advance(TX_ID, "EXECUTING", "execute");
      throw new Error("connector timed out");
    });
    await app.declare({ businessTransactionId: TX_ID } as never);

    await expect(app.executeAccepted(TX_ID)).rejects.toThrow(
      "connector timed out",
    );

    expect(events.events.at(-1)?.status).toBe("EXECUTING");
  });
});

describe("ExecutionTrustApplication: the EXECUTED write fails after a release", () => {
  it("answers with a pending outcome and the record, and does not write VERIFIED", async () => {
    const { app, events } = application(async (recorder) => {
      await recorder.advance(TX_ID, "POLICY_EVALUATED", "decide");
      await recorder.advance(TX_ID, "APPROVED", "decide");
      await recorder.advance(TX_ID, "EXECUTING", "execute");
      // The connector answered; the EXECUTED write is not made.
    });
    await app.declare({ businessTransactionId: TX_ID } as never);

    const error = await app.executeAccepted(TX_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionStatusPendingError);
    expect(
      (error as ExecutionStatusPendingError).record.businessTransactionId,
    ).toBe(TX_ID);
    expect(events.events.at(-1)?.status).toBe("EXECUTING");
    expect(events.events.some((e) => e.status === "VERIFIED")).toBe(false);
  });

  it("returns the record without error when EXECUTED is written, and writes VERIFIED", async () => {
    const { app, events } = application(async (recorder) => {
      await recorder.advance(TX_ID, "POLICY_EVALUATED", "decide");
      await recorder.advance(TX_ID, "APPROVED", "decide");
      await recorder.advance(TX_ID, "EXECUTING", "execute");
      await recorder.advance(TX_ID, "EXECUTED", "execute", {
        recordRef: "auth-1",
      });
    });
    await app.declare({ businessTransactionId: TX_ID } as never);

    await expect(app.executeAccepted(TX_ID)).resolves.toMatchObject({
      businessTransactionId: TX_ID,
    });
    expect(events.events.at(-1)?.status).toBe("VERIFIED");
  });
});
