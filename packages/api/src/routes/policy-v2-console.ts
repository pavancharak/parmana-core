import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { policyV2 } from "@parmana/policy";

import { PolicyV2ForbiddenError } from "../policyV2/policyV2Register.js";
import {
  CONSOLE_SCREENS,
  type ConsoleScreenName,
  type PolicyV2ConsoleService,
} from "../policyV2/policyV2Console.js";

/**
 * GET /v2/console/:screen (policy version 2)
 *
 * Serves one screen of the governance console as HTML. The caller must hold a register role, and a
 * role that is not allowed the screen gets 403. The screens are read-only.
 */

export function createPolicyV2ConsoleRouter(
  service: PolicyV2ConsoleService,
): Router {
  const router = Router();

  router.get(
    "/:screen",
    async (req: Request, res: Response, next: NextFunction) => {
      const caller = req.callerId;
      if (caller === undefined) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      const screen = String(req.params.screen);
      if (!(CONSOLE_SCREENS as readonly string[]).includes(screen)) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const capability =
        typeof req.query.capability === "string"
          ? req.query.capability
          : undefined;
      try {
        const html = await service.render(
          caller,
          screen as ConsoleScreenName,
          capability,
        );
        res.status(200).type("html").send(html);
      } catch (error) {
        if (error instanceof PolicyV2ForbiddenError) {
          res.status(403).json({ error: "forbidden", message: error.message });
          return;
        }
        if (error instanceof policyV2.console.ConsoleError) {
          res.status(403).json({ error: "forbidden", message: error.message });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
