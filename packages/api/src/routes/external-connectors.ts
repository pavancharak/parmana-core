import crypto from "node:crypto";

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import {
  ConflictError,
  ExternalConnectorChangeNotFoundError,
  ParmanaError,
  PendingPolicyChangeStatus,
  SameActorCannotApproveOwnChangeError,
  ExternalEndpointAddressError,
  checkEndpointUrl,
  resolvePublicEndpointAddresses,
  systemEndpointAddressLookup,
  type EndpointAddressLookup,
  type ExternalConnectorChange,
  type ExternalConnectorRepository,
} from "@parmana/shared";
import { CANONICAL_CAPABILITY_POLICY_BINDINGS } from "@parmana/policy";

import {
  requireHumanCaller,
  requireStepUpAuthorization,
} from "../auth/governanceGuards.js";
import type { PolicyChangeStepUpVerifier } from "../auth/PolicyChangeStepUpVerifier.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";
import { INTENTIONALLY_UNBOUND_CAPABILITIES } from "../bootstrap/intentionallyUnboundCapabilities.js";
import { externalConnectorRepository } from "../repositories.js";

/**
 * External connectors registered without a deploy (ADR-0013): maker
 * checker for binding a capability to an operator's HTTPS endpoint and
 * the policy that governs it.
 *
 * One person proposes registering or revoking one; a different person
 * approves or rejects it with a step up signature, the same rules as an
 * approver change (approval-issuers.ts): human callers only, maker is
 * not checker, step up on approve and reject. Only an approved change
 * touches external_connectors.
 *
 * The endpoint's address is checked when the change is proposed and
 * again when it is approved, since that is when it takes effect.
 * Capabilities in a built in connector's namespace are refused: those
 * stay code.
 */

/**
 * The connector SDK's capability form (isNamespacedCapability), so every
 * registration can be served by a connector, at most 128 characters.
 */
const CAPABILITY_PATTERN =
  "^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*:[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$";
const CAPABILITY = new RegExp(CAPABILITY_PATTERN);
const MAX_CAPABILITY_LENGTH = 128;
const POLICY_NAME = /^[a-z0-9][a-z0-9-]{0,127}$/;
const PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const MAX_ALLOWED_PARAMETERS = 64;
const MAX_REASON_LENGTH = 2000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;

/**
 * Every namespace a built in connector uses, taken from the same tables
 * startup checks every registered connector against.
 */
export const BUILT_IN_CAPABILITY_NAMESPACES: ReadonlySet<string> = new Set(
  [
    ...CANONICAL_CAPABILITY_POLICY_BINDINGS.keys(),
    ...INTENTIONALLY_UNBOUND_CAPABILITIES.keys(),
  ].map(namespaceOf),
);

function namespaceOf(capability: string): string {
  const colon = capability.indexOf(":");

  return colon === -1 ? capability : capability.slice(0, colon);
}

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

class InvalidRegistrationError extends ParmanaError {
  constructor(message: string) {
    super("INVALID_EXTERNAL_CONNECTOR", message, 400);
  }
}

class EndpointAddressRefusedError extends ParmanaError {
  constructor(message: string) {
    super("EXTERNAL_ENDPOINT_ADDRESS_REFUSED", message, 400);
  }
}

function parseAllowedParameters(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_ALLOWED_PARAMETERS ||
    !value.every(
      (name): name is string =>
        typeof name === "string" && PARAMETER_NAME.test(name),
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new InvalidRegistrationError(
      `allowedParameters must be an array of at most ${MAX_ALLOWED_PARAMETERS} distinct names, ` +
        "each matching ^[A-Za-z_][A-Za-z0-9_]{0,63}$.",
    );
  }

  return value;
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
    throw new InvalidRegistrationError(
      `timeoutMs must be an integer from ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS}; it defaults to ${DEFAULT_TIMEOUT_MS}.`,
    );
  }

  return value;
}

function sendError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ParmanaError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  next(error);
}

export function createExternalConnectorsRouter(
  auditSink?: CallerAuditSink,
  stepUpVerifier?: PolicyChangeStepUpVerifier,
  repository: ExternalConnectorRepository = externalConnectorRepository,
  lookup: EndpointAddressLookup = systemEndpointAddressLookup,
): Router {
  const router = Router();

  /**
   * The endpoint URL in the form to store, once its address is public.
   */
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

  /**
   * GET /external-connectors
   *
   * Every registration, active and revoked.
   */
  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to list external connectors.",
          });
          return;
        }

        if (!(await requireHumanCaller(req, auditSink, next))) return;

        res
          .status(200)
          .json({ connectors: await repository.listRegistrations() });
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  /**
   * POST /external-connectors/changes
   *
   * Propose registering a connector ({ action: "register", capability,
   * endpointUrl, policy, allowedParameters, timeoutMs?, reason }) or
   * revoking the active one for a capability ({ action: "revoke",
   * capability, reason }).
   */
  router.post(
    "/changes",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to propose an external connector change.",
          });
          return;
        }

        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const {
          action,
          capability,
          endpointUrl,
          policy,
          allowedParameters,
          timeoutMs,
          reason,
        } = req.body ?? {};

        if (action !== "register" && action !== "revoke") {
          throw new InvalidRegistrationError(
            'action must be "register" or "revoke".',
          );
        }

        if (
          typeof capability !== "string" ||
          capability.length > MAX_CAPABILITY_LENGTH ||
          !CAPABILITY.test(capability)
        ) {
          throw new InvalidRegistrationError(
            `capability must be namespace:verb, at most ${MAX_CAPABILITY_LENGTH} characters, matching ${CAPABILITY_PATTERN}.`,
          );
        }

        const namespace = namespaceOf(capability);

        if (BUILT_IN_CAPABILITY_NAMESPACES.has(namespace)) {
          throw new InvalidRegistrationError(
            `The namespace '${namespace}' belongs to a built in connector. Use another namespace.`,
          );
        }

        if (
          typeof reason !== "string" ||
          reason.trim().length === 0 ||
          reason.length > MAX_REASON_LENGTH
        ) {
          throw new InvalidRegistrationError(
            `reason is required, at most ${MAX_REASON_LENGTH} characters.`,
          );
        }

        const active = await repository.findActive(capability);
        let registration: Pick<
          ExternalConnectorChange,
          "endpointUrl" | "policy" | "allowedParameters" | "timeoutMs"
        > = {};

        if (action === "register") {
          if (typeof policy !== "string" || !POLICY_NAME.test(policy)) {
            throw new InvalidRegistrationError(
              "policy must be a policy name matching ^[a-z0-9][a-z0-9-]{0,127}$.",
            );
          }

          const parameters = parseAllowedParameters(allowedParameters);
          const timeout = parseTimeoutMs(timeoutMs);

          if (active !== null) {
            throw new ConflictError(
              `Capability '${capability}' already has an active external connector. Revoke it first.`,
            );
          }

          registration = {
            endpointUrl: await checkEndpoint(endpointUrl),
            policy,
            allowedParameters: parameters,
            timeoutMs: timeout,
          };
        } else {
          if (
            endpointUrl !== undefined ||
            policy !== undefined ||
            allowedParameters !== undefined ||
            timeoutMs !== undefined
          ) {
            throw new InvalidRegistrationError(
              "A revoke takes only action, capability and reason.",
            );
          }

          if (active === null) {
            throw new ConflictError(
              `Capability '${capability}' has no active external connector.`,
            );
          }
        }

        const change: ExternalConnectorChange = {
          changeId: crypto.randomUUID(),
          action,
          capability,
          ...registration,
          reason,
          proposedBy: req.callerId,
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
   * GET /external-connectors/changes?status=...
   */
  router.get(
    "/changes",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to list external connector changes.",
          });
          return;
        }

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
  ): Promise<ExternalConnectorChange> {
    const id = asString(req.params.id) ?? "";
    const existing = await repository.findChange(id);

    if (existing === null) {
      throw new ExternalConnectorChangeNotFoundError(id);
    }

    if (existing.proposedBy === req.callerId) {
      throw new SameActorCannotApproveOwnChangeError(
        id,
        "External connector change",
      );
    }

    await requireStepUpAuthorization(req, stepUpVerifier, {
      pendingPolicyChangeId: id,
      action,
    });

    return existing;
  }

  /**
   * POST /external-connectors/changes/:id/approve
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
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to approve an external connector change.",
          });
          return;
        }

        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const change = await loadForResolution(req, "approve");

        if (change.action === "register" && change.endpointUrl !== undefined) {
          await assertPublic(new URL(change.endpointUrl));
        }

        const resolved = await repository.approveChange(
          change.changeId,
          req.callerId,
          new Date(),
        );

        console.info({
          event: "external_connector_change_approved",
          changeId: resolved.changeId,
          action: resolved.action,
          capability: resolved.capability,
          endpointUrl: resolved.endpointUrl,
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
   * POST /external-connectors/changes/:id/reject
   *
   * Requires rejectionReason, and the same checks as approve.
   */
  router.post(
    "/changes/:id/reject",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to reject an external connector change.",
          });
          return;
        }

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
              req.callerId,
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
