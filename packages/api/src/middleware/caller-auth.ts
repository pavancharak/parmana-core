import type { NextFunction, Request, Response } from "express";

import type { AuthorityType } from "@parmana/shared";

import type { CallerAuthenticator } from "../auth/CallerAuthenticator.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";
import { recordCallerAuditEvent } from "../auth/recordCallerAuditEvent.js";

/* eslint-disable @typescript-eslint/no-namespace */

/**
 * Minimal local type augmentation, matching the pattern
 * used by @parmana/envelope-verifier's express.ts.
 */
declare global {
  namespace Express {
    interface Request {
      callerId?: string;
      callerAllowedPrincipalIds?: readonly string[];
      callerAllowedCapabilities?: readonly string[];
      callerAllowedTenantIds?: readonly string[];
      callerCredentialHolderType?: AuthorityType;
      callerStepUpPublicKey?: string;
    }
  }
}

/* eslint-enable @typescript-eslint/no-namespace */

const BEARER_PREFIX = "Bearer ";

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header || !header.startsWith(BEARER_PREFIX)) return undefined;

  const token = header.slice(BEARER_PREFIX.length).trim();

  return token.length > 0 ? token : undefined;
}

/**
 * Express middleware factory for caller authentication.
 *
 * This is the ONLY layer that decides whether an HTTP
 * request is even entertained. It runs before a Business
 * Transaction is constructed and is entirely independent
 * of policy evaluation (SignedExecutionAuthorization) and
 * gateway attestation, which run later and answer different
 * questions. A rejected caller never reaches either of those
 * layers; a well-authenticated caller submitting a
 * policy-rejected transaction is still rejected by policy,
 * this middleware cannot substitute for it.
 */
export function createCallerAuthMiddleware(
  authenticator: CallerAuthenticator,
  auditSink: CallerAuditSink,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const credential = extractBearerToken(req.headers.authorization);
    const identity = authenticator.authenticate(credential);

    if (!identity) {
      const recorded = await recordCallerAuditEvent(
        auditSink,
        {
          type: "caller.rejected",
          occurredAt: new Date().toISOString(),
          route: req.originalUrl,
          reason: credential ? "invalid credential" : "missing credential",
        },
        req,
        next,
      );

      if (!recorded) return;

      res.setHeader("WWW-Authenticate", 'Bearer realm="Parmana"');

      res.status(401).json({
        error: "authentication required",
      });

      return;
    }

    req.callerId = identity.callerId;

    if (identity.allowedPrincipalIds !== undefined) {
      req.callerAllowedPrincipalIds = identity.allowedPrincipalIds;
    }

    if (identity.allowedCapabilities !== undefined) {
      req.callerAllowedCapabilities = identity.allowedCapabilities;
    }

    if (identity.allowedTenantIds !== undefined) {
      req.callerAllowedTenantIds = identity.allowedTenantIds;
    }

    if (identity.credentialHolderType !== undefined) {
      req.callerCredentialHolderType = identity.credentialHolderType;
    }

    if (identity.stepUpPublicKey !== undefined) {
      req.callerStepUpPublicKey = identity.stepUpPublicKey;
    }

    const recorded = await recordCallerAuditEvent(
      auditSink,
      {
        type: "caller.authenticated",
        occurredAt: new Date().toISOString(),
        route: req.originalUrl,
        callerId: identity.callerId,
      },
      req,
      next,
    );

    if (!recorded) return;

    next();
  };
}
