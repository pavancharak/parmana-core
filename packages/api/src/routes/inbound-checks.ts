import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { AuthorityGrant } from "@parmana/shared";
import type { NextFunction, Request, Response } from "express";

/**
 * POST /v1/inbound/checks (RFC-0024, option A)
 *
 * A business system asks Parmana to check an inbound request from a partner's agent before it
 * acts. The partner is the authenticated caller. The request names a capability (namespace:verb),
 * an optional target, and optional parameters. The partner must hold a current grant for that
 * capability. Every limit on the grant is checked against the value at its path in the request.
 * If any value exceeds its limit, the decision is rejected with reason approval_required. A grant
 * with no limits approves any request for its capability.
 *
 * The decision is signed and stored, approved or rejected, so it can be verified offline.
 */

const CAPABILITY_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
const CHECK_TTL_MS = 10 * 60 * 1000;

export interface InboundCheckFields {
  readonly decisionId: string;
  readonly outcome: "approved" | "rejected";
  readonly reason?: string;
  readonly partnerId: string;
  readonly capability: string;
  readonly target?: string;
  readonly amount?: number;
  readonly expiresAt: string;
  readonly audience: string;
}

export interface InboundCheckDependencies {
  /** The partner's grant for a capability, or null. */
  readonly findGrant: (
    callerId: string,
    capability: string,
  ) => Promise<AuthorityGrant | null>;
  /** Signs the canonical bytes of a decision, returning a base64 signature. */
  readonly sign: (canonicalBytes: Buffer) => Promise<string>;
  /** Appends every issued decision. */
  readonly store: {
    append(record: InboundCheckFields & { signature: string }): Promise<void>;
  };
  readonly now?: () => Date;
  readonly audience: string;
}

/** Canonical JSON: keys sorted at the top level, every field except signature. */
export function canonicalCheckBytes(fields: InboundCheckFields): Buffer {
  const sorted = Object.keys(fields)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = (fields as unknown as Record<string, unknown>)[key];
      return acc;
    }, {});
  return Buffer.from(JSON.stringify(sorted));
}

/** The value at a dotted path (for example "parameters.amountInr") in the request, or undefined. */
export function valueAtPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node === null || typeof node !== "object") return undefined;
    return (node as Record<string, unknown>)[key];
  }, root);
}

/** A grant is current when it is active and the time is within its validity window. */
export function isCurrentGrant(grant: AuthorityGrant, at: Date): boolean {
  return (
    grant.status === "active" && at >= grant.validFrom && at <= grant.validUntil
  );
}

export function createInboundCheckRouter(
  deps: InboundCheckDependencies,
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

        const body = req.body as {
          capability?: unknown;
          target?: unknown;
          parameters?: unknown;
          audience?: unknown;
        };
        if (
          typeof body.capability !== "string" ||
          !CAPABILITY_PATTERN.test(body.capability)
        ) {
          res.status(400).json({
            error: "capability must be namespace:verb, lower case",
          });
          return;
        }
        const capability = body.capability;

        const issuedAt = now();
        const grant = await deps.findGrant(partnerId, capability);
        if (!grant || !isCurrentGrant(grant, issuedAt)) {
          res.status(403).json({ error: "no_active_grant" });
          return;
        }

        if (body.audience !== deps.audience) {
          res.status(400).json({ error: "audience does not match" });
          return;
        }
        if (body.target !== undefined && typeof body.target !== "string") {
          res.status(400).json({ error: "target must be a string" });
          return;
        }
        if (
          body.parameters !== undefined &&
          (body.parameters === null || typeof body.parameters !== "object")
        ) {
          res.status(400).json({ error: "parameters must be an object" });
          return;
        }

        const limits: Array<[string, number]> = [];
        for (const [path, limit] of Object.entries(grant.limits ?? {})) {
          // Fail closed: a limit with no maximum cannot be checked, so nothing is approved.
          if (typeof limit.max !== "number") {
            res.status(403).json({ error: "grant_limit_incomplete" });
            return;
          }
          limits.push([path, limit.max]);
        }

        const root = { target: body.target, parameters: body.parameters };
        let exceeded = false;
        let amount: number | undefined;
        for (const [path, max] of limits) {
          const value = valueAtPath(root, path);
          if (typeof value !== "number" || !Number.isFinite(value)) {
            res.status(400).json({ error: `${path} must be a number` });
            return;
          }
          if (amount === undefined) amount = value;
          if (value > max) exceeded = true;
        }

        const fields: InboundCheckFields = {
          decisionId: `chk-${randomUUID()}`,
          outcome: exceeded ? "rejected" : "approved",
          ...(exceeded ? { reason: "approval_required" } : {}),
          partnerId,
          capability,
          ...(typeof body.target === "string" ? { target: body.target } : {}),
          ...(amount !== undefined ? { amount } : {}),
          expiresAt: new Date(issuedAt.getTime() + CHECK_TTL_MS).toISOString(),
          audience: deps.audience,
        };
        const signature = await deps.sign(canonicalCheckBytes(fields));
        await deps.store.append({ ...fields, signature });

        res.status(201).json({ ...fields, signature });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
