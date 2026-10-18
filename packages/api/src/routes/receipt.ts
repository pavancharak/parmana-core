import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";
import { isOwnedByCaller } from "../auth/isOwnedByCaller.js";

export function createReceiptRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

  /**
   * Returns true when the Business Transaction ID
   * is a valid UUID.
   */
  function isValidBusinessTransactionId(value: unknown): value is string {
    return (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    );
  }

  /**
   * POST /receipt
   *
   * Generates a Receipt for a verified
   * Execution Trust Record.
   */
  router.post(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { businessTransactionId } = req.body ?? {};

        //
        // Required field
        //
        if (!businessTransactionId) {
          res.status(400).json({
            error: "businessTransactionId is required.",
          });
          return;
        }

        //
        // UUID validation
        //
        if (!isValidBusinessTransactionId(businessTransactionId)) {
          res.status(400).json({
            error: "businessTransactionId must be a valid UUID.",
          });
          return;
        }

        if (
          req.callerId !== undefined &&
          !(await isOwnedByCaller(
            application,
            businessTransactionId,
            req.callerId,
          ))
        ) {
          res.status(404).json({
            error: "Execution Trust Record not found.",
          });
          return;
        }

        const receipt = await application.generateReceipt(
          businessTransactionId,
        );

        res.json(receipt);
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  return router;
}
