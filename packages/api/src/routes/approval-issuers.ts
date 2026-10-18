import crypto from "node:crypto";

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import {
  ApprovalIssuerChangeNotFoundError,
  ConflictError,
  ParmanaError,
  PendingPolicyChangeStatus,
  SameActorCannotApproveOwnChangeError,
  type ApprovalIssuerChange,
  type ApprovalIssuerRepository,
} from "@parmana/shared";

import {
  requireHumanCaller,
  requireStepUpAuthorization,
} from "../auth/governanceGuards.js";
import type { PolicyChangeStepUpVerifier } from "../auth/PolicyChangeStepUpVerifier.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";
import { createCodeApprovalIssuerRegistry } from "../bootstrap/codeApprovalIssuers.js";
import { approvalIssuerRepository } from "../repositories.js";

/**
 * Approvers managed without a deploy: maker checker for the keys trusted
 * to sign Approval Artifacts.
 *
 * One person proposes adding or revoking an approver key; a different
 * person approves or rejects it with a step up signature, the same
 * rules as a policy change (pending-policy-changes.ts): human callers
 * only, maker is not checker, step up on approve and reject. Only an
 * approved change touches approval_issuers, and it applies to the next
 * approval checked (GovernedApprovalIssuerRegistry reads the table
 * each time).
 *
 * Keys listed in code (createApprovalIssuerRegistry.ts) are shown by
 * GET /approval-issuers but cannot be added or revoked here: a key id
 * already in code is refused, and revoking one of those still needs a
 * code change.
 */

const VALID_ID = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_REASON_LENGTH = 2000;

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

/**
 * The key as canonical SPKI PEM, or undefined when it is not an Ed25519
 * public key. Approvals are verified with Ed25519 only.
 */
function normalizeEd25519PublicKey(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) {
    return undefined;
  }

  try {
    const key = crypto.createPublicKey(value);

    if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") {
      return undefined;
    }

    return String(key.export({ type: "spki", format: "pem" }));
  } catch {
    return undefined;
  }
}

function sendError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ParmanaError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  next(error);
}

export function createApprovalIssuersRouter(
  auditSink?: CallerAuditSink,
  stepUpVerifier?: PolicyChangeStepUpVerifier,
  repository: ApprovalIssuerRepository = approvalIssuerRepository,
  codeRegistry = createCodeApprovalIssuerRegistry(),
): Router {
  const router = Router();

  /**
   * GET /approval-issuers
   *
   * Every approver key the server trusts or has trusted: the code list
   * (source "code") and those added through approver changes (source
   * "governed"), with revoked ones marked.
   */
  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to list approval issuers.",
          });
          return;
        }

        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const governed = await repository.listIssuers();

        res.status(200).json({
          issuers: [
            ...codeRegistry.list().map((issuer) => ({
              approverId: issuer.approverId,
              keyId: issuer.keyId,
              revoked: issuer.revoked,
              source: "code" as const,
              publicKeyPem: String(
                issuer.publicKey.export({ type: "spki", format: "pem" }),
              ),
            })),
            ...governed.map((issuer) => ({
              ...issuer,
              source: "governed" as const,
            })),
          ],
        });
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  /**
   * POST /approval-issuers/changes
   *
   * Propose adding a key ({ action: "add", approverId, keyId,
   * publicKeyPem, reason }) or revoking one added this way
   * ({ action: "revoke", approverId, keyId, reason }).
   */
  router.post(
    "/changes",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to propose an approver change.",
          });
          return;
        }

        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const { action, approverId, keyId, publicKeyPem, reason } =
          req.body ?? {};

        if (action !== "add" && action !== "revoke") {
          res.status(400).json({ error: 'action must be "add" or "revoke".' });
          return;
        }

        if (
          typeof approverId !== "string" ||
          typeof keyId !== "string" ||
          !VALID_ID.test(approverId) ||
          !VALID_ID.test(keyId)
        ) {
          res.status(400).json({
            error: "approverId and keyId must match ^[A-Za-z0-9._-]{1,128}$.",
          });
          return;
        }

        if (
          typeof reason !== "string" ||
          reason.trim().length === 0 ||
          reason.length > MAX_REASON_LENGTH
        ) {
          res.status(400).json({
            error: `reason is required, at most ${MAX_REASON_LENGTH} characters.`,
          });
          return;
        }

        if (codeRegistry.resolve(approverId, keyId) !== undefined) {
          throw new ConflictError(
            `Approver '${approverId}' key '${keyId}' is listed in code. ` +
              "Change it with a pull request, or use a new key id.",
          );
        }

        let normalizedKey: string | undefined;

        if (action === "add") {
          normalizedKey = normalizeEd25519PublicKey(publicKeyPem);

          if (normalizedKey === undefined) {
            res.status(400).json({
              error:
                "publicKeyPem must be an Ed25519 public key in PEM, as made by scripts/generate-approver-key.ts.",
            });
            return;
          }

          if ((await repository.findIssuer(approverId, keyId)) !== null) {
            throw new ConflictError(
              `Approver '${approverId}' key '${keyId}' already exists. Use a new key id to add a new key.`,
            );
          }
        } else {
          if (publicKeyPem !== undefined) {
            res.status(400).json({
              error: "publicKeyPem is only for action add.",
            });
            return;
          }

          const existing = await repository.findIssuer(approverId, keyId);

          if (existing === null || existing.revoked) {
            throw new ConflictError(
              `Approver '${approverId}' key '${keyId}' is not an active key added through approver changes.`,
            );
          }
        }

        const change: ApprovalIssuerChange = {
          changeId: crypto.randomUUID(),
          action,
          approverId,
          keyId,
          ...(normalizedKey !== undefined
            ? { publicKeyPem: normalizedKey }
            : {}),
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
   * GET /approval-issuers/changes?status=...
   */
  router.get(
    "/changes",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to list approver changes.",
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
  ): Promise<ApprovalIssuerChange> {
    const id = asString(req.params.id) ?? "";
    const existing = await repository.findChange(id);

    if (existing === null) {
      throw new ApprovalIssuerChangeNotFoundError(id);
    }

    if (existing.proposedBy === req.callerId) {
      throw new SameActorCannotApproveOwnChangeError(id, "Approver change");
    }

    await requireStepUpAuthorization(req, stepUpVerifier, {
      pendingPolicyChangeId: id,
      action,
    });

    return existing;
  }

  /**
   * POST /approval-issuers/changes/:id/approve
   *
   * Human caller, not the proposer, with a step up authorization for
   * this change id and action "approve". Applies the change and
   * resolves it in one step.
   */
  router.post(
    "/changes/:id/approve",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to approve an approver change.",
          });
          return;
        }

        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const change = await loadForResolution(req, "approve");

        const resolved = await repository.approveChange(
          change.changeId,
          req.callerId,
          new Date(),
        );

        console.info({
          event: "approval_issuer_change_approved",
          changeId: resolved.changeId,
          action: resolved.action,
          approverId: resolved.approverId,
          keyId: resolved.keyId,
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
   * POST /approval-issuers/changes/:id/reject
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
              "Caller authentication is required to reject an approver change.",
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
