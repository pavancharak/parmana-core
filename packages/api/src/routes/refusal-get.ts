import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";
import { isOwnedByCaller } from "../auth/isOwnedByCaller.js";

/**
 * GET /refusal/:businessTransactionId (RFC-0021)
 *
 * Looks up a Refusal Record by transaction ID from Parmana's own
 * storage. Unlike POST /refusal/verify, this route stays behind
 * caller-auth and ownership scoping identically to /verify,
 * /verification, and /trust-records -- the underlying transaction
 * content (signals, intent parameters) may be sensitive, so lookup
 * is scoped even though independent signature verification (the
 * other route) is not.
 */
export function createRefusalGetRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

  router.get(
    "/:businessTransactionId",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const businessTransactionId = String(req.params.businessTransactionId);

        if (
          req.callerId !== undefined &&
          !(await isOwnedByCaller(
            application,
            businessTransactionId,
            req.callerId,
          ))
        ) {
          res.status(404).json({
            error: "Refusal Record not found.",
          });
          return;
        }

        const refusalRecord = await application.getRefusalRecord(
          businessTransactionId,
        );

        if (!refusalRecord) {
          res.status(404).json({
            error: "Refusal Record not found.",
          });
          return;
        }

        res.json(refusalRecord);
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  return router;
}
