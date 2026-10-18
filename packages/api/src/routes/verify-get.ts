import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";
import { isOwnedByCaller } from "../auth/isOwnedByCaller.js";

export function createVerifyGetRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

  /**
   * GET /verify/:id
   *
   * Returns the latest Verification.
   */
  router.get(
    "/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (
          req.callerId !== undefined &&
          !(await isOwnedByCaller(
            application,
            String(req.params.id),
            req.callerId,
          ))
        ) {
          res.status(404).json({
            error: "Execution Trust Record not found.",
          });
          return;
        }

        const record = await application.getTrustRecord(String(req.params.id));

        if (!record) {
          res.status(404).json({
            error: "Execution Trust Record not found.",
          });
          return;
        }

        const verification = record.verifications.at(-1);

        if (!verification) {
          res.status(404).json({
            error: "Verification not found.",
          });
          return;
        }

        res.json(verification);
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  return router;
}
