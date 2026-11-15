import { describe, expect, it } from "vitest";

import {
  DuplicateBusinessTransactionError,
  InvalidStatusTransitionError,
  type AppendTransactionStatusEvent,
  type BusinessTransaction,
} from "@parmana/shared";

import { MemoryBusinessTransactionRepository } from "../../src/memory/MemoryBusinessTransactionRepository.js";
import { MemoryTransactionStatusEventRepository } from "../../src/memory/MemoryTransactionStatusEventRepository.js";
import { MemoryTransactionDeclarationStore } from "../../src/memory/MemoryTransactionDeclarationStore.js";
import { MemoryTransactionExecutionLock } from "../../src/memory/MemoryTransactionExecutionLock.js";

const ID = "33333333-3333-4333-8333-333333333333";

function tx(id = ID): BusinessTransaction {
  return {
    businessTransactionId: id,
    metadata: { businessTransactionId: id },
    status: "RECEIVED",
    createdAt: new Date("2026-11-15T10:00:00Z"),
  } as unknown as BusinessTransaction;
}

function firstEvent(
  overrides: Partial<AppendTransactionStatusEvent> = {},
): AppendTransactionStatusEvent {
  return {
    eventId: "e-1",
    businessTransactionId: ID,
    from: null,
    to: "RECEIVED",
    stage: "declare",
    occurredAt: new Date("2026-11-15T10:00:00Z"),
    ...overrides,
  };
}

function store() {
  const businesses = new MemoryBusinessTransactionRepository();
  const events = new MemoryTransactionStatusEventRepository(
    async (id) => (await businesses.findById(id)) !== null,
  );
  return {
    businesses,
    events,
    declarations: new MemoryTransactionDeclarationStore(businesses, events),
  };
}

describe("MemoryTransactionDeclarationStore", () => {
  it("stores the transaction and its RECEIVED event together", async () => {
    const { businesses, events, declarations } = store();

    await declarations.declare(tx(), firstEvent());

    expect(await businesses.findById(ID)).not.toBeNull();
    expect((await events.current(ID))?.status).toBe("RECEIVED");
  });

  it("refuses a first event that is not RECEIVED at stage declare, and stores nothing", async () => {
    const { businesses, declarations } = store();

    await expect(
      declarations.declare(tx(), firstEvent({ to: "APPROVED" as never })),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    await expect(
      declarations.declare(tx(), firstEvent({ from: "RECEIVED" as never })),
    ).rejects.toBeInstanceOf(InvalidStatusTransitionError);
    expect(await businesses.findById(ID)).toBeNull();
  });

  it("refuses a duplicate, and keeps one event", async () => {
    const { events, declarations } = store();

    await declarations.declare(tx(), firstEvent());
    await expect(
      declarations.declare(tx(), firstEvent({ eventId: "e-2" })),
    ).rejects.toBeInstanceOf(DuplicateBusinessTransactionError);
    expect(await events.history(ID)).toHaveLength(1);
  });
});

describe("MemoryTransactionExecutionLock", () => {
  it("lets one holder in, refuses a second until release, then admits it", async () => {
    const lock = new MemoryTransactionExecutionLock();

    const first = await lock.acquire(ID, 50);
    expect(first).not.toBeNull();
    expect(await lock.acquire(ID, 50)).toBeNull();

    await first!.release();
    expect(await lock.acquire(ID, 50)).not.toBeNull();
  });

  it("does not lock other transactions", async () => {
    const lock = new MemoryTransactionExecutionLock();
    expect(await lock.acquire(ID, 50)).not.toBeNull();
    expect(
      await lock.acquire("44444444-4444-4444-8444-444444444444", 50),
    ).not.toBeNull();
  });
});
