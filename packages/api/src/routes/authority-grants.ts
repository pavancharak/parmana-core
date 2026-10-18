import crypto from "node:crypto";

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import {
  AuthorityGrantChangeNotFoundError,
  ConflictError,
  ParmanaError,
  PendingPolicyChangeStatus,
  SameActorCannotApproveOwnChangeError,
  type AuthorityGrantChange,
  type AuthorityGrantLimit,
  type AuthorityGrantRepository,
} from "@parmana/shared";

import {
  requireHumanCaller,
  requireStepUpAuthorization,
} from "../auth/governanceGuards.js";
import type { PolicyChangeStepUpVerifier } from "../auth/PolicyChangeStepUpVerifier.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";
import { authorityGrantRepository } from "../repositories.js";

/**
 * Per-agent authority grants (RFC-0023 phase 3): maker checker for
 * "caller X may have requests for capability Y decided, within these
 * limits, until this time".
 *
 * The same rules as an external connector or business signal source
 * change: human callers only, maker is not checker, step up on approve
 * and reject, and only an approved change touches authority_grants.
 * Neither the proposer nor the approver may be the caller the grant is
 * for, so no one grants authority to themselves.
 */

const CAPABILITY_PATTERN =
  "^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*:[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$";
const CAPABILITY = new RegExp(CAPABILITY_PATTERN);
const MAX_CAPABILITY_LENGTH = 128;
const CALLER_ID = /^\S{1,256}$/;
const LIMIT_PATH = /^(?:target|parameters\.[A-Za-z_][A-Za-z0-9_]{0,63})$/;
const MAX_LIMITS = 32;
const MAX_ONE_OF = 64;
const MAX_ONE_OF_STRING = 256;
const MAX_REASON_LENGTH = 2000;
/** The longest a grant may last: a year and a day. */
const MAX_GRANT_MS = 366 * 24 * 60 * 60 * 1000;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isValidStatus(value: unknown): value is PendingPolicyChangeStatus {
  return (
    typeof value === "string" &&
    Object.values(PendingPolicyChangeStatus).includes(
      value as PendingPolicyChangeStatus,
    )
  );
}

class InvalidGrantError extends ParmanaError {
  constructor(message: string) {
    super("INVALID_AUTHORITY_GRANT", message, 400);
  }
}

class SelfGrantError extends ParmanaError {
  constructor(callerId: string) {
    super(
      "AUTHORITY_SELF_GRANT_DENIED",
      `'${callerId}' may not propose, approve or reject authority for itself.`,
      403,
    );
  }
}

function parseDate(value: unknown, field: string): Date {
  const date = typeof value === "string" ? new Date(value) : undefined;

  if (date === undefined || Number.isNaN(date.getTime())) {
    throw new InvalidGrantError(`${field} must be an ISO 8601 date and time.`);
  }

  return date;
}

function parseLimit(path: string, value: unknown): AuthorityGrantLimit {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidGrantError(
      `limits['${path}'] must be an object with min, max or oneOf.`,
    );
  }

  const { min, max, oneOf, ...rest } = value as Record<string, unknown>;

  if (Object.keys(rest).length > 0) {
    throw new InvalidGrantError(
      `limits['${path}'] takes only min, max and oneOf.`,
    );
  }

  if (min === undefined && max === undefined && oneOf === undefined) {
    throw new InvalidGrantError(
      `limits['${path}'] must set min, max or oneOf.`,
    );
  }

  for (const [name, bound] of [
    ["min", min],
    ["max", max],
  ] as const) {
    if (
      bound !== undefined &&
      (typeof bound !== "number" || !Number.isFinite(bound))
    ) {
      throw new InvalidGrantError(
        `limits['${path}'].${name} must be a number.`,
      );
    }
  }

  if (typeof min === "number" && typeof max === "number" && min > max) {
    throw new InvalidGrantError(
      `limits['${path}'].min must not be above its max.`,
    );
  }

  if (oneOf !== undefined) {
    if (
      !Array.isArray(oneOf) ||
      oneOf.length === 0 ||
      oneOf.length > MAX_ONE_OF ||
      !oneOf.every(
        (item) =>
          (typeof item === "string" && item.length <= MAX_ONE_OF_STRING) ||
          (typeof item === "number" && Number.isFinite(item)),
      )
    ) {
      throw new InvalidGrantError(
        `limits['${path}'].oneOf must list 1 to ${MAX_ONE_OF} strings or numbers.`,
      );
    }
  }

  return {
    ...(min !== undefined && { min: min as number }),
    ...(max !== undefined && { max: max as number }),
    ...(oneOf !== undefined && { oneOf: oneOf as (string | number)[] }),
  };
}

function parseLimits(
  value: unknown,
): Readonly<Record<string, AuthorityGrantLimit>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidGrantError(
      "limits must be an object, by Intent path (target or parameters.<name>).",
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);

  if (entries.length === 0 || entries.length > MAX_LIMITS) {
    throw new InvalidGrantError(
      `limits must name 1 to ${MAX_LIMITS} Intent paths, or be left out.`,
    );
  }

  return Object.fromEntries(
    entries.map(([path, limit]) => {
      if (!LIMIT_PATH.test(path)) {
        throw new InvalidGrantError(
          `limits key '${path}' must be target or parameters.<name>.`,
        );
      }

      return [path, parseLimit(path, limit)];
    }),
  );
}

function sendError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ParmanaError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  next(error);
}

export function createAuthorityGrantsRouter(
  auditSink?: CallerAuditSink,
  stepUpVerifier?: PolicyChangeStepUpVerifier,
  repository: AuthorityGrantRepository = authorityGrantRepository,
  now: () => Date = () => new Date(),
): Router {
  const router = Router();

  function requireCaller(req: Request, res: Response, doing: string): boolean {
    if (req.callerId === undefined) {
      res.status(401).json({
        error: `Caller authentication is required to ${doing}.`,
      });
      return false;
    }
    return true;
  }

  /**
   * GET /authority-grants
   *
   * Every grant, active and revoked.
   */
  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!requireCaller(req, res, "list authority grants")) return;
        if (!(await requireHumanCaller(req, auditSink, next))) return;

        res.status(200).json({ grants: await repository.listGrants() });
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  /**
   * POST /authority-grants/changes
   *
   * Propose a grant ({ action: "grant", callerId, capability, limits?,
   * validFrom?, validUntil, reason }) or revoking the active one
   * ({ action: "revoke", callerId, capability, reason }).
   */
  router.post(
    "/changes",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!requireCaller(req, res, "propose an authority grant change"))
          return;
        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const {
          action,
          callerId,
          capability,
          limits,
          validFrom,
          validUntil,
          reason,
        } = req.body ?? {};

        if (action !== "grant" && action !== "revoke") {
          throw new InvalidGrantError('action must be "grant" or "revoke".');
        }

        if (typeof callerId !== "string" || !CALLER_ID.test(callerId)) {
          throw new InvalidGrantError(
            "callerId must be the callerId of the API key the grant is for, 1 to 256 characters, no spaces.",
          );
        }

        if (
          typeof capability !== "string" ||
          capability.length > MAX_CAPABILITY_LENGTH ||
          !CAPABILITY.test(capability)
        ) {
          throw new InvalidGrantError(
            `capability must be namespace:verb, at most ${MAX_CAPABILITY_LENGTH} characters, matching ${CAPABILITY_PATTERN}.`,
          );
        }

        if (
          typeof reason !== "string" ||
          reason.trim().length === 0 ||
          reason.length > MAX_REASON_LENGTH
        ) {
          throw new InvalidGrantError(
            `reason is required, at most ${MAX_REASON_LENGTH} characters.`,
          );
        }

        if (callerId === req.callerId) {
          throw new SelfGrantError(callerId);
        }

        const active = await repository.findActive(callerId, capability);
        let grant: Pick<
          AuthorityGrantChange,
          "limits" | "validFrom" | "validUntil"
        > = {};

        if (action === "grant") {
          const parsedLimits = parseLimits(limits);
          const from =
            validFrom === undefined
              ? undefined
              : parseDate(validFrom, "validFrom");
          const until = parseDate(validUntil, "validUntil");
          const start = from ?? now();

          if (until.getTime() <= Math.max(start.getTime(), now().getTime())) {
            throw new InvalidGrantError(
              "validUntil must be in the future and after validFrom.",
            );
          }

          if (until.getTime() - start.getTime() > MAX_GRANT_MS) {
            throw new InvalidGrantError(
              "A grant may last at most 366 days. Grant again when it ends.",
            );
          }

          if (active !== null) {
            throw new ConflictError(
              `'${callerId}' already holds a grant for '${capability}'. Revoke it first.`,
            );
          }

          grant = {
            ...(parsedLimits !== undefined && { limits: parsedLimits }),
            ...(from !== undefined && { validFrom: from }),
            validUntil: until,
          };
        } else {
          if (
            limits !== undefined ||
            validFrom !== undefined ||
            validUntil !== undefined
          ) {
            throw new InvalidGrantError(
              "A revoke takes only action, callerId, capability and reason.",
            );
          }

          if (active === null) {
            throw new ConflictError(
              `'${callerId}' holds no grant for '${capability}'.`,
            );
          }
        }

        const change: AuthorityGrantChange = {
          changeId: crypto.randomUUID(),
          action,
          callerId,
          capability,
          ...grant,
          reason,
          proposedBy: req.callerId as string,
          proposedAt: now(),
          status: PendingPolicyChangeStatus.PENDING_APPROVAL,
        };

        res.status(201).json(await repository.createChange(change));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  /**
   * GET /authority-grants/changes?status=...
   */
  router.get(
    "/changes",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!requireCaller(req, res, "list authority grant changes")) return;
        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const status = req.query.status;

        if (status !== undefined && !isValidStatus(status)) {
          res.status(400).json({
            error:
              "status must be one of PENDING_APPROVAL, APPROVED, REJECTED.",
          });
          return;
        }

        res.status(200).json({ changes: await repository.listChanges(status) });
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  async function loadForResolution(
    req: Request,
    action: "approve" | "reject",
  ): Promise<AuthorityGrantChange> {
    const id = asString(req.params.id) ?? "";
    const existing = await repository.findChange(id);

    if (existing === null) {
      throw new AuthorityGrantChangeNotFoundError(id);
    }

    if (existing.proposedBy === req.callerId) {
      throw new SameActorCannotApproveOwnChangeError(
        id,
        "Authority grant change",
      );
    }

    if (existing.callerId === req.callerId) {
      throw new SelfGrantError(existing.callerId);
    }

    await requireStepUpAuthorization(req, stepUpVerifier, {
      pendingPolicyChangeId: id,
      action,
    });

    return existing;
  }

  /**
   * POST /authority-grants/changes/:id/approve
   *
   * Human caller, neither the proposer nor the grantee, with a step up
   * authorization for this change id and action "approve". A grant whose
   * validUntil has passed by now is refused; then the change is applied
   * and resolved in one step.
   */
  router.post(
    "/changes/:id/approve",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!requireCaller(req, res, "approve an authority grant change"))
          return;
        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const change = await loadForResolution(req, "approve");
        const at = now();

        if (
          change.action === "grant" &&
          change.validUntil !== undefined &&
          change.validUntil.getTime() <= at.getTime()
        ) {
          throw new InvalidGrantError(
            "This grant's validUntil has passed. Reject it and propose a new one.",
          );
        }

        const resolved = await repository.approveChange(
          change.changeId,
          req.callerId as string,
          at,
        );

        console.info({
          event: "authority_grant_change_approved",
          changeId: resolved.changeId,
          action: resolved.action,
          callerId: resolved.callerId,
          capability: resolved.capability,
          validUntil: resolved.validUntil,
          proposedBy: resolved.proposedBy,
          approvedBy: resolved.resolvedBy,
        });

        res.status(200).json(resolved);
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  /**
   * POST /authority-grants/changes/:id/reject
   *
   * Requires rejectionReason, and the same checks as approve.
   */
  router.post(
    "/changes/:id/reject",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!requireCaller(req, res, "reject an authority grant change"))
          return;
        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const { rejectionReason } = req.body ?? {};

        if (
          typeof rejectionReason !== "string" ||
          rejectionReason.trim().length === 0 ||
          rejectionReason.length > MAX_REASON_LENGTH
        ) {
          res.status(400).json({
            error: `rejectionReason is required, at most ${MAX_REASON_LENGTH} characters.`,
          });
          return;
        }

        const change = await loadForResolution(req, "reject");

        res
          .status(200)
          .json(
            await repository.rejectChange(
              change.changeId,
              req.callerId as string,
              rejectionReason,
              now(),
            ),
          );
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  return router;
}
