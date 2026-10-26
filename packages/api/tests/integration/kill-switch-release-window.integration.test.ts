import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import {
  KillSwitchService,
  MemoryKillSwitchProbeLog,
  MemoryKillSwitchStore,
} from "../../src/killSwitch/KillSwitchService.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";
import type { ConnectorExecutor } from "@parmana/execution-control";

/**
 * A trip that lands after the HTTP guard has passed a request, but before the
 * action is released, must stop the release (ADR-0017).
 *
 * The guard checks the switch once when the request arrives. The release hook
 * checks it again just before the connector. The spy below simulates a trip in
 * between: the first check (the guard) sees the switch off, and every later
 * check (the release hook) sees it on.
 */
describe("kill switch between the HTTP guard and release", () => {
  function buildApp(tripAfterGuard: boolean) {
    const execute = vi.fn(
      async (executableContent: Record<string, unknown>) => ({
        ...executableContent,
        success: true,
        executedAt: new Date(),
        metadata: {},
      }),
    );
    const { executionSystem } = createInspectableExecutionSystem({
      executor: { execute } as unknown as ConnectorExecutor,
    });
    const killSwitch = new KillSwitchService(new MemoryKillSwitchStore(), {
      resetNeedsSecondOperator: false,
      probes: new MemoryKillSwitchProbeLog(),
    });

    if (tripAfterGuard) {
      vi.spyOn(killSwitch, "isActive")
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);
    }

    const application = createApplication(
      executionSystem,
      undefined,
      killSwitch,
    );

    return {
      app: createApp(application, {
        callerAuth: "disabled",
        killSwitch,
      }),
      execute,
    };
  }

  it("refuses the release with KILL_SWITCH_ACTIVE when the switch trips after the guard", async () => {
    const { app, execute } = buildApp(true);

    const response = await request(app)
      .post("/execute")
      .send(await createBusinessTransaction());

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("KILL_SWITCH_ACTIVE");
    expect(execute).not.toHaveBeenCalled();
  });

  it("releases the same request when the switch stays off (control)", async () => {
    const { app, execute } = buildApp(false);

    const response = await request(app)
      .post("/execute")
      .send(await createBusinessTransaction());

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
