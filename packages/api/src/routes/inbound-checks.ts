import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { DecisionRequest } from "@parmana/runtime";
import {
  BusinessTransactionStatus,
  type AuthorityGrant,
  type PolicyReference,
} from "@parmana/shared";
import type { NextFunction, Request, Response } from "express";

/**
 * POST /v1/inbound/checks (RFC-0024, option A)
 *
 * A business system asks Parmana to check an inbound request from a partner's agent before it acts.
 * The partner is the authenticated caller. The request names a capability (namespace:verb), an
 * optional target, optional parameters, and optional declared signals.
 *
 * A decision is approved only when both hold:
 *   1. The partner holds a current grant for the capability, and every limit on the grant holds for
 *      the value at its path in the request. A grant with no limits does not limit the request.
 *   2. The policy bound to the capability approves the request. The policy is run by the runtime's
 *      decide step, with the same verification and binding checks as /execute, and without executing
 *      anything.
 *
 * The decision is signed and stored, approved or rejected, with the policy name and version that
 * decided it. A capability with no bound policy is refused, so nothing is approved on grant limits alone.
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
  readonly policyName?: string;
  readonly policyVersion?: string;
  readonly expiresAt: string;
  readonly audience: string;
}

/** The policy bound to a capability, or why none can decide it. */
export type InboundPolicyLookup =
  | { readonly kind: "in-effect"; readonly policy: PolicyReference }
  | { readonly kind: "unavailable"; readonly reason: string };

export interface InboundCheckDependencies {
  /** The partner's grant for a capability, or null. */
  readonly findGrant: (
    callerId: string,
    capability: string,
  ) => Promise<AuthorityGrant | null>;
  /** The policy bound to a capability, or undefined when the capability has no binding. */
  readonly policyInEffect: (
    capability: string,
  ) => Promise<InboundPolicyLookup | undefined>;
  /** Decides a request without executing it, through the runtime's decide step. */
  readonly decide: (
    request: DecisionRequest,
  ) => Promise<{ readonly approved: boolean; readonly reason?: string }>;
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
          signals?: unknown;
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
        if (
          body.signals !== undefined &&
          (body.signals === null || typeof body.signals !== "object")
        ) {
          res.status(400).json({ error: "signals must be an object" });
          return;
        }

        // Grant limits. Fail closed: a limit with no maximum cannot be checked.
        const limits: Array<[string, number]> = [];
        for (const [path, limit] of Object.entries(grant.limits ?? {})) {
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

        // The policy bound to the capability. No binding means nothing can approve the request.
        const lookup = await deps.policyInEffect(capability);
        if (lookup === undefined) {
          res.status(403).json({ error: "no_policy_bound" });
          return;
        }
        if (lookup.kind !== "in-effect") {
          res.status(403).json({
            error: "policy_unavailable",
            reason: lookup.reason,
          });
          return;
        }

        // The policy decides. Nothing is executed: the runtime's decide step only decides.
        const checkId = `chk-${randomUUID()}`;
        const decision = await deps.decide({
          businessTransactionId: checkId,
          metadata: {
            businessTransactionId: checkId,
            submittedBy: partnerId,
            submittedAt: issuedAt,
          },
          // A check issues no authorization; decide() never reads one.
          intent: {
            intentId: `${checkId}-intent`,
            authorizationId: "",
            action: capability,
            target: typeof body.target === "string" ? body.target : "",
            parameters: (body.parameters ?? {}) as Record<string, unknown>,
            createdAt: issuedAt,
          },
          policy: lookup.policy,
          signals: (body.signals ?? {}) as Record<string, unknown>,
          status: BusinessTransactionStatus.RECEIVED,
          createdAt: issuedAt,
        });

        const approved = !exceeded && decision.approved;
        const reason = exceeded
          ? "approval_required"
          : approved
            ? undefined
            : (decision.reason ?? "policy_rejected");

        const fields: InboundCheckFields = {
          decisionId: checkId,
          outcome: approved ? "approved" : "rejected",
          ...(reason !== undefined ? { reason } : {}),
          partnerId,
          capability,
          ...(typeof body.target === "string" ? { target: body.target } : {}),
          ...(amount !== undefined ? { amount } : {}),
          policyName: lookup.policy.name,
          policyVersion: lookup.policy.version,
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
