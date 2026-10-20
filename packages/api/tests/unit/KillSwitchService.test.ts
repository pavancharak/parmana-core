import { describe, expect, it } from "vitest";

import {
  KillSwitchService,
  MemoryKillSwitchStore,
  type KillSwitchState,
  type KillSwitchStore,
} from "../../src/killSwitch/KillSwitchService.js";

describe("KillSwitchService (ADR-0017, first slice)", () => {
  it("starts inactive", async () => {
    const service = new KillSwitchService(new MemoryKillSwitchStore());

    expect(await service.isActive()).toBe(false);
  });

  it("trips and resets, recording who and why", async () => {
    const service = new KillSwitchService(new MemoryKillSwitchStore());

    const tripped = await service.trip("operator-a", "suspicious refunds");
    expect(tripped.active).toBe(true);
    expect(tripped.trippedBy).toBe("operator-a");
    expect(tripped.tripReason).toBe("suspicious refunds");
    expect(await service.isActive()).toBe(true);

    const reset = await service.reset("operator-b", "reviewed, safe");
    expect(reset.active).toBe(false);
    expect(reset.resetBy).toBe("operator-b");
    expect(reset.resetReason).toBe("reviewed, safe");
    expect(reset.trippedBy).toBe("operator-a");
    expect(await service.isActive()).toBe(false);
  });

  it("fails closed: a read error reports the switch as active", async () => {
    const broken: KillSwitchStore = {
      read: async () => {
        throw new Error("database unreachable");
      },
      compareAndWrite: async () => false,
    };

    expect(await new KillSwitchService(broken).isActive()).toBe(true);
  });

  it("retries a write that lost a race, so an update is not lost", async () => {
    const inner = new MemoryKillSwitchStore();
    let losses = 1;

    const flaky: KillSwitchStore = {
      read: () => inner.read(),
      compareAndWrite: async (
        expectedVersion: number,
        next: KillSwitchState,
      ) => {
        if (losses > 0) {
          losses -= 1;
          return false;
        }
        return inner.compareAndWrite(expectedVersion, next);
      },
    };

    const service = new KillSwitchService(flaky);
    const state = await service.trip("operator-a", "race");

    expect(state.active).toBe(true);
    expect(await service.isActive()).toBe(true);
  });

  it("gives up with an error when writes keep losing the race", async () => {
    const never: KillSwitchStore = {
      read: async () => ({ active: false, version: 0 }),
      compareAndWrite: async () => false,
    };

    await expect(
      new KillSwitchService(never).trip("operator-a", "x"),
    ).rejects.toThrow("changed concurrently");
  });
});
