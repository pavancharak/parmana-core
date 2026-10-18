import {
  DEFAULT_APPROVAL_ARTIFACT_SIGNAL,
  type ApprovalSignalDeclaration,
  type PolicySignals,
  type SignalStateVerificationRequest,
  type SignalStateVerifier,
  type SignalStateViolation,
} from "@parmana/policy";
import type { SignedApproval } from "@parmana/shared";

import type {
  ApprovalVerificationRequest,
  ApprovalVerifier,
} from "./ApprovalVerifier.js";
import { isSignedApprovalShape } from "./SignedApprovalGuard.js";

/**
 * The scope.field an approval must carry: "value" when the policy
 * declaration gives a `value` path (the scope bounds that number),
 * otherwise "resourceId" (the scope names the resource). These are
 * the names the TypeScript and Python SDKs' signApproval and
 * scripts/sign-approval.ts already write.
 */
export const APPROVAL_SCOPE_FIELD_VALUE = "value";
export const APPROVAL_SCOPE_FIELD_RESOURCE_ID = "resourceId";

interface PendingApproval {
  readonly signalKey: string;
  readonly artifact: SignedApproval;
  readonly request: ApprovalVerificationRequest;
}

type Resolved<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

/**
 * Verifies every signal a policy declares in approvalSignals (G-65),
 * for any action, with no per capability code.
 *
 * For each declared signal the caller sets to true, the signal named by
 * the declaration's `artifact` (default "approvalArtifact") must hold a
 * SignedApproval that ApprovalVerifier accepts for this action, for the
 * resource at `resourceId` in the Intent's parameters, with a scope
 * covering the number at `value` when the policy gives one (scope.field
 * "value"), or naming exactly this resource when it does not
 * (scope.field "resourceId"). Resource and value come from
 * the Intent, never from the caller's signals.
 *
 * Runs at both checks. Every approval is first checked without being
 * used; only when all of them pass, and only at "authorize", is each one
 * used (its nonce recorded). So a request refused for one approval never
 * uses up another, and the gateway's check at "release" runs every check
 * except recording the nonce (see SignalStateVerificationRequest.stage).
 *
 * Fails closed: a missing or malformed resource, value or approval is a
 * violation. Without the policy there is no way to know which signals
 * need an approval, so a request that carries an approval is refused.
 */
export class ApprovalSignalVerifier implements SignalStateVerifier {
  constructor(private readonly approvalVerifier: ApprovalVerifier) {}

  async findViolations(
    request: SignalStateVerificationRequest,
    signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    if (request.policy === undefined) {
      return Object.values(signals).some(isSignedApprovalShape)
        ? [
            {
              signalKey: DEFAULT_APPROVAL_ARTIFACT_SIGNAL,
              declaredValue: "<approval attached>",
              actualValue:
                "<unverifiable: the policy is not available to say which signals need an approval>",
            },
          ]
        : [];
    }

    const declarations = request.policy.approvalSignals;

    if (declarations === undefined) {
      return [];
    }

    const violations: SignalStateViolation[] = [];
    const pending: PendingApproval[] = [];

    const entries = Object.entries(declarations).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );

    for (const [signalKey, declaration] of entries) {
      if (signals[signalKey] !== true) {
        continue;
      }

      const prepared = this.prepare(request, signals, signalKey, declaration);

      if ("violation" in prepared) {
        violations.push(prepared.violation);
      } else {
        pending.push(prepared.approval);
      }
    }

    //
    // Pass 1: every check except recording the nonce, for every approval.
    //
    for (const approval of pending) {
      const result = await this.approvalVerifier.verify(approval.artifact, {
        ...approval.request,
        consumeNonce: false,
      });

      if (!result.valid) {
        violations.push(refused(approval.signalKey));
      }
    }

    if (violations.length > 0 || request.stage === "release") {
      return violations;
    }

    //
    // Pass 2, at authorization only: use each approval once.
    //
    for (const approval of pending) {
      const result = await this.approvalVerifier.verify(approval.artifact, {
        ...approval.request,
        consumeNonce: true,
      });

      if (!result.valid) {
        violations.push(refused(approval.signalKey));
      }
    }

    return violations;
  }

  private prepare(
    request: SignalStateVerificationRequest,
    signals: PolicySignals,
    signalKey: string,
    declaration: ApprovalSignalDeclaration,
  ):
    | { readonly approval: PendingApproval }
    | { readonly violation: SignalStateViolation } {
    const resourceId = resolveResourceId(request, declaration.resourceId);

    if (!resourceId.ok) {
      return { violation: missing(signalKey, resourceId.reason) };
    }

    let requestedValue: unknown = resourceId.value;
    let scopeField = APPROVAL_SCOPE_FIELD_RESOURCE_ID;

    if (declaration.value !== undefined) {
      scopeField = APPROVAL_SCOPE_FIELD_VALUE;
      const value = resolveNumber(request, declaration.value);

      if (!value.ok) {
        return { violation: missing(signalKey, value.reason) };
      }

      requestedValue = value.value;
    }

    const artifact =
      signals[declaration.artifact ?? DEFAULT_APPROVAL_ARTIFACT_SIGNAL];

    if (!isSignedApprovalShape(artifact)) {
      return { violation: refused(signalKey) };
    }

    return {
      approval: {
        signalKey,
        artifact,
        request: {
          action: request.action,
          resourceId: resourceId.value,
          requestedValue,
          scopeField,
        },
      },
    };
  }
}

function refused(signalKey: string): SignalStateViolation {
  return { signalKey, declaredValue: true, actualValue: false };
}

function missing(signalKey: string, reason: string): SignalStateViolation {
  return { signalKey, declaredValue: true, actualValue: `<${reason}>` };
}

function resolveParameter(
  request: SignalStateVerificationRequest,
  path: string,
): unknown {
  if (path === "target") {
    return request.intentTarget;
  }

  const [root, ...keys] = path.split(".");

  if (root !== "parameters" || keys.length === 0) {
    return undefined;
  }

  return keys.reduce<unknown>((current, key) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, request.intentParameters);
}

function resolveResourceId(
  request: SignalStateVerificationRequest,
  path: string,
): Resolved<string> {
  const value = resolveParameter(request, path);

  if (typeof value === "string" && value.length > 0) {
    return { ok: true, value };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, value: String(value) };
  }

  return {
    ok: false,
    reason: `missing: ${path} is required to verify an approval`,
  };
}

function resolveNumber(
  request: SignalStateVerificationRequest,
  path: string,
): Resolved<number> {
  const value = resolveParameter(request, path);

  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, value };
  }

  return {
    ok: false,
    reason: `missing: ${path} must be a number to verify an approval`,
  };
}
