import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AuthorityGrant } from "@parmana/shared";
import type { NextFunction, Request, Response } from "express";

/**
 * POST /v1/inbound/decisions (RFC-0025)
 *
 * Issues a signed decision for an inbound refund request from a partner. The partner is the
 * authenticated caller (one caller key per partner, RFC-0025 decision 1). The decision is
 * approved within the partner's limit; above it, it is rejected with reason approval_required.
 * The decision is signed with the signer passed in, and every decision issued is appended to
 * the store, approved or rejected.
 */

/** The authority grant capability for inbound refunds, and the Intent path its limit applies to. */
export const INBOUND_REFUND_CAPABILITY = "inbound:refund";
const AMOUNT_LIMIT_PATH = "parameters.amountInr";
const DECISION_TTL_MS = 10 * 60 * 1000;

export interface InboundDecisionFields {
  readonly decisionId: string;
  readonly outcome: "approved" | "rejected";
  readonly reason?: string;
  readonly partnerId: string;
  readonly paymentId: string;
  readonly limitInr: number;
  readonly expiresAt: string;
  readonly audience: string;
}

export interface InboundDecisionDependencies {
  /** The partner's active grant for inbound refunds, or null. */
  readonly findGrant: (partnerId: string) => Promise<AuthorityGrant | null>;
  /** Signs the canonical bytes of a decision, returning a base64 signature. */
  readonly sign: (canonicalBytes: Buffer) => Promise<string>;
  /** Appends every issued decision. */
  readonly store: {
    append(
      record: InboundDecisionFields & { signature: string },
    ): Promise<void>;
  };
  readonly now?: () => Date;
  readonly audience: string;
}

/** Canonical JSON: keys sorted at the top level, every field except signature. Same as the pilot. */
export function canonicalDecisionBytes(fields: InboundDecisionFields): Buffer {
  const sorted = Object.keys(fields)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = (fields as unknown as Record<string, unknown>)[key];
      return acc;
    }, {});
  return Buffer.from(JSON.stringify(sorted));
}

function isPositiveWholeRupees(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** The grant's refund limit, if the grant is current; otherwise undefined. */
export function grantedLimit(
  grant: AuthorityGrant,
  at: Date,
): number | undefined {
  if (grant.status !== "active") return undefined;
  if (at < grant.validFrom || at > grant.validUntil) return undefined;
  return grant.limits?.[AMOUNT_LIMIT_PATH]?.max;
}

export function createInboundDecisionRouter(
  deps: InboundDecisionDependencies,
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
        const grant = await deps.findGrant(partnerId);
        const issuedAt = now();
        const limitInr = grant ? grantedLimit(grant, issuedAt) : undefined;
        if (limitInr === undefined) {
          res.status(403).json({ error: "no_active_grant" });
          return;
        }

        const body = req.body as {
          paymentId?: unknown;
          amountInr?: unknown;
          audience?: unknown;
        };
        if (typeof body.paymentId !== "string" || body.paymentId === "") {
          res.status(400).json({ error: "paymentId is required" });
          return;
        }
        if (!isPositiveWholeRupees(body.amountInr)) {
          res.status(400).json({
            error: "amountInr must be a whole number of rupees, at least 1",
          });
          return;
        }
        if (body.audience !== deps.audience) {
          res.status(400).json({ error: "audience does not match" });
          return;
        }

        const approved = body.amountInr <= limitInr;
        const fields: InboundDecisionFields = {
          decisionId: `dec-${randomUUID()}`,
          outcome: approved ? "approved" : "rejected",
          ...(approved ? {} : { reason: "approval_required" }),
          partnerId,
          paymentId: body.paymentId,
          limitInr,
          expiresAt: new Date(
            issuedAt.getTime() + DECISION_TTL_MS,
          ).toISOString(),
          audience: deps.audience,
        };
        const signature = await deps.sign(canonicalDecisionBytes(fields));
        await deps.store.append({ ...fields, signature });

        res.status(201).json({ ...fields, signature });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
