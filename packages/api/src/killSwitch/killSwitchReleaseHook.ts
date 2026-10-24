import { KillSwitchActiveError } from "@parmana/shared";
import type { RuntimeHook } from "@parmana/runtime";
import type { ReleaseGate } from "@parmana/execution-gateway";

import type { KillSwitchService } from "./KillSwitchService.js";

/**
 * Refuses an action at release time while the kill switch is on (ADR-0017).
 *
 * The HTTP guard checks the switch when a request arrives. A request that has
 * already passed that check can take a while to reach release, so a trip in
 * between would otherwise be missed. This runs before the runtime signs the
 * execution intent, so a stopped action leaves no intent behind.
 */
export function killSwitchReleaseHook(service: KillSwitchService): RuntimeHook {
  return {
    async beforeExecution(): Promise<void> {
      await killSwitchReleaseGate(service).assertOpen();
    },
  };
}

/**
 * Checked by the execution gateway immediately before a connector call. The
 * last check before release, so a trip that lands after the runtime's hook is
 * still refused here.
 */
export function killSwitchReleaseGate(service: KillSwitchService): ReleaseGate {
  return {
    async assertOpen(): Promise<void> {
      if (await service.isActive()) {
        throw new KillSwitchActiveError();
      }
    },
  };
}
