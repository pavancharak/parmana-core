import type { NextFunction, Request, Response } from "express";

import type { KillSwitchService } from "./KillSwitchService.js";

/**
 * Refuses a request with KILL_SWITCH_ACTIVE while the switch is on (ADR-0017).
 * Mounted only on the authorization and approval routes, never on the
 * kill-switch routes themselves, so the switch can always be cleared.
 */
export function killSwitchGuard(service: KillSwitchService) {
  return async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (await service.isActive()) {
      res.status(503).json({
        error: "KILL_SWITCH_ACTIVE",
        message:
          "The operator kill switch is on. No authorization or approval is accepted until an operator resets it.",
      });
      return;
    }

    next();
  };
}
