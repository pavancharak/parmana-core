import { randomBytes } from "node:crypto";

import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  SameOperatorResetError,
  type KillSwitchService,
} from "../killSwitch/KillSwitchService.js";

export const KILL_SWITCH_TRIP_CAPABILITY = "kill-switch:trip";
export const KILL_SWITCH_RESET_CAPABILITY = "kill-switch:reset";
export const KILL_SWITCH_PROBE_CAPABILITY = "kill-switch:probe";

/**
 * Operator routes for the kill switch (ADR-0017). Trip and reset require the
 * matching capability on the caller's key. Status is open to any authenticated
 * caller, and echoes the nonce the caller sent. A reset that needs a second
 * operator answers 202 with the pending request; the second, different operator
 * completes it. The probe route records a scheduler's observation of a request
 * sent while the switch is in some state.
 *
 * Status is NOT signed in this slice. ADR-0017 requires a signed response; the
 * signature is added with the build-bound key (G-118).
 */
export function createKillSwitchRouter(service: KillSwitchService): Router {
  const router = Router();

  function requireCapability(capability: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const allowed = req.callerAllowedCapabilities ?? [];

      if (!allowed.includes(capability)) {
        res.status(403).json({
          error: "CAPABILITY_NOT_ALLOWED",
          message: `This key does not hold the ${capability} capability.`,
        });
        return;
      }

      next();
    };
  }

  function reasonFrom(req: Request): string | undefined {
    const reason = req.body?.reason;
    return typeof reason === "string" && reason.trim() !== ""
      ? reason.trim()
      : undefined;
  }

  router.post(
    "/trip",
    requireCapability(KILL_SWITCH_TRIP_CAPABILITY),
    async (req, res) => {
      const reason = reasonFrom(req);

      if (reason === undefined) {
        res.status(400).json({ error: "reason is required." });
        return;
      }

      const state = await service.trip(req.callerId ?? "unknown", reason);
      res.status(200).json(state);
    },
  );

  router.post(
    "/reset",
    requireCapability(KILL_SWITCH_RESET_CAPABILITY),
    async (req, res) => {
      const reason = reasonFrom(req);

      if (reason === undefined) {
        res.status(400).json({ error: "reason is required." });
        return;
      }

      try {
        const result = await service.reset(req.callerId ?? "unknown", reason);
        res.status(result.outcome === "pending" ? 202 : 200).json(result);
      } catch (error) {
        if (error instanceof SameOperatorResetError) {
          res.status(409).json({
            error: "SAME_OPERATOR_CANNOT_CONFIRM_RESET",
            message: error.message,
          });
          return;
        }

        throw error;
      }
    },
  );

  router.post(
    "/probes",
    requireCapability(KILL_SWITCH_PROBE_CAPABILITY),
    async (req, res) => {
      const status = req.body?.status;

      if (typeof status !== "number" || !Number.isInteger(status)) {
        res
          .status(400)
          .json({ error: "status is required and must be an integer." });
        return;
      }

      const errorCode =
        typeof req.body?.errorCode === "string"
          ? req.body.errorCode
          : undefined;
      const probe = await service.recordProbe(req.callerId ?? "unknown", {
        status,
        errorCode,
      });
      res.status(201).json(probe);
    },
  );

  router.get("/status", async (req, res) => {
    const nonce =
      typeof req.query.nonce === "string" && req.query.nonce !== ""
        ? req.query.nonce
        : randomBytes(16).toString("hex");
    const state = await service.state();

    res.status(200).json({ ...state, nonce, signed: false });
  });

  return router;
}
