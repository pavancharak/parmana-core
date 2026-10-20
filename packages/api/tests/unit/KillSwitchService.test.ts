import { describe, expect, it } from "vitest";

import {
  KillSwitchService,
  MemoryKillSwitchProbeLog,
  MemoryKillSwitchStore,
  SameOperatorResetError,
  type KillSwitchState,
  type KillSwitchStore,
} from "../../src/killSwitch/KillSwitchService.js";

const ONE_OPERATOR = {
  resetNeedsSecondOperator: false,
  probes: new MemoryKillSwitchProbeLog(),
};
const TWO_OPERATORS = {
  resetNeedsSecondOperator: true,
  probes: new MemoryKillSwitchProbeLog(),
};

describe("KillSwitchService (ADR-0017, first slice)", () => {
  it("starts inactive", async () => {
    const service = new KillSwitchService(
      new MemoryKillSwitchStore(),
      ONE_OPERATOR,
    );

    expect(await service.isActive()).toBe(false);
  });

  it("trips and resets, recording who and why", async () => {
    const service = new KillSwitchService(
      new MemoryKillSwitchStore(),
      ONE_OPERATOR,
    );

    const tripped = await service.trip("operator-a", "suspicious refunds");
    expect(tripped.active).toBe(true);
    expect(tripped.trippedBy).toBe("operator-a");
    expect(tripped.tripReason).toBe("suspicious refunds");
    expect(await service.isActive()).toBe(true);

    const { outcome, state: reset } = await service.reset(
      "operator-b",
      "reviewed, safe",
    );
    expect(outcome).toBe("reset");
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

    expect(await new KillSwitchService(broken, ONE_OPERATOR).isActive()).toBe(
      true,
    );
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

    const service = new KillSwitchService(flaky, ONE_OPERATOR);
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
      new KillSwitchService(never, ONE_OPERATOR).trip("operator-a", "x"),
    ).rejects.toThrow("changed concurrently");
  });

  it("holds a reset as pending until a second, different operator confirms it", async () => {
    const service = new KillSwitchService(
      new MemoryKillSwitchStore(),
      TWO_OPERATORS,
    );
    await service.trip("operator-a", "suspicious refunds");

    const first = await service.reset("operator-b", "looks fine");
    expect(first.outcome).toBe("pending");
    expect(first.state.active).toBe(true);
    expect(first.state.pendingResetBy).toBe("operator-b");
    expect(await service.isActive()).toBe(true);

    const second = await service.reset("operator-c", "confirmed");
    expect(second.outcome).toBe("reset");
    expect(second.state.active).toBe(false);
    expect(second.state.resetBy).toBe("operator-c");
    expect(second.state.resetRequestedBy).toBe("operator-b");
    expect(second.state.pendingResetBy).toBeUndefined();
  });

  it("refuses a second reset from the same operator who asked first", async () => {
    const service = new KillSwitchService(
      new MemoryKillSwitchStore(),
      TWO_OPERATORS,
    );
    await service.trip("operator-a", "suspicious refunds");
    await service.reset("operator-b", "first");

    await expect(service.reset("operator-b", "again")).rejects.toBeInstanceOf(
      SameOperatorResetError,
    );
    expect(await service.isActive()).toBe(true);
  });

  it("a new trip cancels a pending reset", async () => {
    const service = new KillSwitchService(
      new MemoryKillSwitchStore(),
      TWO_OPERATORS,
    );
    await service.trip("operator-a", "first");
    await service.reset("operator-b", "pending");

    const state = await service.trip("operator-a", "second");
    expect(state.pendingResetBy).toBeUndefined();

    const next = await service.reset("operator-c", "alone again");
    expect(next.outcome).toBe("pending");
  });

  it("records a probe as passed when a tripped switch refuses the request", async () => {
    const probes = new MemoryKillSwitchProbeLog();
    const service = new KillSwitchService(new MemoryKillSwitchStore(), {
      resetNeedsSecondOperator: false,
      probes,
    });
    await service.trip("operator-a", "probe test");

    const probe = await service.recordProbe("scheduler", {
      status: 503,
      errorCode: "KILL_SWITCH_ACTIVE",
    });

    expect(probe.refused).toBe(true);
    expect(probe.switchActive).toBe(true);
    expect(probe.passed).toBe(true);
    expect(probes.probes).toHaveLength(1);
  });

  it("records a probe as failed when a tripped switch lets the request through", async () => {
    const service = new KillSwitchService(
      new MemoryKillSwitchStore(),
      ONE_OPERATOR,
    );
    await service.trip("operator-a", "probe test");

    const probe = await service.recordProbe("scheduler", { status: 200 });

    expect(probe.refused).toBe(false);
    expect(probe.passed).toBe(false);
  });
});
