import type { KeyObject } from "node:crypto";

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { ApprovalArtifactSigner } from "@parmana/crypto";

/**
 * The only capability the sandbox's demo approver signs for (ADR-0014).
 * Its action acts on nothing.
 */
export const SANDBOX_CAPABILITY = "sandbox:receipt";

/**
 * How long a demo approval is valid.
 */
export const SANDBOX_APPROVAL_TTL_SECONDS = 300;

const MAX_RESOURCE_ID_LENGTH = 200;

/**
 * The sandbox's demo approver: a key trusted only in the sandbox's own
 * database, added there through an approver change like any other.
 */
export interface SandboxApprover {
  readonly approverId: string;
  readonly keyId: string;
  readonly privateKey: KeyObject;
}

/**
 * POST /sandbox/approvals (ADR-0014): the sandbox's demo approver signs
 * an approval on request, because a visitor in a browser has no
 * approver key of their own. Mounted only when PARMANA_SANDBOX=true.
 *
 * This is the one place an approval is signed on the server. Everywhere
 * else a person signs on their own machine. It is safe only because the
 * sandbox shares nothing with production: its own database, its own
 * signing keys, its own approver, and no built in connector (startup
 * refuses sandbox mode when one is configured). The approval is checked
 * by POST /execute exactly as a real one: trusted issuer, signature,
 * capability, resource, expiry, and its nonce is consumed on use.
 */
export function createSandboxApprovalsRouter(approver: SandboxApprover) {
  const router = Router();
  const signer = new ApprovalArtifactSigner();

  router.post(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { capability, resourceId } = (req.body ?? {}) as {
          capability?: unknown;
          resourceId?: unknown;
        };

        if (capability !== SANDBOX_CAPABILITY) {
          res.status(400).json({
            error: `The sandbox approver signs only for capability "${SANDBOX_CAPABILITY}".`,
            code: "INVALID_SANDBOX_APPROVAL_REQUEST",
          });
          return;
        }

        if (
          typeof resourceId !== "string" ||
          resourceId.trim() === "" ||
          resourceId.length > MAX_RESOURCE_ID_LENGTH
        ) {
          res.status(400).json({
            error: `resourceId is required: the request's target, at most ${MAX_RESOURCE_ID_LENGTH} characters.`,
            code: "INVALID_SANDBOX_APPROVAL_REQUEST",
          });
          return;
        }

        const approval = await signer.sign(
          {
            approverId: approver.approverId,
            keyId: approver.keyId,
            capability,
            resourceId,
            scope: { field: "resourceId", comparator: "eq", value: resourceId },
            ttlSeconds: SANDBOX_APPROVAL_TTL_SECONDS,
          },
          approver.privateKey,
        );

        res.status(201).json(approval);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
