import { describe, expect, it } from "vitest";

import {
  InvalidStatusTransitionError,
  isAllowedTransition,
  type AppendTransactionStatusEvent,
  type BusinessTransaction,
  type TransactionDeclarationStore,
  type TransactionExecutionLease,
  type TransactionExecutionLock,
  type TransactionStatusEvent,
  type TransactionStatusEventRepository,
} from "@parmana/shared";

import { ExecutionTrustApplication } from "../../src/ExecutionTrustApplication.js";
import { TransactionStatusRecorder } from "../../src/services/TransactionStatusRecorder.js";

const TX = "22222222-2222-4222-8222-222222222222";

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

class CountingLock implements TransactionExecutionLock {
  acquired = 0;
  released = 0;
  constructor(private readonly available: boolean) {}

  async acquire(): Promise<TransactionExecutionLease | null> {
    if (!this.available) return null;
    this.acquired += 1;
    return {
      release: async () => {
        this.released += 1;
      },
    };
  }
}

function build(options: {
  runtimeExecute?: (recorder: TransactionStatusRecorder) => Promise<void>;
  lock?: TransactionExecutionLock;
  declarationStore?: TransactionDeclarationStore;
  seedLegacy?: boolean;
  seedReceived?: boolean;
  accept?: () => Promise<BusinessTransaction>;
}) {
  const events = new FakeStatusEvents();
  if (options.seedReceived) {
    events.events.push({
      eventId: "received-1",
      businessTransactionId: TX,
      sequence: 1,
      status: "RECEIVED",
      stage: "declare",
      occurredAt: new Date("2026-11-15T10:00:00Z"),
      legacy: false,
    });
  }
  if (options.seedLegacy) {
    events.events.push({
      eventId: "legacy-1",
      businessTransactionId: TX,
      sequence: 1,
      status: "RECEIVED",
      stage: "declare",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
      legacy: true,
    });
  }
  let n = 0;
  const recorder = new TransactionStatusRecorder(
    events,
    () => new Date("2026-11-15T10:00:00Z"),
    () => `evt-${++n}`,
  );
  const transaction = { businessTransactionId: TX } as BusinessTransaction;
  const calls = { runtime: 0, accept: 0, validate: 0 };

  const transactions = {
    accept: async () => {
      calls.accept += 1;
      return options.accept ? options.accept() : transaction;
    },
    validateForAccept: async () => {
      calls.validate += 1;
    },
    get: async () => transaction,
  };

  const app = new ExecutionTrustApplication(
    transactions as never,
    {
      execute: async () => {
        calls.runtime += 1;
        return options.runtimeExecute
          ? options.runtimeExecute(recorder)
          : undefined;
      },
    } as never,
    { verify: async () => ({ status: "VERIFIED" }) } as never,
    { generate: async () => ({}) } as never,
    {
      findByTransactionId: async () => ({ businessTransactionId: TX }),
    } as never,
    undefined,
    undefined,
    undefined,
    recorder,
    options.declarationStore,
    options.lock,
  );

  return { app, events, calls };
}

describe("ExecutionTrustApplication: legacy transactions", () => {
  it("refuses a legacy transaction before anything is decided or released", async () => {
    const { app, calls } = build({ seedLegacy: true });

    await expect(app.executeAccepted(TX)).rejects.toThrow(/legacy transaction/);
    expect(calls.runtime).toBe(0);
  });
});

describe("ExecutionTrustApplication: the execution lock", () => {
  it("refuses a call while another holds the transaction, and releases nothing", async () => {
    const lock = new CountingLock(false);
    const { app, calls } = build({ lock });

    await expect(app.executeAccepted(TX)).rejects.toThrow(
      /another execute or reconcile/,
    );
    expect(calls.runtime).toBe(0);
    expect(lock.acquired).toBe(0);
  });

  it("holds the lock for the whole execute and releases it after success", async () => {
    const lock = new CountingLock(true);
    const { app } = build({
      lock,
      seedReceived: true,
      runtimeExecute: async (recorder) => {
        await recorder
          .advance(TX, "RECEIVED", "declare")
          .catch(() => undefined);
        await recorder.advance(TX, "POLICY_EVALUATED", "decide");
        await recorder.advance(TX, "APPROVED", "decide");
        await recorder.advance(TX, "EXECUTING", "execute");
        await recorder.advance(TX, "EXECUTED", "execute");
      },
    });

    await app.executeAccepted(TX);
    expect(lock.acquired).toBe(1);
    expect(lock.released).toBe(1);
  });

  it("releases the lock when the execute fails", async () => {
    const lock = new CountingLock(true);
    const { app } = build({
      lock,
      seedReceived: true,
      runtimeExecute: async () => {
        throw new Error("boom");
      },
    });

    await expect(app.executeAccepted(TX)).rejects.toThrow("boom");
    expect(lock.released).toBe(1);
  });
});

describe("ExecutionTrustApplication: declare writes the transaction and its event together", () => {
  it("uses the declaration store, and does not call accept or write a separate RECEIVED event", async () => {
    const stored: Array<{
      id: string;
      from: unknown;
      to: string;
      stage: string;
    }> = [];
    const store: TransactionDeclarationStore = {
      declare: async (transaction, firstEvent) => {
        stored.push({
          id: transaction.businessTransactionId,
          from: firstEvent.from,
          to: firstEvent.to,
          stage: firstEvent.stage,
        });
      },
    };
    const { app, events, calls } = build({ declarationStore: store });

    await app.declare({ businessTransactionId: TX } as never);

    expect(stored).toEqual([
      { id: TX, from: null, to: "RECEIVED", stage: "declare" },
    ]);
    expect(calls.validate).toBe(1);
    expect(calls.accept).toBe(0);
    expect(events.events).toHaveLength(0);
  });

  it("without a store, writes the transaction with accept and then the RECEIVED event", async () => {
    const { app, events, calls } = build({});

    await app.declare({ businessTransactionId: TX } as never);

    expect(calls.accept).toBe(1);
    expect(events.events.map((e) => e.status)).toEqual(["RECEIVED"]);
  });
});
