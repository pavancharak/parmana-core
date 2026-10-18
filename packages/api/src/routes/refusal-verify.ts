import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";
import type { RefusalRecord } from "@parmana/shared";

/**
 * Minimal structural check -- this codebase does not use a runtime
 * schema validation library anywhere else (see execute.ts's own
 * businessTransactionId-only check), so this stays consistent with
 * that convention rather than introducing one just for this route.
 */
function isPlausibleRefusalRecord(value: unknown): value is RefusalRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Partial<RefusalRecord>;

  return (
    typeof record.refusalRecordId === "string" &&
    typeof record.businessTransactionId === "string" &&
    typeof record.refusalRecordHash === "string" &&
    typeof record.signature === "object" &&
    record.signature !== null &&
    typeof record.decision === "object" &&
    record.decision !== null
  );
}

/**
 * POST /refusal/verify (RFC-0021)
 *
 * Verifies a Refusal Record's signature. Deliberately mounted before
 * this app's caller-auth middleware (see app.ts) -- no caller
 * authentication or API key is required, by design: this is the
 * capability that makes a refusal independently third-party
 * verifiable. It takes the record itself, not a lookup by ID -- no
 * database access, no ownership check, nothing but the artifact and
 * Parmana's public key.
 */
export function createRefusalVerifyRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

  router.post(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const body = req.body;

        if (!isPlausibleRefusalRecord(body)) {
          res.status(400).json({
            error:
              "Request body must be a Refusal Record " +
              "(refusalRecordId, businessTransactionId, decision, " +
              "refusalRecordHash, signature required).",
          });
          return;
        }

        const valid = await application.verifyRefusalRecord(body);

        res.json({ valid });
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  return router;
}
