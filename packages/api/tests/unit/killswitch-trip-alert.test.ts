import { describe, expect, it } from "vitest";

import { MemoryAlertSink, type AlertSink } from "@parmana/runtime";

import {
  KillSwitchService,
  MemoryKillSwitchProbeLog,
  MemoryKillSwitchStore,
} from "../../src/killSwitch/KillSwitchService.js";

function service(alerts?: AlertSink) {
  return new KillSwitchService(new MemoryKillSwitchStore(), {
    resetNeedsSecondOperator: false,
    probes: new MemoryKillSwitchProbeLog(),
    alerts,
  });
}

describe("kill switch trip alert (G-138)", () => {
  it("emits killswitch.tripped with the operator, reason and version", async () => {
    const alerts = new MemoryAlertSink();
    const at = new Date("2026-11-08T12:30:00.000Z");

    const state = await service(alerts).trip("operator-1", "incident 42", at);
    await new Promise((resolve) => setImmediate(resolve));

    expect(state.active).toBe(true);
    expect(alerts.events).toEqual([
      {
        type: "killswitch.tripped",
        occurredAt: "2026-11-08T12:30:00.000Z",
        trippedBy: "operator-1",
        reason: "incident 42",
        switchVersion: state.version,
      },
    ]);
  });

  it("still trips when the alert destination fails", async () => {
    const broken: AlertSink = {
      emit: () => Promise.reject(new Error("destination down")),
    };

    const state = await service(broken).trip("operator-1", "incident 43");

    expect(state.active).toBe(true);
  });

  it("trips normally when no alert sink is configured", async () => {
    const state = await service().trip("operator-1", "incident 44");

    expect(state.active).toBe(true);
  });
});
