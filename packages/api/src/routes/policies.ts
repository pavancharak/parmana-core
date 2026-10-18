import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { policyRepository } from "../application.js";

const router = Router();

/**
 * POST /policies/validate
 *
 * Validates that a policy exists and is readable.
 */
router.post(
  "/validate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { policyId, policyVersion } = req.body ?? {};

      if (typeof policyId !== "string" || policyId.length === 0) {
        res.status(400).json({
          valid: false,
          errors: ["policyId is required."],
        });
        return;
      }

      if (typeof policyVersion !== "string" || policyVersion.length === 0) {
        res.status(400).json({
          valid: false,
          errors: ["policyVersion is required."],
        });
        return;
      }

      await policyRepository.load(policyId, policyVersion);

      res.json({
        valid: true,
        errors: [],
      });
      return;
    } catch (error) {
      if (error instanceof Error) {
        res.status(404).json({
          valid: false,
          errors: [error.message],
        });
        return;
      }

      next(error);
      return;
    }
  },
);

export default router;
