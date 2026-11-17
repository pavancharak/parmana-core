import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { policyV2 } from "@parmana/policy";

import {
  PolicyV2ReviewRefused,
  type PolicyV2ReviewService,
} from "../policyV2/policyV2Reviews.js";

/**
 * POST /v2/reviews/:id/decision (policy version 2)
 *
 * A reviewer approves or rejects a review item. The caller is the authenticated caller, and must
 * hold an active grant for the item's action. Nothing is released by a decision.
 */

export function createPolicyV2ReviewsRouter(
  service: PolicyV2ReviewService,
): Router {
  const router = Router();

  router.post(
    "/:id/decision",
    async (req: Request, res: Response, next: NextFunction) => {
      const reviewer = req.callerId;
      if (reviewer === undefined) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      const body: unknown = req.body ?? {};
      const decision =
        typeof body === "object" && body !== null
          ? (body as { decision?: unknown }).decision
          : undefined;
      if (decision !== "approve" && decision !== "reject") {
        res.status(400).json({
          error: "invalid_request",
          message: 'decision must be "approve" or "reject".',
        });
        return;
      }
      try {
        res
          .status(200)
          .json(
            await service.decide(reviewer, String(req.params.id), decision),
          );
      } catch (error) {
        if (error instanceof PolicyV2ReviewRefused) {
          res.status(422).json({ error: "refused", message: error.message });
          return;
        }
        if (error instanceof policyV2.persistence.PersistenceConflictError) {
          res.status(409).json({
            error: "conflict",
            message:
              "The review changed while it was being saved. Read it again and retry.",
          });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
