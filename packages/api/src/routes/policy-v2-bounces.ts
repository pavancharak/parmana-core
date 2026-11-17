import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import type { PolicyV2BounceService } from "../policyV2/policyV2Bounces.js";
import { SnsRefused } from "../policyV2/policyV2Sns.js";

/**
 * POST /v2/notifications/ses (policy version 2)
 *
 * Amazon SNS posts SES bounces and complaints here. SNS has no caller key, so this route sits
 * outside caller authentication. It is safe because each message is verified against its signature
 * before anything in it is read. A message that does not verify gets 403.
 */

export function createPolicyV2BouncesRouter(
  service: PolicyV2BounceService,
): Router {
  const router = Router();

  router.post(
    "/ses",
    express.text({ type: "*/*", limit: "256kb" }),
    async (req: Request, res: Response, next: NextFunction) => {
      const body =
        typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body ?? "");
      try {
        res.status(200).json(await service.handle(body));
      } catch (error) {
        if (error instanceof SnsRefused) {
          res.status(403).json({ error: "not_verified" });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
