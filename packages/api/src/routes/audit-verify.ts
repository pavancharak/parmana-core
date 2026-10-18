import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { AuditEventCrypto } from "@parmana/crypto";
import type { Signature } from "@parmana/shared";

/**
 * Minimal structural check, mirroring refusal-verify.ts's
 * isPlausibleRefusalRecord -- this codebase does not use a runtime
 * schema validation library anywhere else.
 */
function isPlausibleAuditEvent(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const event = value as Record<string, unknown>;

  return (
    typeof event.type === "string" &&
    typeof event.occurredAt === "string" &&
    typeof event.route === "string"
  );
}

function isPlausibleSignature(value: unknown): value is Signature {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const signature = value as Partial<Signature>;

  return (
    typeof signature.algorithm === "string" &&
    typeof signature.keyId === "string" &&
    typeof signature.value === "string"
  );
}

/**
 * POST /audit/verify
 *
 * Verifies a signed caller-authentication audit event's signature
 * (audit-sink signing milestone, following RFC-0021's POST
 * /refusal/verify exactly). Deliberately mounted before this app's
 * caller-auth middleware (see app.ts) -- no caller authentication or
 * API key is required, by design: this is the capability that makes a
 * stored `caller_audit_events` row independently third-party
 * verifiable. Takes the event and its stored signature directly, not
 * a lookup by id -- no database access, nothing but the artifact and
 * Parmana's public key.
 *
 * AuditEventCrypto.verify() operates on canonical bytes and a
 * signature alone, never on the event's own `type`.
 */
export function createAuditVerifyRouter(): Router {
  const router = Router();
  const crypto = new AuditEventCrypto();

  router.post(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const body = req.body ?? {};
        const { event, signature } = body;

        if (!isPlausibleAuditEvent(event) || !isPlausibleSignature(signature)) {
          res.status(400).json({
            error:
              "Request body must be { event, signature } " +
              "(event: type, occurredAt, route; signature: " +
              "algorithm, keyId, value required).",
          });
          return;
        }

        const valid = await crypto.verify(event, signature);

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
