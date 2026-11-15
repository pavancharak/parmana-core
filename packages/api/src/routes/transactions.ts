import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import type { ExecutionTrustApplication } from "@parmana/runtime";
import {
  BusinessTransactionValidationError,
  DuplicateBusinessTransactionError,
} from "@parmana/runtime";
import { BusinessTransactionMapper } from "../mappers/BusinessTransactionMapper.js";
import { isPrincipalAllowed } from "../auth/isPrincipalAllowed.js";
import { isCapabilityAllowed } from "../auth/isCapabilityAllowed.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";
import { recordCallerAuditEvent } from "../auth/recordCallerAuditEvent.js";
import { parsePagination } from "./pagination.js";
import { NonHumanCallerDeniedError } from "@parmana/shared";
import { isHumanCaller } from "../auth/isHumanCaller.js";

export function createTransactionsRouter(
  application: ExecutionTrustApplication,
  auditSink?: CallerAuditSink,
): Router {
  const router = Router();

  /**
   * Returns true when the value is a UUID.
   */
  function isValidBusinessTransactionId(value: unknown): value is string {
    return (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    );
  }

  /**
   * GET /transactions
   *
   * Lists accepted Business Transactions.
   */
  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const pagination = parsePagination(req.query);

        if (!pagination.ok) {
          res.status(400).json({ error: pagination.error });
          return;
        }

        const transactions = await application.listTransactions(
          pagination.page,
          pagination.pageSize,
        );

        // Filtered post-fetch, not pushed into the repository query —
        // a smaller, route-level change than threading callerId through
        // the storage layer. Trade-off: a page can legitimately return
        // fewer than pageSize items (or none) when other callers' rows
        // occupy that page's window; it never over-discloses, only
        // under-fills a page, which is a pagination-correctness
        // follow-up, not a security gap.
        const scoped =
          req.callerId === undefined
            ? transactions
            : transactions.filter(
                (transaction) =>
                  transaction.metadata?.submittedBy === req.callerId,
              );

        res.json(scoped);
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  /**
   * GET /transactions/:id
   *
   * Returns a Business Transaction.
   */
  router.get(
    "/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const transaction = await application.getTransaction(
          String(req.params.id),
        );

        if (
          !transaction ||
          (req.callerId !== undefined &&
            transaction.metadata?.submittedBy !== req.callerId)
        ) {
          res.status(404).json({
            error: "Business Transaction not found.",
          });
          return;
        }

        res.json(transaction);
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  /**
   * POST /transactions
   *
   * Executes a Business Transaction through Runtime
   */
  router.post(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Declared ahead of the try block, not inside it: `catch` below
      // needs it too (G-29 audit), and `try`/`catch` are separate block
      // scopes -- a `const` declared inside `try` is not visible there.
      const { businessTransactionId } = req.body ?? {};

      try {
        if (!isValidBusinessTransactionId(businessTransactionId)) {
          if (auditSink) {
            const recorded = await recordCallerAuditEvent(
              auditSink,
              {
                type: "caller.structural_rejected",
                occurredAt: new Date().toISOString(),
                route: req.originalUrl,
                ...(req.callerId !== undefined
                  ? { callerId: req.callerId }
                  : {}),
                ...(typeof businessTransactionId === "string"
                  ? { businessTransactionId }
                  : {}),
                reason: "businessTransactionId must be a valid UUID.",
              },
              req,
              next,
            );

            if (!recorded) return;
          }

          res.status(400).json({
            error: "businessTransactionId must be a valid UUID.",
          });
          return;
        }

        let transaction = BusinessTransactionMapper.fromRequest(req.body);

        if (req.callerId !== undefined) {
          const principalId = transaction.authority?.principalId;

          if (
            !isPrincipalAllowed(
              principalId,
              req.callerId,
              req.callerAllowedPrincipalIds,
            )
          ) {
            if (auditSink) {
              const recorded = await recordCallerAuditEvent(
                auditSink,
                {
                  type: "caller.principal_denied",
                  occurredAt: new Date().toISOString(),
                  route: req.originalUrl,
                  callerId: req.callerId,
                  ...(principalId !== undefined ? { principalId } : {}),
                  reason: "principal not allowed",
                },
                req,
                next,
              );

              if (!recorded) return;
            }

            res.status(403).json({
              error:
                "Caller is not permitted to assert this authority.principalId.",
            });
            return;
          }

          //
          // metadata.tenantId selects the signing key (tenant.<tenantId>),
          // so a caller may only name a tenant its own key lists. See
          // execute.ts's identical check for the rationale.
          //
          const tenantId = transaction.metadata?.tenantId;

          // null and absent both mean "no tenant" (the SDKs send null).
          if (
            tenantId !== undefined &&
            tenantId !== null &&
            !(req.callerAllowedTenantIds ?? []).includes(tenantId)
          ) {
            res.status(403).json({
              error: "Caller is not permitted to act for this tenantId.",
              code: "TENANT_NOT_ALLOWED",
            });
            return;
          }

          //
          // Caller capability binding: see execute.ts's identical check
          // for the full rationale. Runs before application.execute()
          // is reached, mirroring the principal check immediately
          // above.
          //
          const action = transaction.intent?.action;

          if (!isCapabilityAllowed(action, req.callerAllowedCapabilities)) {
            if (auditSink) {
              const recorded = await recordCallerAuditEvent(
                auditSink,
                {
                  type: "caller.capability_denied",
                  occurredAt: new Date().toISOString(),
                  route: req.originalUrl,
                  callerId: req.callerId,
                  ...(action !== undefined ? { capability: action } : {}),
                  reason: "capability not allowed",
                },
                req,
                next,
              );

              if (!recorded) return;
            }

            res.status(403).json({
              error: "Caller is not permitted to invoke this capability.",
              code: "CAPABILITY_NOT_ALLOWED",
            });
            return;
          }

          //
          // Mirrors execute.ts's identical "caller.capability_granted"
          // audit write and metadata.grantedCapability assignment (NF-004):
          // this route was recording denials but not grants, and was never
          // carrying the confirmed capability forward into
          // metadata.grantedCapability, so a transaction submitted via
          // /transactions signed an authorization missing
          // ExecutionAuthorizationPayload.grantedCapability that the
          // equivalent /execute submission would have carried. See
          // execute.ts's own comment for the full rationale.
          //
          if (auditSink) {
            const recorded = await recordCallerAuditEvent(
              auditSink,
              {
                type: "caller.capability_granted",
                occurredAt: new Date().toISOString(),
                route: req.originalUrl,
                callerId: req.callerId,
                ...(action !== undefined ? { capability: action } : {}),
              },
              req,
              next,
            );

            if (!recorded) return;
          }

          transaction = {
            ...transaction,
            metadata: {
              ...transaction.metadata,
              submittedBy: req.callerId,
              ...(transaction.intent?.action !== undefined && {
                grantedCapability: transaction.intent.action,
              }),
            },
          };
        }

        //
        // Declare only (decision D23): the transaction is accepted and recorded
        // as RECEIVED. Nothing is decided, signed or released. The caller
        // releases it with POST /transactions/{id}/execute.
        //
        const accepted = await application.declare(transaction);
        const received = await application.getTransactionStatus(
          accepted.businessTransactionId,
        );

        res.status(201).json({
          businessTransactionId: accepted.businessTransactionId,
          status: received?.status ?? null,
          acceptedAt: received?.occurredAt,
          transaction: accepted,
        });
        return;
      } catch (error) {
        //
        // Structural rejection audit trail (G-29, docs/internal/VERIFICATION-GAPS.md).
        // See execute.ts's identical block for the full rationale.
        //
        if (
          auditSink &&
          (error instanceof BusinessTransactionValidationError ||
            error instanceof DuplicateBusinessTransactionError)
        ) {
          const recorded = await recordCallerAuditEvent(
            auditSink,
            {
              type: "caller.structural_rejected",
              occurredAt: new Date().toISOString(),
              route: req.originalUrl,
              ...(req.callerId !== undefined ? { callerId: req.callerId } : {}),
              businessTransactionId,
              reason: error.message,
            },
            req,
            next,
          );

          if (!recorded) return;
        }

        next(error);
        return;
      }
    },
  );

  /**
   * GET /transactions/:id/status
   *
   * Returns the current status of a Business Transaction, and with
   * ?history=true the full status history, oldest first (decision D23).
   */
  router.get(
    "/:id/status",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const businessTransactionId = String(req.params.id);
        const transaction = await application.getTransaction(
          businessTransactionId,
        );

        if (
          !transaction ||
          (req.callerId !== undefined &&
            transaction.metadata?.submittedBy !== req.callerId)
        ) {
          res.status(404).json({
            error: "Business Transaction not found.",
          });
          return;
        }

        const current = await application.getTransactionStatus(
          businessTransactionId,
        );

        if (!current) {
          res.status(404).json({
            error: "No status is recorded for this Business Transaction.",
          });
          return;
        }

        const includeHistory = req.query.history === "true";

        res.json({
          businessTransactionId,
          current,
          ...(includeHistory && {
            history: await application.getTransactionStatusHistory(
              businessTransactionId,
            ),
          }),
        });
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  /**
   * POST /transactions/:id/execute
   *
   * Decides, signs and releases a declared Business Transaction, then verifies
   * it (decision D23). The caller must be the one that declared it, and must
   * still be allowed the principal and capability the transaction names.
   */
  router.post(
    "/:id/execute",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const businessTransactionId = String(req.params.id);
        const transaction = await application.getTransaction(
          businessTransactionId,
        );

        if (
          !transaction ||
          (req.callerId !== undefined &&
            transaction.metadata?.submittedBy !== req.callerId)
        ) {
          res.status(404).json({
            error: "Business Transaction not found.",
          });
          return;
        }

        if (req.callerId !== undefined) {
          const principalId = transaction.authority?.principalId;

          if (
            !isPrincipalAllowed(
              principalId,
              req.callerId,
              req.callerAllowedPrincipalIds,
            )
          ) {
            res.status(403).json({
              error:
                "Caller is not permitted to assert this authority.principalId.",
            });
            return;
          }

          const action = transaction.intent?.action;

          if (!isCapabilityAllowed(action, req.callerAllowedCapabilities)) {
            res.status(403).json({
              error: "Caller is not permitted to invoke this capability.",
              code: "CAPABILITY_NOT_ALLOWED",
            });
            return;
          }
        }

        const record = await application.executeAccepted(businessTransactionId);

        res.status(200).json(record);
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  /**
   * POST /transactions/:id/reconcile
   *
   * Operator reconciliation of a transaction left in EXECUTING (design section
   * 6a). Human operator credentials only. Never releases anything.
   */
  router.post(
    "/:id/reconcile",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!isHumanCaller(req.callerCredentialHolderType)) {
          const denied = new NonHumanCallerDeniedError();

          res.status(denied.status).json({
            error: denied.message,
            code: denied.code,
          });
          return;
        }

        const businessTransactionId = String(req.params.id);
        const result = await application.reconcileTransaction(
          businessTransactionId,
          req.callerId ?? "unidentified-operator",
        );

        res.status(200).json({
          businessTransactionId,
          ...result,
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
