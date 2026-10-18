import crypto from "node:crypto";

import type { NextFunction, Request } from "express";

import {
  NonHumanCallerDeniedError,
  StepUpAuthorizationInvalidError,
} from "@parmana/shared";

import { isHumanCaller } from "./isHumanCaller.js";
import { isPolicyChangeStepUpAuthorizationShape } from "./isPolicyChangeStepUpAuthorizationShape.js";
import type { PolicyChangeStepUpVerifier } from "./PolicyChangeStepUpVerifier.js";
import type { CallerAuditSink } from "./CallerAuditSink.js";
import { recordCallerAuditEvent } from "./recordCallerAuditEvent.js";

/**
 * Guards shared by the maker checker routes: policy changes
 * (pending-policy-changes.ts) and approver changes
 * (approval-issuers.ts). A step up authorization names one change id
 * and one action; the ids of both kinds of change are random UUIDs, so
 * a signature for one change never matches another.
 */

/**
 * Enforces isHumanCaller.ts on the current request. Returns true when
 * the caller may proceed. On denial, records a signed
 * "caller.non_human_denied" audit event (fail-closed the same way
 * every other caller-layer denial is -- see recordCallerAuditEvent.ts)
 * and throws NonHumanCallerDeniedError, which this file's own
 * ParmanaError catch clause formats -- ParmanaError is not handled by
 * the global errorHandler, unlike RuntimeError subclasses such as
 * AuditUnavailableError. Returns false only when the audit write
 * itself failed and recordCallerAuditEvent has already called next()
 * -- the caller must stop without throwing in that case.
 */
export async function requireHumanCaller(
  req: Request,
  auditSink: CallerAuditSink | undefined,
  next: NextFunction,
): Promise<boolean> {
  if (isHumanCaller(req.callerCredentialHolderType)) {
    return true;
  }

  if (auditSink) {
    const recorded = await recordCallerAuditEvent(
      auditSink,
      {
        type: "caller.non_human_denied",
        occurredAt: new Date().toISOString(),
        route: req.originalUrl,
        ...(req.callerId !== undefined ? { callerId: req.callerId } : {}),
        reason:
          "credential is not provisioned as a verified human (credentialHolderType !== USER)",
        severity: "flagged",
      },
      req,
      next,
    );

    if (!recorded) return false;
  }

  throw new NonHumanCallerDeniedError();
}

/**
 * Enforces PolicyChangeStepUpVerifier on an approve/reject request,
 * on top of (never instead of) requireHumanCaller and maker != checker
 * -- see this file's top-of-file note and
 * PolicyChangeStepUpVerifier's own doc comment. Throws
 * StepUpAuthorizationInvalidError (caught by this file's own
 * ParmanaError catch clause) on a missing, malformed, invalid,
 * expired, replayed, or mismatched envelope; a checker with no
 * stepUpPublicKey provisioned at all fails the same way -- there is no
 * "step-up not required" fallback.
 *
 * Per-check diagnostic detail (which specific check failed: bad
 * signature, expired, replayed nonce, wrong id/action, ...) is logged
 * here, server-side only, and never reaches the HTTP response --
 * StepUpAuthorizationInvalidError's own {error, code} is all the
 * caller ever sees, the same minimal-disclosure shape
 * NonHumanCallerDeniedError and SameActorCannotApproveOwnChangeError
 * already use. This endpoint is reachable by any authenticated human
 * caller other than the proposer, not only the pending change's
 * intended checker -- a granular pass/fail breakdown of somebody
 * else's step-up attempt is reconnaissance value (e.g. "does this
 * caller even have a stepUpPublicKey provisioned") an attacker holding
 * a stolen bearer token but not the matching step-up private key has
 * no legitimate need for. A real checker debugging their own signing
 * tool has that detail available locally, from the tool that produced
 * the envelope, not from this response.
 */
export async function requireStepUpAuthorization(
  req: Request,
  stepUpVerifier: PolicyChangeStepUpVerifier | undefined,
  expected: {
    readonly pendingPolicyChangeId: string;
    readonly action: "approve" | "reject";
  },
): Promise<void> {
  const { stepUpAuthorization } = req.body ?? {};

  /**
   * A `function` declaration, not a `const` arrow -- TypeScript's
   * control-flow narrowing after a never-returning call (e.g.
   * `stepUpVerifier` below) only recognizes hoisted function
   * declarations as provably never reassigned; a const-bound arrow
   * with the identical `never` return type does not narrow.
   */
  function fail(checks: Readonly<Record<string, boolean>>): never {
    console.error({
      event: "step_up_authorization_invalid",
      route: req.originalUrl,
      callerId: req.callerId,
      pendingPolicyChangeId: expected.pendingPolicyChangeId,
      action: expected.action,
      checks,
    });

    throw new StepUpAuthorizationInvalidError(checks);
  }

  if (!isPolicyChangeStepUpAuthorizationShape(stepUpAuthorization)) {
    fail({ present: false });
  }

  if (req.callerStepUpPublicKey === undefined) {
    fail({ checkerHasStepUpKeyProvisioned: false });
  }

  if (stepUpVerifier === undefined) {
    fail({ verifierAvailable: false });
  }

  const publicKey = crypto.createPublicKey(req.callerStepUpPublicKey as string);

  const result = await stepUpVerifier.verify(
    stepUpAuthorization,
    publicKey,
    expected,
  );

  if (!result.valid) {
    fail(result.checks);
  }
}
