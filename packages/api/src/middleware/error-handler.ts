import type { NextFunction, Request, Response } from "express";

import {
  BusinessTransactionValidationError,
  DuplicateBusinessTransactionError,
  RuntimeError,
} from "@parmana/runtime";

import {
  PolicyNotFoundError,
  PolicyValidationError,
  PolicyVersionImmutableError,
  SignalValidationError,
} from "@parmana/policy";

import {
  ConnectorNotRegisteredError,
  NonceAlreadyConsumedError,
  AuthorizationNoLongerValidError,
} from "@parmana/shared";

import type { CallerAuditSink } from "../auth/CallerAuditSink.js";

/**
 * True for the two body-parser (express.json()) failure shapes every
 * route mounted after the global express.json() middleware can hit
 * before any route handler ever runs: an oversized body
 * ("entity.too.large") and malformed JSON ("entity.parse.failed"),
 * so every route gets the same clean 413/400 instead of falling through
 * to the generic 500 below.
 *
 * On Vercel, malformed JSON arrives in a third shape. Vercel's Node.js
 * runtime gives the request its own lazy req.body getter, and
 * express.json() reads req.body first, so the getter's error reaches
 * here instead of body-parser's: an Error "Invalid JSON" with
 * statusCode 400 and no type. Found 2026-09-28 from production logs,
 * where it produced a 500.
 */
function bodyParserErrorStatus(error: unknown): number | undefined {
  if (isVercelInvalidJsonError(error)) {
    return 400;
  }

  if (typeof error !== "object" || error === null || !("type" in error)) {
    return undefined;
  }

  const type = (error as { type?: unknown }).type;

  if (type === "entity.too.large") {
    return 413;
  }

  if (type === "entity.parse.failed") {
    return 400;
  }

  return undefined;
}

function isVercelInvalidJsonError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === "Invalid JSON" &&
    (error as { statusCode?: unknown }).statusCode === 400
  );
}

/**
 * Best-effort audit write for a structural rejection that happens
 * before any route handler -- and therefore before any caller identity
 * -- exists (G-29, docs/VERIFICATION-GAPS.md): a malformed or oversized
 * request body, rejected by express.json() itself, ahead of caller-auth
 * middleware. Deliberately fail-open, not fail-closed like every other
 * caller-audit write in this codebase (recordCallerAuditEvent.ts, 2.19):
 * this event has no caller identity to protect the accountability of in
 * the first place (nobody has been authenticated yet), so the
 * fail-closed rationale for 2.19 does not transfer here, and the same
 * reasoning docs/CLAIMS.md 3.11 already applies to RefusalRecord writes
 * applies just as directly -- a request that should be rejected is
 * already rejected, correctly, by the time this fires; failing the
 * response closed on top of that would trade a correct 400/413 for an
 * opaque 500 with no corresponding security gain. A write failure is
 * logged loudly, never thrown.
 */
function auditStructuralRejectionBestEffort(
  auditSink: CallerAuditSink | undefined,
  req: Request,
  reason: string,
): void {
  if (!auditSink) return;

  auditSink
    .record({
      type: "caller.structural_rejected",
      occurredAt: new Date().toISOString(),
      route: req.originalUrl,
      reason,
    })
    .catch((writeError: unknown) => {
      console.error({
        event: "structural_rejection_audit_write_failed",
        route: req.originalUrl,
        error:
          writeError instanceof Error ? writeError.message : String(writeError),
      });
    });
}

/**
 * Centralized API error handler. Returns the actual Express
 * error-handling middleware; `auditSink` is threaded through from
 * createApp so the one rejection path this file itself handles fully
 * (malformed/oversized body, below) can be audited -- every other
 * error branch below is reached only via a route handler, which
 * already owns its own audit call before calling next(error) (see
 * execute.ts / transactions.ts).
 */
export function createErrorHandler(auditSink?: CallerAuditSink) {
  return function errorHandler(
    error: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    //
    // Malformed / oversized request body (express.json(), before any
    // route handler runs)
    //
    const bodyParserStatus = bodyParserErrorStatus(error);

    if (bodyParserStatus !== undefined) {
      auditStructuralRejectionBestEffort(
        auditSink,
        req,
        bodyParserStatus === 413 ? "payload too large" : "malformed JSON body",
      );

      res.status(bodyParserStatus).json({
        error:
          bodyParserStatus === 413
            ? "Payload too large."
            : "Malformed JSON body.",
      });

      return;
    }

    //
    // Request / validation errors
    //
    if (
      error instanceof BusinessTransactionValidationError ||
      error instanceof PolicyValidationError ||
      error instanceof SignalValidationError
    ) {
      res.status(400).json({
        error: error.message,
      });

      return;
    }

    //
    // Missing policy
    //
    if (error instanceof PolicyNotFoundError) {
      res.status(404).json({
        error: error.message,
      });

      return;
    }

    //
    // Duplicate transaction
    //
    if (
      error instanceof DuplicateBusinessTransactionError ||
      error instanceof PolicyVersionImmutableError
    ) {
      res.status(409).json({
        error: error.message,
      });

      return;
    }

    //
    // Execution Gateway rejected a replayed (already-consumed-nonce)
    // authorization. Distinguished from a genuine server error (and from
    // every other Gateway verification failure — forged signature,
    // expired envelope, tampered content — which remain a plain Error and
    // fall through to the generic 500 below, unchanged) so a caller or a
    // monitoring system can tell "this already ran" apart from "something
    // broke" without string-matching a 500 body.
    //
    if (
      error instanceof NonceAlreadyConsumedError ||
      error instanceof ConnectorNotRegisteredError ||
      error instanceof AuthorizationNoLongerValidError
    ) {
      res.status(error.status).json({
        error: error.message,
        code: error.code,
        // RFC-0023 phase 4: a release refused because what it rested on
        // no longer holds was not executed.
        ...(error instanceof AuthorizationNoLongerValidError && {
          executionStatus: error.executionStatus,
        }),
      });

      return;
    }

    //
    // Any Runtime exception
    //
    if (error instanceof RuntimeError) {
      // RFC-0023 phase 4: an error that knows the execution status (for
      // EXECUTION_OUTCOME_UNKNOWN, EXECUTION_UNKNOWN) says it.
      const executionStatus = (error as { executionStatus?: unknown })
        .executionStatus;

      res.status(error.status).json({
        error: error.message,
        code: error.code,
        ...(typeof executionStatus === "string" && { executionStatus }),
      });

      return;
    }

    //
    // Unexpected failure
    //
    console.error(error);

    res.status(500).json({
      error: "Internal Server Error",
    });
  };
}
