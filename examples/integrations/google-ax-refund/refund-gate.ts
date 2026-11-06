import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ApprovalSignalVerifier, ApprovalVerifier } from "@parmana/approval";
import { APPROVAL_ARTIFACT_CRYPTO_PROVIDER } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  PolicyEngine,
  PolicyOutcome,
  PolicyValidator,
  type Policy,
  type PolicySignals,
  type SignalStateVerificationRequest,
} from "@parmana/policy";
import type { SignedApproval } from "@parmana/shared";

/**
 * The Parmana side of the refund integration.
 *
 * It applies the real customer-refund policy and the approval rules,
 * in the order RuntimeEngine runs them (policy first, then the approval
 * check, and the approval again at release). It never calls a business
 * system. The caller decides what to do with the result.
 *
 * Mirrors the checks in examples/tutorials/119-human-approval-for-one-action,
 * with two additions the acceptance test needs: the trust list is passed in
 * per stage, so a revocation between authorize and release can be modelled,
 * and each decision is returned with the stage that made it.
 */

export const REFUND_ACTION = "erp:invoice-pay";

export type IssuerRegistry = ConstructorParameters<
  typeof ApprovalVerifier
>[0]["issuerRegistry"];

export type GateStage = "authorize" | "release";

export interface RefundRequest {
  readonly orderId: string;
  readonly amount: number;
  readonly managerApproved: boolean;
  readonly approval?: SignedApproval;
}

export interface GateDecision {
  readonly approved: boolean;
  readonly stage: GateStage;
  readonly reason: string;
}

/** Loads and validates the real policy from the repository. */
export function loadRefundPolicy(repoRoot: string): Policy {
  const policy = JSON.parse(
    readFileSync(
      join(repoRoot, "policies", "customer-refund", "1.2.0", "policy.json"),
      "utf8",
    ),
  ) as Policy;
  new PolicyValidator().validate(policy);
  return policy;
}

function signalsFor(refund: RefundRequest): PolicySignals {
  return {
    refundEligible: true,
    fraudCheckPassed: true,
    refundAmount: refund.amount,
    managerApproved: refund.managerApproved,
    // Arrives over HTTP as JSON inside the request's signals.
    ...(refund.approval !== undefined && {
      approvalArtifact: JSON.parse(JSON.stringify(refund.approval)),
    }),
  };
}

function verificationRequest(
  policy: Policy,
  refund: RefundRequest,
  stage: GateStage,
  requestId: string,
): SignalStateVerificationRequest {
  return {
    action: REFUND_ACTION,
    businessTransactionId: requestId,
    intentParameters: { orderId: refund.orderId, amount: refund.amount },
    intentTarget: `orders/${refund.orderId}`,
    stage,
    policy,
  };
}

export class RefundGate {
  private readonly engine = new PolicyEngine();
  // Shared across stages, so an approval consumed at authorize cannot be
  // used again. The release stage verifies without consuming.
  private readonly nonceStore = new MemoryNonceStore();

  constructor(private readonly policy: Policy) {}

  /** Policy, then the approval check. Consumes the approval when it passes. */
  async authorize(
    refund: RefundRequest,
    registry: IssuerRegistry,
    requestId: string,
  ): Promise<GateDecision> {
    const signals = signalsFor(refund);
    const decision = this.engine.evaluate(this.policy, signals);

    if (decision.outcome !== PolicyOutcome.APPROVE) {
      return {
        approved: false,
        stage: "authorize",
        reason: `${decision.matchedRuleId}: ${decision.reason}`,
      };
    }

    return this.checkApproval(refund, registry, "authorize", requestId);
  }

  /**
   * The gateway's check just before the connector runs. Verifies the
   * approval against the trust list as it stands now, without consuming it.
   */
  async release(
    refund: RefundRequest,
    registry: IssuerRegistry,
    requestId: string,
  ): Promise<GateDecision> {
    return this.checkApproval(refund, registry, "release", requestId);
  }

  private async checkApproval(
    refund: RefundRequest,
    registry: IssuerRegistry,
    stage: GateStage,
    requestId: string,
  ): Promise<GateDecision> {
    const verifier = new ApprovalSignalVerifier(
      new ApprovalVerifier({
        crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
        issuerRegistry: registry,
        nonceStore: this.nonceStore,
      }),
    );

    const violations = await verifier.findViolations(
      verificationRequest(this.policy, refund, stage, requestId),
      signalsFor(refund),
    );

    if (violations.length > 0) {
      const detail = violations
        .map(
          (v) =>
            `${v.signalKey}=${String(v.declaredValue)} != verified ${String(v.actualValue)}`,
        )
        .join(", ");
      return { approved: false, stage, reason: `approval check: ${detail}` };
    }

    return { approved: true, stage, reason: "approval verified" };
  }
}
