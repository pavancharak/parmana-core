import crypto from "node:crypto";

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import {
  BusinessSignalSourceChangeNotFoundError,
  ConflictError,
  ParmanaError,
  PendingPolicyChangeStatus,
  SameActorCannotApproveOwnChangeError,
  ExternalEndpointAddressError,
  checkEndpointUrl,
  resolvePublicEndpointAddresses,
  systemEndpointAddressLookup,
  type BusinessSignalSourceChange,
  type BusinessSignalSourceRepository,
  type EndpointAddressLookup,
} from "@parmana/shared";

import {
  requireHumanCaller,
  requireStepUpAuthorization,
} from "../auth/governanceGuards.js";
import type { PolicyChangeStepUpVerifier } from "../auth/PolicyChangeStepUpVerifier.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";
import { businessSignalSourceRepository } from "../repositories.js";

/**
 * Business signal sources registered without a deploy (RFC-0023 phase
 * 2): maker checker for naming a business system, the HTTPS endpoint
 * Parmana asks, and optionally the key its answers are signed with.
 *
 * The same rules as an external connector change
 * (external-connectors.ts): human callers only, maker is not checker,
 * step up on approve and reject, and only an approved change touches
 * business_signal_sources. The endpoint's address is checked when the
 * change is proposed and again when it is approved.
 */

/** The name a policy's signalSources uses (PolicyValidator SOURCE_NAME). */
const NAME_PATTERN = "^[a-z0-9][a-z0-9-]{0,62}$";
const NAME = new RegExp(NAME_PATTERN);
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_PUBLIC_KEY_LENGTH = 1000;
const MAX_REASON_LENGTH = 2000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;

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

class InvalidSourceError extends ParmanaError {
  constructor(message: string) {
    super("INVALID_BUSINESS_SIGNAL_SOURCE", message, 400);
  }
}

class EndpointAddressRefusedError extends ParmanaError {
  constructor(message: string) {
    super("EXTERNAL_ENDPOINT_ADDRESS_REFUSED", message, 400);
  }
}

function parseTimeoutMs(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_TIMEOUT_MS ||
    value > MAX_TIMEOUT_MS
  ) {
    throw new InvalidSourceError(
      `timeoutMs must be an integer from ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS}; it defaults to ${DEFAULT_TIMEOUT_MS}.`,
    );
  }

  return value;
}

/**
 * An Ed25519 public key in PEM, returned in the canonical SPKI PEM form
 * so the stored key is exactly what the verifier will load.
 */
function parsePublicKey(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_PUBLIC_KEY_LENGTH) {
    throw new InvalidSourceError(
      `publicKeyPem must be an Ed25519 public key in PEM, at most ${MAX_PUBLIC_KEY_LENGTH} characters.`,
    );
  }

  let key: crypto.KeyObject;

  try {
    key = crypto.createPublicKey(value);
  } catch {
    throw new InvalidSourceError(
      "publicKeyPem is not a readable public key in PEM.",
    );
  }

  if (key.asymmetricKeyType !== "ed25519") {
    throw new InvalidSourceError("publicKeyPem must be an Ed25519 key.");
  }

  return key.export({ format: "pem", type: "spki" }).toString();
}

function sendError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ParmanaError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  next(error);
}

export function createBusinessSignalSourcesRouter(
  auditSink?: CallerAuditSink,
  stepUpVerifier?: PolicyChangeStepUpVerifier,
  repository: BusinessSignalSourceRepository = businessSignalSourceRepository,
  lookup: EndpointAddressLookup = systemEndpointAddressLookup,
): Router {
  const router = Router();

  async function checkEndpoint(value: unknown): Promise<string> {
    const checked = checkEndpointUrl(value);

    if (!checked.ok) {
      throw new EndpointAddressRefusedError(checked.reason);
    }

    await assertPublic(checked.url);

    return checked.url.href;
  }

  async function assertPublic(url: URL): Promise<void> {
    try {
      await resolvePublicEndpointAddresses(url, lookup);
    } catch (error) {
      if (error instanceof ExternalEndpointAddressError) {
        throw new EndpointAddressRefusedError(error.message);
      }

      throw error;
    }
  }

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
   * GET /business-signal-sources
   *
   * Every registration, active and revoked.
   */
  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!requireCaller(req, res, "list business signal sources")) return;
        if (!(await requireHumanCaller(req, auditSink, next))) return;

        res.status(200).json({ sources: await repository.listRegistrations() });
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  /**
   * POST /business-signal-sources/changes
   *
   * Propose registering a source ({ action: "register", name,
   * endpointUrl, timeoutMs?, publicKeyPem?, keyId?, reason }) or revoking
   * the active one ({ action: "revoke", name, reason }).
   */
  router.post(
    "/changes",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!requireCaller(req, res, "propose a business signal source change"))
          return;
        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const {
          action,
          name,
          endpointUrl,
          timeoutMs,
          publicKeyPem,
          keyId,
          reason,
        } = req.body ?? {};

        if (action !== "register" && action !== "revoke") {
          throw new InvalidSourceError(
            'action must be "register" or "revoke".',
          );
        }

        if (typeof name !== "string" || !NAME.test(name)) {
          throw new InvalidSourceError(
            `name must match ${NAME_PATTERN}, the form a policy's signalSources uses.`,
          );
        }

        if (
          typeof reason !== "string" ||
          reason.trim().length === 0 ||
          reason.length > MAX_REASON_LENGTH
        ) {
          throw new InvalidSourceError(
            `reason is required, at most ${MAX_REASON_LENGTH} characters.`,
          );
        }

        const active = await repository.findActive(name);
        let registration: Pick<
          BusinessSignalSourceChange,
          "endpointUrl" | "timeoutMs" | "publicKeyPem" | "keyId"
        > = {};

        if (action === "register") {
          const timeout = parseTimeoutMs(timeoutMs);
          const key =
            publicKeyPem === undefined
              ? undefined
              : parsePublicKey(publicKeyPem);

          if (keyId !== undefined) {
            if (key === undefined) {
              throw new InvalidSourceError(
                "keyId labels a publicKeyPem; give the key too, or leave keyId out.",
              );
            }
            if (typeof keyId !== "string" || !KEY_ID.test(keyId)) {
              throw new InvalidSourceError(
                "keyId must be 1 to 128 letters, digits, dots, hyphens or underscores.",
              );
            }
          }

          if (active !== null) {
            throw new ConflictError(
              `Business signal source '${name}' is already registered. Revoke it first.`,
            );
          }

          registration = {
            endpointUrl: await checkEndpoint(endpointUrl),
            timeoutMs: timeout,
            ...(key !== undefined && { publicKeyPem: key }),
            ...(keyId !== undefined && { keyId: keyId as string }),
          };
        } else {
          if (
            endpointUrl !== undefined ||
            timeoutMs !== undefined ||
            publicKeyPem !== undefined ||
            keyId !== undefined
          ) {
            throw new InvalidSourceError(
              "A revoke takes only action, name and reason.",
            );
          }

          if (active === null) {
            throw new ConflictError(
              `Business signal source '${name}' is not registered.`,
            );
          }
        }

        const change: BusinessSignalSourceChange = {
          changeId: crypto.randomUUID(),
          action,
          name,
          ...registration,
          reason,
          proposedBy: req.callerId as string,
          proposedAt: new Date(),
          status: PendingPolicyChangeStatus.PENDING_APPROVAL,
        };

        res.status(201).json(await repository.createChange(change));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  /**
   * GET /business-signal-sources/changes?status=...
   */
  router.get(
    "/changes",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!requireCaller(req, res, "list business signal source changes"))
          return;
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
  ): Promise<BusinessSignalSourceChange> {
    const id = asString(req.params.id) ?? "";
    const existing = await repository.findChange(id);

    if (existing === null) {
      throw new BusinessSignalSourceChangeNotFoundError(id);
    }

    if (existing.proposedBy === req.callerId) {
      throw new SameActorCannotApproveOwnChangeError(
        id,
        "Business signal source change",
      );
    }

    await requireStepUpAuthorization(req, stepUpVerifier, {
      pendingPolicyChangeId: id,
      action,
    });

    return existing;
  }

  /**
   * POST /business-signal-sources/changes/:id/approve
   *
   * Human caller, not the proposer, with a step up authorization for
   * this change id and action "approve". For a register, the endpoint's
   * address is checked again; then the change is applied and resolved
   * in one step.
   */
  router.post(
    "/changes/:id/approve",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!requireCaller(req, res, "approve a business signal source change"))
          return;
        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const change = await loadForResolution(req, "approve");

        if (change.action === "register" && change.endpointUrl !== undefined) {
          await assertPublic(new URL(change.endpointUrl));
        }

        const resolved = await repository.approveChange(
          change.changeId,
          req.callerId as string,
          new Date(),
        );

        console.info({
          event: "business_signal_source_change_approved",
          changeId: resolved.changeId,
          action: resolved.action,
          name: resolved.name,
          endpointUrl: resolved.endpointUrl,
          signed: resolved.publicKeyPem !== undefined,
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
   * POST /business-signal-sources/changes/:id/reject
   *
   * Requires rejectionReason, and the same checks as approve.
   */
  router.post(
    "/changes/:id/reject",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!requireCaller(req, res, "reject a business signal source change"))
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
              new Date(),
            ),
          );
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  return router;
}
