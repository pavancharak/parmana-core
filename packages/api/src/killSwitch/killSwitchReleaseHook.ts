import { KillSwitchActiveError, type RuntimeHook } from "@parmana/runtime";

import type { KillSwitchService } from "./KillSwitchService.js";

/**
 * Refuses an action at release time while the kill switch is on (ADR-0017).
 *
 * The HTTP guard checks the switch when a request arrives. A request that has
 * already passed that check can take a while to reach release, so a trip in
 * between would otherwise be missed. This hook runs immediately before the
 * action is released to a connector, and it throws, which stops the release.
 */
export function killSwitchReleaseHook(service: KillSwitchService): RuntimeHook {
  return {
    async beforeExecution(): Promise<void> {
      if (await service.isActive()) {
        throw new KillSwitchActiveError();
      }
    },
  };
}
