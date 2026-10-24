import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { killSwitchReleaseGate } from "../../src/killSwitch/killSwitchReleaseHook.js";
import {
  KillSwitchService,
  MemoryKillSwitchProbeLog,
  MemoryKillSwitchStore,
} from "../../src/killSwitch/KillSwitchService.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * A trip that lands after the HTTP guard has passed a request must stop the
 * release (ADR-0017). The switch is checked three times on the way to a
 * connector: the HTTP guard, the runtime's pre-release hook, and the gateway's
 * release gate, immediately before the connector call. Each test trips the
 * switch between two of those checks, by answering "off" for the earlier ones
 * and "on" from a chosen point.
 */
describe("kill switch between the HTTP guard and release", () => {
  function buildApp(switchOnFromCheck: number | undefined) {
    const killSwitch = new KillSwitchService(new MemoryKillSwitchStore(), {
      resetNeedsSecondOperator: false,
      probes: new MemoryKillSwitchProbeLog(),
    });

    if (switchOnFromCheck !== undefined) {
      // Check 1 (the guard) is answered by mockResolvedValueOnce. Checks 2 up to
      // switchOnFromCheck - 1 answer "off"; from switchOnFromCheck on, "on".
      const answers = Array.from(
        { length: switchOnFromCheck - 2 },
        () => false,
      );
      vi.spyOn(killSwitch, "isActive")
        .mockResolvedValueOnce(false)
        .mockImplementation(async () => {
          const next = answers.shift();
          return next ?? true;
        });
    }

    const { executionSystem } = createInspectableExecutionSystem({
      releaseGate: killSwitchReleaseGate(killSwitch),
    });
    const application = createApplication(
      executionSystem,
      undefined,
      killSwitch,
    );

    return createApp(application, {
      callerAuth: "disabled",
      killSwitch,
    });
  }

  it("refuses the release when the switch trips after the guard", async () => {
    const app = buildApp(2);

    const response = await request(app)
      .post("/execute")
      .send(await createBusinessTransaction());

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("KILL_SWITCH_ACTIVE");
  });

  it("refuses the release at the gateway when the switch trips after the runtime's check", async () => {
    const app = buildApp(3);

    const response = await request(app)
      .post("/execute")
      .send(await createBusinessTransaction());

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("KILL_SWITCH_ACTIVE");
  });

  it("releases the same request when the switch stays off (control)", async () => {
    const app = buildApp(undefined);

    const response = await request(app)
      .post("/execute")
      .send(await createBusinessTransaction());

    expect(response.status).toBe(200);
  });
});
