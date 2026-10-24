import { describe, expect, it } from "vitest";

import { KillSwitchActiveError } from "@parmana/runtime";

import {
  KillSwitchService,
  MemoryKillSwitchProbeLog,
  MemoryKillSwitchStore,
} from "../../src/killSwitch/KillSwitchService.js";
import { killSwitchReleaseHook } from "../../src/killSwitch/killSwitchReleaseHook.js";

const ONE_OPERATOR = {
  resetNeedsSecondOperator: false,
  probes: new MemoryKillSwitchProbeLog(),
};

describe("killSwitchReleaseHook", () => {
  it("lets a release through while the switch is off", async () => {
    const service = new KillSwitchService(new MemoryKillSwitchStore(), ONE_OPERATOR);
    const hook = killSwitchReleaseHook(service);

    await expect(hook.beforeExecution?.({} as never)).resolves.toBeUndefined();
  });

  it("refuses a release with KILL_SWITCH_ACTIVE once the switch is on", async () => {
    const service = new KillSwitchService(new MemoryKillSwitchStore(), ONE_OPERATOR);
    await service.trip("operator-a", "suspicious refunds");
    const hook = killSwitchReleaseHook(service);

    const attempt = hook.beforeExecution?.({} as never);

    await expect(attempt).rejects.toBeInstanceOf(KillSwitchActiveError);
    await expect(attempt).rejects.toMatchObject({
      status: 503,
      code: "KILL_SWITCH_ACTIVE",
    });
  });
});
