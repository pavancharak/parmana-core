import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { PolicyV2ForbiddenError } from "../policyV2/policyV2Register.js";
import type { PolicyV2ReplayService } from "../policyV2/policyV2Replay.js";

/**
 * GET /v2/evidence/:recordId/replay (policy version 2)
 *
 * Replays a recorded decision and reports whether it reproduces. Only a caller that holds a
 * register role may replay. The replay changes nothing.
 */

export function createPolicyV2ReplayRouter(
  service: PolicyV2ReplayService,
): Router {
  const router = Router();

  router.get(
    "/:recordId/replay",
    async (req: Request, res: Response, next: NextFunction) => {
      const caller = req.callerId;
      if (caller === undefined) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      try {
        const result = await service.replayRecord(
          caller,
          String(req.params.recordId),
        );
        if (result === undefined) {
          res.status(404).json({ error: "not_found" });
          return;
        }
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof PolicyV2ForbiddenError) {
          res.status(403).json({ error: "forbidden", message: error.message });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
