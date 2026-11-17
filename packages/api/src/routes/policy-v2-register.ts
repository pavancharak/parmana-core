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

/** The go-live gate was run and not passed. The missing items are listed. */
class GateRefused extends Error {
  constructor(readonly missing: string[]) {
    super("The go-live gate is not passed.");
  }
}

const AUDIT_PAGE_DEFAULT = 100;
const AUDIT_PAGE_MAX = 500;

/** Reads a whole-number query parameter, or returns undefined if it is present and not one. */
function parseIntParam(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
}

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
  if (error instanceof GateRefused) {
    res.status(422).json({
      error: "refused",
      message: error.message,
      missing: error.missing,
    });
    return;
  }
  if (error instanceof InvalidBody) {
    res.status(400).json({ error: "invalid_request", message: error.message });
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

  router.get("/audit", async (req, res, next) => {
    const callerId = req.callerId;
    if (callerId === undefined) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    const after = parseIntParam(req.query.after, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = parseIntParam(
      req.query.limit,
      AUDIT_PAGE_DEFAULT,
      1,
      AUDIT_PAGE_MAX,
    );
    if (after === undefined || limit === undefined) {
      res.status(400).json({
        error: "invalid_request",
        message: `after must be a whole number, and limit a whole number from 1 to ${AUDIT_PAGE_MAX}.`,
      });
      return;
    }
    try {
      res.status(200).json(await service.auditPage(callerId, { after, limit }));
    } catch (error) {
      sendError(res, error, next);
    }
  });

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
    "/actions/:capability/reviewers",
    act((by, body, params) => {
      if (
        typeof body.reviewerId !== "string" ||
        body.reviewerId.trim() === ""
      ) {
        throw new InvalidBody("A reviewerId is required.");
      }
      if (body.maxAmount !== undefined && typeof body.maxAmount !== "number") {
        throw new InvalidBody("maxAmount must be a number.");
      }
      return service.grantReview(
        by,
        String(params.capability),
        body.reviewerId,
        typeof body.maxAmount === "number" ? body.maxAmount : undefined,
      );
    }),
  );

  router.post(
    "/actions/:capability/reviewers/:reviewerId/revoke",
    act((by, body, params) => {
      if (typeof body.reason !== "string") {
        throw new InvalidBody("A reason is required.");
      }
      return service.revokeReview(
        by,
        String(params.capability),
        String(params.reviewerId),
        body.reason,
      );
    }),
  );

  router.post(
    "/actions/:capability/tests",
    act((by, body, params) => {
      if (typeof body.tier !== "string" || body.tier.trim() === "") {
        throw new InvalidBody("A tier is required.");
      }
      return service.recordTest(by, String(params.capability), body.tier);
    }),
  );

  router.get("/actions/:capability/go-live", async (req, res, next) => {
    const callerId = req.callerId;
    if (callerId === undefined) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    try {
      const missing = await service.goLiveChecklist(
        callerId,
        String(req.params.capability),
      );
      res.status(200).json({ missing });
    } catch (error) {
      sendError(res, error, next);
    }
  });

  router.post(
    "/actions/:capability/go-live",
    act(async (by, _body, params) => {
      const result = await service.runGoLive(by, String(params.capability));
      if (!result.ok) throw new GateRefused(result.missing);
      return { live: true };
    }),
  );

  router.post(
    "/contacts",
    act((by, body) => {
      if (typeof body.personId !== "string" || body.personId.trim() === "") {
        throw new InvalidBody("A personId is required.");
      }
      const contact: policyV2.register.Contact = {
        ...(typeof body.email === "string" ? { email: body.email } : {}),
        ...(typeof body.phone === "string" ? { phone: body.phone } : {}),
      };
      return service.setContact(by, body.personId, contact);
    }),
  );

  router.post(
    "/policies",
    act((by, body) => service.proposePolicy(by, body)),
  );

  router.post(
    "/policies/:capability/:policyVersion/approve",
    act((by, _body, params) =>
      service.approvePolicy(
        by,
        String(params.capability),
        String(params.policyVersion),
      ),
    ),
  );

  router.post(
    "/approver-keys",
    act((by, body) =>
      service.proposeApproverKey(
        by,
        body as unknown as policyV2.register.ApproverKeyInput,
      ),
    ),
  );

  router.post(
    "/approver-keys/:approverId/:keyId/approve",
    act((by, _body, params) =>
      service.approveApproverKey(
        by,
        String(params.approverId),
        String(params.keyId),
      ),
    ),
  );

  router.post(
    "/approver-keys/:approverId/:keyId/revoke",
    act((by, body, params) => {
      if (typeof body.reason !== "string") {
        throw new InvalidBody("A reason is required.");
      }
      return service.revokeApproverKey(
        by,
        String(params.approverId),
        String(params.keyId),
        body.reason,
      );
    }),
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
