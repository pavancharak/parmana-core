import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { policyV2 } from "@parmana/policy";

import {
  PolicyV2ForbiddenError,
  PolicyV2RegisterService,
  type PolicyV2RegisterRole,
} from "../policyV2/policyV2Register.js";

/**
 * Routes for the policy version 2 register. The caller is the authenticated caller, and its
 * roles come from the role store. A refused change returns 422 with the register's reason.
 */

const ROLES: readonly PolicyV2RegisterRole[] = [
  "second-approver",
  "risk-function",
  "parmana-owner",
  "source-owner",
  "action-owner",
  "gate-owner",
  "reviewer",
];

/** A body that is missing a required field or has the wrong type. */
class InvalidBody extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is PolicyV2RegisterRole {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  );
}

function sendError(res: Response, error: unknown, next: NextFunction): void {
  if (error instanceof PolicyV2ForbiddenError) {
    res.status(403).json({ error: "forbidden", message: error.message });
    return;
  }
  if (error instanceof policyV2.register.RegisterError) {
    res.status(422).json({ error: "refused", message: error.message });
    return;
  }
  if (error instanceof InvalidBody) {
    res.status(400).json({ error: "invalid_request", message: error.message });
    return;
  }
  if (error instanceof policyV2.persistence.RoleChangeError) {
    res.status(422).json({ error: "refused", message: error.message });
    return;
  }
  if (error instanceof policyV2.persistence.PersistenceConflictError) {
    res.status(409).json({
      error: "conflict",
      message:
        "The register changed while it was being saved. Read it again and retry.",
    });
    return;
  }
  next(error);
}

export function createPolicyV2RegisterRouter(
  service: PolicyV2RegisterService,
): Router {
  const router = Router();

  /** Runs one change for the caller, with a body that must be a JSON object. */
  const act =
    (
      handler: (
        callerId: string,
        body: Record<string, unknown>,
        params: Record<string, string | string[] | undefined>,
      ) => Promise<unknown>,
    ) =>
    async (req: Request, res: Response, next: NextFunction) => {
      const callerId = req.callerId;
      if (callerId === undefined) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      const body: unknown = req.body ?? {};
      if (!isObject(body)) {
        res.status(400).json({
          error: "invalid_request",
          message: "The body must be a JSON object.",
        });
        return;
      }
      try {
        res.status(200).json(await handler(callerId, body, req.params));
      } catch (error) {
        sendError(res, error, next);
      }
    };

  router.get("/", async (req, res, next) => {
    const callerId = req.callerId;
    if (callerId === undefined) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    try {
      res.status(200).json(await service.read(callerId));
    } catch (error) {
      sendError(res, error, next);
    }
  });

  router.post(
    "/roles/grant",
    act(async (by, body) => {
      if (typeof body.callerId !== "string" || !isRole(body.role)) {
        throw new InvalidBody("callerId and a known role are required.");
      }
      await service.grantRole(by, body.callerId, body.role);
      return { granted: true };
    }),
  );

  router.post(
    "/roles/revoke",
    act(async (by, body) => {
      if (typeof body.callerId !== "string" || !isRole(body.role)) {
        throw new InvalidBody("callerId and a known role are required.");
      }
      await service.revokeRole(by, body.callerId, body.role);
      return { revoked: true };
    }),
  );

  router.post(
    "/sources",
    act((by, body) =>
      service.proposeSource(
        by,
        body as unknown as policyV2.register.SourceInput,
      ),
    ),
  );

  router.post(
    "/sources/:name/approve",
    act((by, _body, params) => service.approveSource(by, String(params.name))),
  );

  router.post(
    "/sources/:name/revoke",
    act((by, body, params) => {
      if (typeof body.reason !== "string") {
        throw new InvalidBody("A reason is required.");
      }
      return service.revokeSource(by, String(params.name), body.reason);
    }),
  );

  router.post(
    "/thresholds",
    act((by, body) =>
      service.proposeThreshold(
        by,
        body as unknown as policyV2.register.ThresholdInput,
      ),
    ),
  );

  router.post(
    "/thresholds/:action/:name/approve",
    act((by, _body, params) =>
      service.approveThreshold(by, String(params.action), String(params.name)),
    ),
  );

  router.post(
    "/actions",
    act((by, body) =>
      service.registerAction(
        by,
        body as unknown as policyV2.register.ActionInput,
      ),
    ),
  );

  return router;
}
