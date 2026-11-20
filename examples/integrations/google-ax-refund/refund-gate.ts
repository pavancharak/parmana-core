import { ApprovalSignalVerifier, ApprovalVerifier } from "@parmana/approval";
import { APPROVAL_ARTIFACT_CRYPTO_PROVIDER } from "@parmana/crypto";
import {
  PolicyEngine,
  PolicyOutcome,
  PolicyValidator,
  type Policy,
  type PolicySignals,
  type SignalStateVerificationRequest,
} from "@parmana/policy";
import {
  StaticBusinessSignalSourceRegistry,
  TrustedSignalResolver,
  type BusinessSignalSource,
} from "@parmana/runtime";
import { BusinessValidationStatus, type SignedApproval } from "@parmana/shared";
import { MemoryApprovalNonceLedger } from "@parmana/storage";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Parmana side of the refund integration.
 *
 * It applies the live payment-refund policy and the approval rules, in the
 * order RuntimeEngine runs them: the payment source first (the policy's
 * paymentRefundable fact is taken from the source, never from the caller),
 * then the policy, then the approval check. The approval is checked again at
 * release, without being used up. It never calls a business system.
 *
 * The payment source is passed in. The example uses a stand-in; in production
 * it is the payment provider's signal service, registered with Parmana.
 */

export const REFUND_ACTION = "payments:refund";

export type IssuerRegistry = ConstructorParameters<
  typeof ApprovalVerifier
>[0]["issuerRegistry"];

export type GateStage = "authorize" | "release";

export interface RefundRequest {
  /** The payment to refund, as the Intent target, for example "payments/pay_ABC123". */
  readonly target: string;
  readonly amount: number;
  readonly approval?: SignedApproval;
}

export interface GateDecision {
  readonly approved: boolean;
  readonly stage: GateStage;
  readonly reason: string;
}

/** Loads and validates the live policy from the repository. */
export function loadRefundPolicy(repoRoot: string): Policy {
  const policy = JSON.parse(
    readFileSync(
      join(repoRoot, "policies", "payment-refund", "1.0.0", "policy.json"),
      "utf8",
    ),
  ) as Policy;
  new PolicyValidator().validate(policy);
  return policy;
}

function signalsFor(refund: RefundRequest): PolicySignals {
  return {
    refundAmount: refund.amount,
    managerApproved: refund.approval !== undefined,
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
    intentParameters: { amount: refund.amount },
    intentTarget: refund.target,
    stage,
    policy,
  };
}

export class RefundGate {
  private readonly engine = new PolicyEngine();
  private readonly resolver: TrustedSignalResolver;
  // Shared across stages, so an approval consumed at authorize cannot be
  // used again. The release stage verifies without consuming.
  private readonly nonceStore = new MemoryApprovalNonceLedger();

  constructor(
    private readonly policy: Policy,
    paymentSource: BusinessSignalSource,
  ) {
    this.resolver = new TrustedSignalResolver(
      new StaticBusinessSignalSourceRegistry([paymentSource]),
    );
  }

  /** Payment source, then policy, then approval. Consumes the approval when it passes. */
  async authorize(
    refund: RefundRequest,
    registry: IssuerRegistry,
    requestId: string,
  ): Promise<GateDecision> {
    const resolved = await this.resolver.resolve({
      policy: this.policy,
      action: REFUND_ACTION,
      businessTransactionId: requestId,
      intent: {
        target: refund.target,
        parameters: { amount: refund.amount },
      },
      proposedSignals: { refundAmount: refund.amount },
    });

    if (resolved.assessment.status !== BusinessValidationStatus.VALID) {
      return {
        approved: false,
        stage: "authorize",
        reason: `business validation ${resolved.assessment.status}: ${resolved.assessment.reason ?? "the payment source did not confirm"}`,
      };
    }

    const signals: PolicySignals = {
      ...signalsFor(refund),
      ...resolved.trustedValues,
    };
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
