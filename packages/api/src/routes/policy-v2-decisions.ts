import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { policyV2 } from "@parmana/policy";

import {
  PolicyV2NotEnabledError,
  type PolicyV2DecisionService,
} from "../policyV2/policyV2Decisions.js";

/**
 * POST /v2/decisions (policy version 2, first slice)
 *
 * Runs and records a decision under policy version 2. Nothing is released; the response
 * states released: false. The caller is the authenticated caller.
 */

const CAPABILITY_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

type ParseResult =
  | { readonly ok: true; readonly request: policyV2.decision.DecisionRequest }
  | { readonly ok: false; readonly message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDecisionBody(body: unknown): ParseResult {
  if (!isObject(body))
    return { ok: false, message: "The body must be a JSON object." };
  const { capability, transactionId, target, parameters, signals, approvals } =
    body;
  if (typeof capability !== "string" || !CAPABILITY_PATTERN.test(capability))
    return { ok: false, message: "capability must look like namespace:verb." };
  if (typeof transactionId !== "string" || transactionId.trim() === "")
    return { ok: false, message: "transactionId is required." };
  if (typeof target !== "string")
    return { ok: false, message: "target must be a string." };
  if (parameters !== undefined && !isObject(parameters))
    return { ok: false, message: "parameters must be an object." };
  if (signals !== undefined && !isObject(signals))
    return { ok: false, message: "signals must be an object." };
  if (approvals !== undefined && !isObject(approvals))
    return { ok: false, message: "approvals must be an object." };
  return {
    ok: true,
    request: {
      capability,
      transactionId,
      target,
      parameters: parameters ?? {},
      signals: signals ?? {},
      ...(approvals !== undefined ? { approvals } : {}),
    },
  };
}

export function createPolicyV2DecisionsRouter(
  service: PolicyV2DecisionService,
): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    const caller = req.callerId;
    if (caller === undefined) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    const parsed = parseDecisionBody(req.body);
    if (!parsed.ok) {
      res
        .status(400)
        .json({ error: "invalid_request", message: parsed.message });
      return;
    }
    try {
      res.status(200).json(await service.decide(parsed.request, caller));
    } catch (error) {
      if (error instanceof PolicyV2NotEnabledError) {
        res.status(404).json({ error: "not_enabled" });
        return;
      }
      if (error instanceof policyV2.persistence.PersistenceConflictError) {
        res.status(409).json({
          error: "conflict",
          message:
            "The decision state changed while it was being recorded. Retry the request.",
        });
        return;
      }
      next(error);
    }
  });

  return router;
}
