import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";
import {
  NonHumanCallerDeniedError,
  type ExecutionIntent,
  type StoredExecutionIntent,
} from "@parmana/shared";

import { isHumanCaller } from "../auth/isHumanCaller.js";
import { isOwnedByCaller } from "../auth/isOwnedByCaller.js";

/**
 * Execution Intents (ADR-0012).
 *
 * An intent is the signed statement, stored before an action is released, of
 * exactly what is being released. These routes let a caller read it, let an
 * operator list the intents that never reached a signed Trust Record, and let
 * an operator rebuild a missing Trust Record without calling the connector.
 */

const DEFAULT_UNFINALIZED_LIMIT = 50;
const MAX_UNFINALIZED_LIMIT = 200;

/**
 * The same response the policy governance routes give a caller whose
 * credential is not provisioned as a verified human.
 */
function denyNonHumanCaller(res: Response): void {
  const denied = new NonHumanCallerDeniedError();

  res.status(denied.status).json({
    error: denied.message,
    code: denied.code,
  });
}

/**
 * The saved release context is internal repair data and is never returned.
 */
function publicView(stored: StoredExecutionIntent) {
  return {
    intent: stored.intent,
    status: stored.status,
  };
}

function isPlausibleExecutionIntent(value: unknown): value is ExecutionIntent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const intent = value as Partial<ExecutionIntent>;

  return (
    typeof intent.intentId === "string" &&
    typeof intent.businessTransactionId === "string" &&
    typeof intent.authorizationId === "string" &&
    typeof intent.intentHash === "string" &&
    typeof intent.signature === "object" &&
    intent.signature !== null
  );
}

/**
 * POST /execution-intents/verify
 *
 * Deliberately exempt from caller authentication, like POST /refusal/verify:
 * it takes the intent itself and checks its hash and signature against the
 * deployment's public key. It reads nothing from storage.
 */
export function createExecutionIntentVerifyRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

  router.post(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const body: unknown = req.body;

        if (!isPlausibleExecutionIntent(body)) {
          res.status(400).json({
            error:
              "Request body must be an Execution Intent " +
              "(intentId, businessTransactionId, authorizationId, " +
              "intentHash, signature required).",
          });
          return;
        }

        const valid = await application.verifyExecutionIntent(body);

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

export function createExecutionIntentsRouter(
  application: ExecutionTrustApplication,
): Router {
  const router = Router();

  /**
   * GET /execution-intents/unfinalized
   *
   * Intents that never reached a signed Trust Record and were not closed by
   * hand, oldest first. Each is an action that may have been released with no
   * signed record. Verified human
   * credentials only, because it spans every caller's transactions.
   */
  router.get(
    "/unfinalized",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!isHumanCaller(req.callerCredentialHolderType)) {
          denyNonHumanCaller(res);
          return;
        }

        const requested = Number(req.query.limit);

        const limit =
          Number.isInteger(requested) && requested > 0
            ? Math.min(requested, MAX_UNFINALIZED_LIMIT)
            : DEFAULT_UNFINALIZED_LIMIT;

        const intents =
          await application.listUnfinalizedExecutionIntents(limit);

        res.json({ intents: intents.map(publicView) });
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  /**
   * GET /execution-intents/:businessTransactionId
   *
   * Ownership scoped, like GET /refusal/:businessTransactionId.
   */
  router.get(
    "/:businessTransactionId",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const businessTransactionId = String(req.params.businessTransactionId);

        if (
          req.callerId !== undefined &&
          !(await isOwnedByCaller(
            application,
            businessTransactionId,
            req.callerId,
          ))
        ) {
          res.status(404).json({ error: "Execution Intent not found." });
          return;
        }

        const stored = await application.getExecutionIntent(
          businessTransactionId,
        );

        if (!stored) {
          res.status(404).json({ error: "Execution Intent not found." });
          return;
        }

        res.json(publicView(stored));
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  /**
   * POST /execution-intents/:businessTransactionId/finalize
   *
   * Rebuilds the signed Execution Trust Record for an action that was released
   * but whose record was never produced. Never calls a connector. Safe to run
   * more than once. Verified human credentials only.
   */
  router.post(
    "/:businessTransactionId/finalize",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!isHumanCaller(req.callerCredentialHolderType)) {
          denyNonHumanCaller(res);
          return;
        }

        const businessTransactionId = String(req.params.businessTransactionId);

        const result = await application.finalizeExecutionIntent(
          businessTransactionId,
        );

        res.json({
          outcome: result.outcome,
          businessTransactionId,
          trustRecordId: result.trustRecord.trustRecordId,
          trustRecord: result.trustRecord,
        });
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  /**
   * POST /execution-intents/:businessTransactionId/resolve
   *
   * Closes a PREPARED or ERRORED intent that a verified human reconciled at the
   * connector (G-54). Body: { resolution: "NOT_EXECUTED" | "EXECUTED", note }.
   * The note is required. Never calls a connector. Idempotent. The resolution
   * is an attributed operator statement in unsigned status, not a signed
   * record. Verified human credentials only.
   */
  router.post(
    "/:businessTransactionId/resolve",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!isHumanCaller(req.callerCredentialHolderType)) {
          denyNonHumanCaller(res);
          return;
        }

        const businessTransactionId = String(req.params.businessTransactionId);

        const body: unknown = req.body;
        const fields =
          typeof body === "object" && body !== null && !Array.isArray(body)
            ? (body as Record<string, unknown>)
            : {};

        const result = await application.resolveExecutionIntent(
          businessTransactionId,
          {
            resolution: fields.resolution,
            note: fields.note,
            ...(req.callerId !== undefined && { resolvedBy: req.callerId }),
          },
        );

        res.json({
          outcome: result.outcome,
          businessTransactionId,
          ...publicView(result.stored),
        });
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  return router;
}
