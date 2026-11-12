import { describe, expect, it } from "vitest";

import { MemoryExecutionOutcomeStore } from "../../src/index.js";

/**
 * The reconciler's reporting stage lists rows that are still in flight and
 * whose authorization has expired. Only those can be considered, because a
 * retry can no longer arrive for them.
 */

const NOW = new Date("2026-11-12T10:00:00.000Z");
const PAST = "2026-11-12T09:00:00.000Z";
const FUTURE = "2026-11-12T11:00:00.000Z";

describe("MemoryExecutionOutcomeStore.listStuck", () => {
  it("lists only in-flight rows whose authorization has expired", async () => {
    const store = new MemoryExecutionOutcomeStore();

    await store.begin("stuck-expired", PAST);
    await store.begin("live-in-flight", FUTURE);

    await store.begin("completed-expired", PAST);
    await store.complete("completed-expired", {
      businessTransactionId: "t",
      action: "a",
      target: "x",
      parameters: {},
      success: true,
      executedAt: NOW,
      metadata: {},
    });

    await store.begin("failed-expired", PAST);
    await store.fail("failed-expired", "refused");

    expect(await store.listStuck(NOW)).toEqual([
      { nonce: "stuck-expired", expiresAt: PAST },
    ]);
  });

  it("changes nothing: the rows it lists are still in flight afterwards", async () => {
    const store = new MemoryExecutionOutcomeStore();

    await store.begin("stuck", PAST);
    await store.listStuck(NOW);

    expect(await store.get("stuck")).toEqual({ status: "in_flight" });
  });

  it("includes a row whose expiry is exactly now", async () => {
    const store = new MemoryExecutionOutcomeStore();

    await store.begin("boundary", NOW.toISOString());

    expect(await store.listStuck(NOW)).toEqual([
      { nonce: "boundary", expiresAt: NOW.toISOString() },
    ]);
  });
});
