import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { BusinessTransactionMapper } from "../mappers/BusinessTransactionMapper.js";
import { isPrincipalAllowed } from "../auth/isPrincipalAllowed.js";
import { isCapabilityAllowed } from "../auth/isCapabilityAllowed.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";
import { recordCallerAuditEvent } from "../auth/recordCallerAuditEvent.js";
import {
  BusinessTransactionValidationError,
  DuplicateBusinessTransactionError,
} from "@parmana/runtime";
import type { ExecutionTrustApplication } from "@parmana/runtime";

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
 * Creates the Execute router.
 */
export function createExecuteRouter(
  application: ExecutionTrustApplication,
  auditSink?: CallerAuditSink,
): Router {
  const router = Router();

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

        //
        // Caller identity binding: an authenticated caller may only
        // submit a transaction under an authority.principalId it is
        // actually permitted to assert (see isPrincipalAllowed.ts).
        // Skipped only when caller-auth itself is disabled (no
        // req.callerId at all), matching that mode's existing
        // no-caller-identity posture. Audited the same way
        // isCapabilityAllowed's own check just below is: a signed
        // caller.principal_denied record, not just an HTTP response.
        //
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
        }

        //
        // Caller capability binding: an authenticated caller may only
        // invoke a capability (intent.action) it is explicitly
        // permitted to invoke (see isCapabilityAllowed.ts). Runs
        // before the transaction ever reaches application.execute()
        // -- i.e. before CapabilityPolicyBinder/PolicyEngine.evaluate
        // are reached -- since neither of those is caller-aware by
        // design. Skipped only when caller-auth itself is disabled
        // (no req.callerId at all), matching isPrincipalAllowed's own
        // no-caller-identity posture above.
        //
        if (req.callerId !== undefined) {
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
          // metadata.tenantId selects the signing key (tenant.<tenantId>,
          // TenantKeyResolver), so a caller may only name a tenant its own
          // key lists. Otherwise any caller could have its authorization
          // signed with another tenant's key.
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
          // Mirrors the "caller.capability_denied" audit write above:
          // records which capability was actually granted, not just
          // which ones were refused, so the caller-audit trail alone
          // (not just execution-control's audit trail, see
          // ExecutionAuditEvent.action) can answer "what could caller
          // X invoke, and did they."
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
        }

        //
        // metadata.submittedBy is server-set from the authenticated
        // caller, never trusted from the client (any client-supplied
        // value is overwritten here) — this is what
        // isOwnedByCaller.ts scopes /trust-records, /verify,
        // /verification, /replay, and /receipt* by.
        //
        // metadata.grantedCapability carries forward the exact
        // capability the isCapabilityAllowed() check above just
        // confirmed for this caller, so RuntimeEngine can sign it
        // into the authorization (ExecutionAuthorizationPayload.
        // grantedCapability) instead of discarding the check's result
        // once the request passes.
        //
        if (req.callerId !== undefined) {
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

        const result = await application.execute(transaction);

        res.json(result);
        return;
      } catch (error) {
        //
        // Structural rejection audit trail (G-29,
        // docs/VERIFICATION-GAPS.md): a Business Transaction that fails
        // trust-chain/required-field validation, or that reuses an
        // already-accepted businessTransactionId, is rejected correctly
        // (400/409, unchanged, below) but previously left no durable
        // record. Audited the same fail-closed way as the
        // principal/capability checks above -- before next(error), not
        // after -- so a write failure surfaces as 503 AUDIT_UNAVAILABLE
        // rather than silently letting the rejection go unrecorded.
        // Every other error this route can produce (PolicyNotFoundError,
        // NonceAlreadyConsumedError, an unexpected 500, ...) is
        // deliberately not audited here -- out of G-29's scope, which
        // covers only structural/admission-time rejections, not policy
        // or execution-layer failures.
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

  return router;
}
