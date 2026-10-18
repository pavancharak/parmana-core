import { Router } from "express";
import type { Request, Response } from "express";

/**
 * Creates the /callers/me router.
 *
 * The proof artifact a buyer's security review asks for: "show me
 * this agent's identity and exactly what it's authorized to do."
 * Read-only, self-lookup only (an authenticated caller sees its own
 * record, never another caller's), and never returns key material --
 * identity and resolved scope only.
 *
 * Resolved, not raw: allowedPrincipalIds/allowedCapabilities reflect
 * the *effective* scope after defaults are applied (see
 * isPrincipalAllowed.ts and isCapabilityAllowed.ts), not the raw
 * ApiKeyEntry configuration -- a reader should not need to know the
 * "unset allowedPrincipalIds defaults to self, unset
 * allowedCapabilities defaults to none" rules to answer "what can
 * this caller do."
 */
export function createCallersMeRouter(): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response): void => {
    if (req.callerId === undefined) {
      res.status(404).json({
        error: "No authenticated caller identity available.",
      });
      return;
    }

    const allowedPrincipalIds =
      req.callerAllowedPrincipalIds !== undefined
        ? [...req.callerAllowedPrincipalIds]
        : [req.callerId];

    const allowedCapabilities =
      req.callerAllowedCapabilities !== undefined
        ? [...req.callerAllowedCapabilities]
        : [];

    res.json({
      callerId: req.callerId,
      allowedPrincipalIds,
      allowedCapabilities,
      unrestrictedCapabilities: allowedCapabilities.includes("*"),
    });
  });

  return router;
}
