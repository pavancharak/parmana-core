import crypto from "node:crypto";

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import {
  ConflictError,
  ParmanaError,
  PendingPolicyChangeStatus,
  SameActorCannotApproveOwnChangeError,
  PendingPolicyChangeNotFoundError,
  StepUpAuthorizationInvalidError,
  type PendingPolicyChange,
  type JsonValue,
} from "@parmana/shared";

import {
  PolicyNotFoundError,
  PolicyValidator,
  type Policy,
} from "@parmana/policy";

import { pendingPolicyChangeRepository } from "../repositories.js";
import { policyRepository } from "../application.js";
import {
  requireHumanCaller,
  requireStepUpAuthorization,
} from "../auth/governanceGuards.js";
import type { PolicyChangeStepUpVerifier } from "../auth/PolicyChangeStepUpVerifier.js";
import type { CallerAuditSink } from "../auth/CallerAuditSink.js";
import type { PolicyChangeApprovalService } from "../governance/PolicyChangeApprovalService.js";

/**
 * Policy Governance (maker-checker) -- API layer.
 *
 * This router wires the four endpoints to PendingPolicyChangeRepository
 * and returns properly-shaped responses, enforces human-only identity
 * (isHumanCaller.ts) and maker != checker on all four endpoints, and
 * enforces step-up authorization (PolicyChangeStepUpVerifier) on
 * approve/reject specifically -- a second, independent proof of intent
 * on top of (never instead of) bearer-token identity. On approve,
 * once step-up passes, PolicyChangeApprovalService resolves the
 * decision into its two durable effects -- the live
 * policies/{name}/{version}/policy.json write and a signed
 * PolicyChangeApprovalRecord -- BEFORE this handler marks the pending
 * change APPROVED, so a failure partway through never leaves a
 * pending change falsely resolved with no corresponding live effect.
 * Rejections never touch PolicyChangeApprovalService -- see
 * PendingPolicyChange's own doc comment for why a rejection needs no
 * signed record of its own.
 */

const VALID_NAME_OR_VERSION = /^[A-Za-z0-9._-]+$/;

/**
 * A name or version is used as a path segment by FilePolicyRepository.
 * The pattern above allows "." and "..", which are directory steps, so
 * they are refused here with a 400 instead of failing later inside the
 * approve flow (G-88; the repository refuses them too).
 */
function isSafeNameOrVersion(value: string): boolean {
  return VALID_NAME_OR_VERSION.test(value) && value !== "." && value !== "..";
}

const policyValidator = new PolicyValidator();

/**
 * Express's ParamsDictionary/query types allow `string[]` (repeated
 * query keys) alongside `string`; every route param/query value this
 * router reads is expected to be a single string, never repeated.
 */
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
 * Best-effort load of the currently live policy content at
 * (policyName, policyVersion), for the diff view. Absent (not an
 * error) when no such version has ever been published -- a proposal
 * can legitimately introduce a brand new version.
 */
async function loadCurrentContent(
  policyName: string,
  policyVersion: string,
): Promise<Policy | null> {
  try {
    return await policyRepository.load(policyName, policyVersion);
  } catch (error) {
    if (error instanceof PolicyNotFoundError) {
      return null;
    }

    throw error;
  }
}

export function createPendingPolicyChangesRouter(
  auditSink?: CallerAuditSink,
  stepUpVerifier?: PolicyChangeStepUpVerifier,
  policyChangeApprovalService?: PolicyChangeApprovalService,
): Router {
  const router = Router();

  /**
   * POST /policies/:name/:version/pending-changes
   *
   * Propose a change (maker). :version is the existing version this
   * proposal is a change against ("the version being replaced") --
   * proposedContent's own policyVersion may equal it (an in-place
   * content patch, allowed -- see VERIFICATION-GAPS.md G-24's own
   * precedent for that pattern) or differ (a version bump). Either is
   * a legitimate proposal.
   */
  router.post(
    "/:name/:version/pending-changes",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const name = asString(req.params.name);
        const version = asString(req.params.version);

        if (
          name === undefined ||
          version === undefined ||
          !isSafeNameOrVersion(name) ||
          !isSafeNameOrVersion(version)
        ) {
          res.status(400).json({
            error:
              'name and version must match ^[A-Za-z0-9._-]+$ and not be "." or "..".',
          });
          return;
        }

        const { proposedContent, reason } = req.body ?? {};

        if (typeof reason !== "string" || reason.trim().length === 0) {
          res.status(400).json({
            error: "reason is required.",
          });
          return;
        }

        if (
          typeof proposedContent !== "object" ||
          proposedContent === null ||
          Array.isArray(proposedContent)
        ) {
          res.status(400).json({
            error:
              "proposedContent is required and must be a policy.json object.",
          });
          return;
        }

        const candidate = proposedContent as Policy;

        if (candidate.policyId !== name) {
          res.status(400).json({
            error:
              `proposedContent.policyId ('${candidate.policyId}') must equal the ` +
              `policy name in the URL ('${name}').`,
          });
          return;
        }

        /**
         * Approval later writes to
         * policies/{policyName}/{proposedContent.policyVersion}/policy.json
         * -- see PolicyChangeApprovalService, which derives its write
         * target from this exact field, not from the URL's `version`.
         * PolicyValidator only checks that policyVersion is non-empty,
         * not that it is safe to use as a path segment, so this is
         * the one place that guard can be enforced early, with a
         * clean 400, instead of surfacing from FilePolicyRepository's
         * own defense-in-depth check deep inside the approve flow.
         */
        if (
          typeof candidate.policyVersion !== "string" ||
          !isSafeNameOrVersion(candidate.policyVersion)
        ) {
          res.status(400).json({
            error:
              'proposedContent.policyVersion must match ^[A-Za-z0-9._-]+$ and not be "." or "..".',
          });
          return;
        }

        try {
          policyValidator.validate(candidate);
        } catch (error) {
          if (error instanceof Error) {
            res.status(400).json({
              error: error.message,
            });
            return;
          }

          throw error;
        }

        /**
         * validate() above already fails closed on any rule-referenced
         * fact with neither a boundSignals nor an unboundSignalReasons
         * entry, so for a brand-new proposal this is always empty by
         * the time it's reached -- kept anyway, for symmetry with the
         * GET listing below, which surfaces this for pending changes
         * proposed before this fail-closed check existed.
         */
        const coverageWarnings = policyValidator.findUncoveredFacts(candidate);

        /**
         * Unlike coverageWarnings above, findRuleConflicts is never
         * checked by validate() -- it's advisory by design (see its own
         * doc comment), so this can genuinely be non-empty for a
         * perfectly legitimate proposal. Surfaced here so the checker
         * sees it at approval time, same reasoning as coverageWarnings.
         */
        const ruleConflicts = policyValidator.findRuleConflicts(candidate);

        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to propose a policy change.",
          });
          return;
        }

        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const change: PendingPolicyChange = {
          pendingPolicyChangeId: crypto.randomUUID(),
          policyName: name,
          policyVersion: version,
          proposedContent: proposedContent as JsonValue,
          proposedBy: req.callerId,
          proposedAt: new Date(),
          status: PendingPolicyChangeStatus.PENDING_APPROVAL,
          reason,
        };

        const created = await pendingPolicyChangeRepository.create(change);

        res.status(201).json({
          ...created,
          ...(coverageWarnings.length > 0 ? { coverageWarnings } : {}),
          ...(ruleConflicts.length > 0 ? { ruleConflicts } : {}),
        });
        return;
      } catch (error) {
        if (error instanceof ParmanaError) {
          res.status(error.status).json({
            error: error.message,
            code: error.code,
          });
          return;
        }

        next(error);
        return;
      }
    },
  );

  /**
   * GET /policies/pending-changes?status=...
   *
   * Lists changes, each alongside the diff view: `current` (the live
   * content at (policyName, policyVersion) today, or null if that
   * version has never been published) and `proposed` (the change's
   * own proposedContent).
   */
  router.get(
    "/pending-changes",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to list pending policy changes.",
          });
          return;
        }

        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const statusParam = req.query.status;

        if (statusParam !== undefined && !isValidStatus(statusParam)) {
          res.status(400).json({
            error:
              "status must be one of PENDING_APPROVAL, APPROVED, REJECTED.",
          });
          return;
        }

        const changes = await pendingPolicyChangeRepository.list(statusParam);

        const withDiff = await Promise.all(
          changes.map(async (change) => {
            const coverageWarnings = policyValidator.findUncoveredFacts(
              change.proposedContent as unknown as Policy,
            );

            const ruleConflicts = policyValidator.findRuleConflicts(
              change.proposedContent as unknown as Policy,
            );

            return {
              ...change,
              ...(coverageWarnings.length > 0 ? { coverageWarnings } : {}),
              ...(ruleConflicts.length > 0 ? { ruleConflicts } : {}),
              diff: {
                current: await loadCurrentContent(
                  change.policyName,
                  change.policyVersion,
                ),
                proposed: change.proposedContent,
              },
            };
          }),
        );

        res.status(200).json({
          changes: withDiff,
        });
        return;
      } catch (error) {
        if (error instanceof ParmanaError) {
          res.status(error.status).json({
            error: error.message,
            code: error.code,
          });
          return;
        }

        next(error);
        return;
      }
    },
  );

  /**
   * POST /policies/pending-changes/:id/approve
   *
   * Approve (checker). Enforces isHumanCaller, maker != checker
   * (SameActorCannotApproveOwnChangeError), and step-up authorization
   * (StepUpAuthorizationInvalidError) -- in that order, each a
   * precondition for the next, all fail-closed. Once those pass,
   * PolicyChangeApprovalService applies the change's live effect and
   * records signed evidence of it, and only then does this handler
   * resolve the pending change to APPROVED -- see this file's
   * top-of-file note.
   */
  router.post(
    "/pending-changes/:id/approve",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to approve a policy change.",
          });
          return;
        }

        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const id = asString(req.params.id);

        if (id === undefined) {
          res.status(400).json({
            error: "id is required.",
          });
          return;
        }

        const existing = await pendingPolicyChangeRepository.findById(id);

        if (existing === null) {
          throw new PendingPolicyChangeNotFoundError(id);
        }

        if (existing.proposedBy === req.callerId) {
          throw new SameActorCannotApproveOwnChangeError(id);
        }

        await requireStepUpAuthorization(req, stepUpVerifier, {
          pendingPolicyChangeId: id,
          action: "approve",
        });

        //
        // Checked here, before PolicyChangeApprovalService.approve()
        // writes the live policy and its signed approval record. The
        // same guard in pendingPolicyChangeRepository.resolve() runs
        // only afterwards, so without this a rejected or already
        // approved change went live and then answered 409.
        //
        if (existing.status !== PendingPolicyChangeStatus.PENDING_APPROVAL) {
          throw new ConflictError(
            `Pending Policy Change '${id}' is already '${existing.status}' -- ` +
              "only a PENDING_APPROVAL change can be approved or rejected.",
          );
        }

        if (policyChangeApprovalService === undefined) {
          throw new Error(
            "Policy Governance approve is misconfigured: no " +
              "PolicyChangeApprovalService was provided. Refusing to mark " +
              "this change APPROVED without applying its live effect and " +
              "recording signed evidence of it.",
          );
        }

        await policyChangeApprovalService.approve(existing, req.callerId);

        const resolved = await pendingPolicyChangeRepository.resolve(id, {
          outcome: "approved",
          resolvedBy: req.callerId,
        });

        res.status(200).json(resolved);
        return;
      } catch (error) {
        if (error instanceof StepUpAuthorizationInvalidError) {
          res.status(error.status).json({
            error: error.message,
            code: error.code,
          });
          return;
        }

        if (error instanceof ParmanaError) {
          res.status(error.status).json({
            error: error.message,
            code: error.code,
          });
          return;
        }

        next(error);
        return;
      }
    },
  );

  /**
   * POST /policies/pending-changes/:id/reject
   *
   * Reject (checker). Requires rejectionReason. Never touches the
   * live policy file -- rejection is purely a repository state
   * transition. Enforces isHumanCaller, maker != checker
   * (SameActorCannotApproveOwnChangeError), and step-up authorization
   * (StepUpAuthorizationInvalidError), in that order.
   */
  router.post(
    "/pending-changes/:id/reject",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.callerId === undefined) {
          res.status(401).json({
            error:
              "Caller authentication is required to reject a policy change.",
          });
          return;
        }

        if (!(await requireHumanCaller(req, auditSink, next))) return;

        const { rejectionReason } = req.body ?? {};

        if (
          typeof rejectionReason !== "string" ||
          rejectionReason.trim().length === 0
        ) {
          res.status(400).json({
            error: "rejectionReason is required.",
          });
          return;
        }

        const id = asString(req.params.id);

        if (id === undefined) {
          res.status(400).json({
            error: "id is required.",
          });
          return;
        }

        const existing = await pendingPolicyChangeRepository.findById(id);

        if (existing === null) {
          throw new PendingPolicyChangeNotFoundError(id);
        }

        if (existing.proposedBy === req.callerId) {
          throw new SameActorCannotApproveOwnChangeError(id);
        }

        await requireStepUpAuthorization(req, stepUpVerifier, {
          pendingPolicyChangeId: id,
          action: "reject",
        });

        const resolved = await pendingPolicyChangeRepository.resolve(id, {
          outcome: "rejected",
          resolvedBy: req.callerId,
          rejectionReason,
        });

        res.status(200).json(resolved);
        return;
      } catch (error) {
        if (error instanceof StepUpAuthorizationInvalidError) {
          res.status(error.status).json({
            error: error.message,
            code: error.code,
          });
          return;
        }

        if (error instanceof ParmanaError) {
          res.status(error.status).json({
            error: error.message,
            code: error.code,
          });
          return;
        }

        next(error);
        return;
      }
    },
  );

  return router;
}
