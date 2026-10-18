import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import {
  CapabilityPolicyBinder,
  describePolicySignalRequirements,
} from "@parmana/policy";
import type { Policy } from "@parmana/policy";

import type { CallerAuditSink } from "../auth/CallerAuditSink.js";
import { isCapabilityAllowed } from "../auth/isCapabilityAllowed.js";
import { isHumanCaller } from "../auth/isHumanCaller.js";
import { recordCallerAuditEvent } from "../auth/recordCallerAuditEvent.js";
import { policyRepository } from "../application.js";
import { createCurrentPolicyVersionSource } from "../bootstrap/createCurrentPolicyVersionSource.js";
import { createExternalPolicyBindingSource } from "../bootstrap/createExternalPolicyBindingSource.js";

/**
 * GET /policies/in-effect?capability=<action>
 *
 * The policy a request for a capability must declare right now: the
 * bound policy name and, where policy governance decides it, the
 * version most recently approved (G-66). An agent reads it instead of
 * writing a version into its code, so approving a new version needs no
 * change to the agent. It is the same rule POST /execute enforces
 * (CapabilityPolicyBinder.policyInEffect), so the answer cannot
 * disagree with enforcement; the agent still declares the version in
 * its request, and the request is still checked.
 *
 * The answer also says what a request must carry, without the rules:
 * the policy's description, and its signal requirements (every fact the
 * rules read, their declared types, the facts that must equal a value of
 * the Intent, and the facts that need a signed approval with what that
 * approval names). An agent builds its request from these instead of
 * from a copy of the policy. Rule conditions are not returned; the
 * description is the policy author's own text.
 *
 * Who may ask: a caller whose key may invoke the capability, or a human
 * caller. Responses:
 * - 200 { capability, policy: { name, version, schemaVersion },
 *   description, signals: { facts, schema, bound, approval } }
 * - 400 capability missing
 * - 403 CAPABILITY_NOT_ALLOWED
 * - 404 CAPABILITY_NOT_BOUND: no policy is bound to it
 * - 409 NO_APPROVED_POLICY_VERSION: every request is refused until one
 *   is approved
 * - 503 POLICY_VERSION_UNAVAILABLE: the lookup failed; every request is
 *   refused meanwhile
 */
export function createPolicyInEffectRouter(
  auditSink?: CallerAuditSink,
  binder: CapabilityPolicyBinder = new CapabilityPolicyBinder(
    createCurrentPolicyVersionSource(),
    createExternalPolicyBindingSource(),
  ),
  loadPolicy: (name: string, version: string) => Promise<Policy> = (
    name,
    version,
  ) => policyRepository.load(name, version),
): Router {
  const router = Router();

  router.get(
    "/in-effect",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const capability = req.query.capability;

        if (typeof capability !== "string" || capability.trim() === "") {
          res.status(400).json({
            error:
              "capability is required, for example ?capability=paytm:refund.",
          });
          return;
        }

        if (
          req.callerId !== undefined &&
          !isHumanCaller(req.callerCredentialHolderType) &&
          !isCapabilityAllowed(capability, req.callerAllowedCapabilities)
        ) {
          if (auditSink) {
            const recorded = await recordCallerAuditEvent(
              auditSink,
              {
                type: "caller.capability_denied",
                occurredAt: new Date().toISOString(),
                route: req.originalUrl,
                callerId: req.callerId,
                capability,
                reason: "capability not allowed",
              },
              req,
              next,
            );

            if (!recorded) return;
          }

          res.status(403).json({
            error: "Caller is not permitted to invoke this capability.",
            code: "CAPABILITY_NOT_ALLOWED",
          });
          return;
        }

        const inEffect = await binder.policyInEffect(capability);

        if (inEffect === undefined) {
          res.status(404).json({
            error: `No policy is bound to capability "${capability}".`,
            code: "CAPABILITY_NOT_BOUND",
          });
          return;
        }

        if (inEffect.kind === "unavailable") {
          res.status(inEffect.noApprovedVersion ? 409 : 503).json({
            error: `Every request for "${capability}" is refused right now: ${inEffect.reason}.`,
            code: inEffect.noApprovedVersion
              ? "NO_APPROVED_POLICY_VERSION"
              : "POLICY_VERSION_UNAVAILABLE",
          });
          return;
        }

        let policy: Policy;

        try {
          policy = await loadPolicy(
            inEffect.policy.name,
            inEffect.policy.version,
          );
        } catch (error) {
          console.error({
            event: "policy_in_effect_load_failed",
            capability,
            policy: inEffect.policy,
            error: error instanceof Error ? error.message : String(error),
          });

          res.status(503).json({
            error: `The policy in effect for "${capability}" could not be read.`,
            code: "POLICY_VERSION_UNAVAILABLE",
          });
          return;
        }

        res.status(200).json({
          capability,
          policy: inEffect.policy,
          description: policy.description ?? null,
          ...(policy.requireAuthorityGrant === true && {
            authorityGrantRequired: true,
          }),
          signals: describePolicySignalRequirements(policy),
        });
        return;
      } catch (error) {
        next(error);
        return;
      }
    },
  );

  return router;
}
