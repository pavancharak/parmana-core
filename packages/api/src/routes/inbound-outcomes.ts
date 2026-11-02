import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

/**
 * POST /v1/inbound/outcomes (RFC-0025)
 *
 * Records what happened to an inbound refund after Parmana issued its decision. An outcome is
 * accepted only when the decision exists, the caller is the partner the decision was issued to,
 * and the payment ID and amount agree with the decision. One outcome per decision.
 */

export type InboundOutcomeStatus = "refunded" | "refused" | "error";

export interface InboundOutcomeRecord {
  readonly decisionId: string;
  readonly partnerId: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly amountInr: number;
  readonly status: InboundOutcomeStatus;
  readonly refundId?: string;
  readonly reason?: string;
  readonly recordedAt: string;
}

export interface InboundOutcomeDependencies {
  /** The decision Parmana issued, or null if none exists. */
  readonly findDecision: (decisionId: string) => Promise<{
    readonly decisionId: string;
    readonly partnerId: string;
    readonly paymentId: string;
    readonly limitInr: number;
  } | null>;
  /** Returns false if an outcome for this decision already exists. */
  readonly store: { append(record: InboundOutcomeRecord): Promise<boolean> };
  readonly now?: () => Date;
}

const STATUSES: readonly InboundOutcomeStatus[] = [
  "refunded",
  "refused",
  "error",
];

export function createInboundOutcomeRouter(
  deps: InboundOutcomeDependencies,
): Router {
  const router = Router();
  const now = deps.now ?? (() => new Date());

  router.post(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const partnerId = req.callerId;
        if (!partnerId) {
          res.status(401).json({ error: "unauthenticated" });
          return;
        }

        const body = req.body as Partial<Record<string, unknown>>;
        const decisionId =
          typeof body.decisionId === "string" ? body.decisionId : "";
        const orderId = typeof body.orderId === "string" ? body.orderId : "";
        const paymentId =
          typeof body.paymentId === "string" ? body.paymentId : "";
        const refundId =
          typeof body.refundId === "string" ? body.refundId : undefined;
        const reason =
          typeof body.reason === "string" ? body.reason : undefined;
        const status = STATUSES.find((s) => s === body.status);
        const amountInr = body.amountInr;

        if (!decisionId || !orderId || !paymentId || !status) {
          res.status(400).json({
            error: "decisionId, orderId, paymentId and a status are required",
          });
          return;
        }
        if (
          typeof amountInr !== "number" ||
          !Number.isInteger(amountInr) ||
          amountInr < 1
        ) {
          res.status(400).json({
            error: "amountInr must be a whole number of rupees, at least 1",
          });
          return;
        }
        if (status === "refunded" && !refundId) {
          res
            .status(400)
            .json({ error: "a refunded outcome needs the refundId" });
          return;
        }

        const decision = await deps.findDecision(decisionId);
        if (!decision) {
          res.status(404).json({ error: "decision_not_found" });
          return;
        }
        if (decision.partnerId !== partnerId) {
          res.status(403).json({ error: "not_your_decision" });
          return;
        }
        if (decision.paymentId !== paymentId) {
          res.status(422).json({ error: "payment_mismatch" });
          return;
        }
        if (amountInr > decision.limitInr) {
          res.status(422).json({ error: "amount_exceeds_limit" });
          return;
        }

        const record: InboundOutcomeRecord = {
          decisionId,
          partnerId,
          orderId,
          paymentId,
          amountInr,
          status,
          ...(refundId ? { refundId } : {}),
          ...(reason ? { reason } : {}),
          recordedAt: now().toISOString(),
        };
        const stored = await deps.store.append(record);
        if (!stored) {
          res.status(409).json({ error: "outcome_already_recorded" });
          return;
        }
        res.status(201).json(record);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
