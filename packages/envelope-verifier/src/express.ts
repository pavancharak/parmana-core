import type { NextFunction, Request, Response } from "express";

import type { SignedExecutionAuthorization } from "@parmana/shared";

import type { EnvelopeVerifier } from "./EnvelopeVerifier.js";

/* eslint-disable @typescript-eslint/no-namespace */

/**
 * Minimal local type augmentation.
 *
 * Declared here rather than in a shared ambient
 * ".d.ts" so this stays a self-contained,
 * import-and-use entry point.
 */
declare global {
  namespace Express {
    interface Request {
      parmanaAuthorization?: import("./EnvelopeVerifier.js").EnvelopeVerificationResult;
    }
  }
}

/* eslint-enable @typescript-eslint/no-namespace */

interface AuthorizationRequestBody {
  readonly authorization?: SignedExecutionAuthorization;
}

/**
 * Express middleware factory.
 *
 * Reads req.body.authorization, verifies it, and
 * either rejects the request (401/403) or attaches
 * the verification result to the request and calls
 * next().
 *
 * This is a thin, optional entry point: importing it
 * requires Express's types (a peer/dev dependency
 * only — "import type" is erased at build time, so
 * this file has no runtime dependency on Express).
 */
export function requireParmanaAuthorization(verifier: EnvelopeVerifier) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const authorization = (req.body as AuthorizationRequestBody | undefined)
      ?.authorization;

    if (!authorization) {
      res.status(401).json({
        error: "authorization required",
      });

      return;
    }

    const result = await verifier.verify(authorization);

    if (!result.valid) {
      res.status(403).json({
        error: "authorization invalid",
        checks: result.checks,
      });

      return;
    }

    req.parmanaAuthorization = result;

    next();
  };
}
