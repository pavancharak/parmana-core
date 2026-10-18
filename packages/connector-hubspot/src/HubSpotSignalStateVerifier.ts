import { ApprovalVerifier, isSignedApprovalShape } from "@parmana/approval";
import type { CryptoProvider, KeyProvider, Signer } from "@parmana/crypto";
import type { ExecutionSystem } from "@parmana/execution-system";
import type {
  PolicySignals,
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "@parmana/policy";

import {
  executeHubSpotCapability,
  hubSpotConnectorResponseMetadata,
} from "./HubSpotCapabilityExecution.js";
import {
  HUBSPOT_DEAL_FETCH_CAPABILITY,
  HUBSPOT_DEAL_UPDATE_CAPABILITY,
} from "./HubSpotCapabilities.js";
import { buildHubSpotDealUpdateSignals } from "./HubSpotDealUpdateSignals.js";
import type { HubSpotDeal } from "./HubSpotTypes.js";

export interface HubSpotSignalStateVerifierOptions {
  readonly gateway: ExecutionSystem;

  /**
   * How the verifier signs its own deal fetch. Supply exactly one.
   *
   * resolveSigner signs through a Signer (ADR-0009), so the fetch is
   * signed with the key KEY_PROVIDER selects, the same key the gateway
   * verifies against; production wiring uses it, resolving
   * SignerBootstrap. keys reads a raw private key and so only works
   * with local key files: under KEY_PROVIDER=aws-kms it would sign with
   * a different key than the gateway verifies, and every fetch would be
   * refused. It remains for tests and tutorials that use local keys.
   */
  readonly resolveSigner?: () => Promise<Signer>;
  readonly keys?: KeyProvider;

  readonly signerKeyId: string;
  readonly policyName: string;
  readonly policyVersion: string;
  /** Resolves the content hash of policyName@policyVersion, bound into each fetch. */
  readonly resolvePolicyContentHash?: () => Promise<string>;
  readonly crypto: CryptoProvider;
  readonly authorizationTtlSeconds?: number;
  readonly amountChangeThreshold?: number;
  readonly stageOrder?: readonly string[];

  /**
   * TD-23 closure (Phase 3C). Optional and additive for the same
   * backward-compatibility reason every other optional field here is:
   * every pre-existing call site that constructs this class directly
   * must keep compiling and behaving identically. When omitted,
   * preAuthorizedForAmountChange is not independently verified --
   * prior behavior, unchanged (the caller's own declared value passes
   * straight through, per HubSpotDealUpdateSignals.ts's own comment on
   * that field). When supplied, an over-threshold amount change's
   * preAuthorizedForAmountChange claim is verified against a real,
   * independently-issued SignedApproval carried in
   * signals.approvalArtifact (the Phase 3A approval artifact design, in git history),
   * rather than trusted from the caller -- closing the gap where a
   * caller could declare preAuthorizedForAmountChange: true with
   * nothing behind it.
   */
  readonly approvalVerifier?: ApprovalVerifier;
}

/**
 * Signal keys this verifier independently re-derives from a real
 * HubSpot deal fetch and compares against the caller-declared value.
 * Deliberately excludes proposedDealStage/proposedAmount (already
 * proven, by SignalIntentBinder, to equal parameters.dealstage/
 * parameters.amount before this verifier ever runs) and
 * preAuthorizedForAmountChange, which is handled separately (see
 * verifyPreAuthorization below), not by comparison against a
 * HubSpot-reported fact -- HubSpot has no concept of Parmana's own
 * pre-authorization claim; instead, when configured, it is
 * independently derived from a real, externally-issued Approval
 * Artifact (TD-23 closure, Phase 3C).
 */
export const HUBSPOT_VERIFIED_SIGNAL_KEYS = [
  "currentDealStage",
  "dealStageChangeRequested",
  "dealStageTransitionAllowed",
  "amountChangeRequested",
  "amountDeltaAbs",
  "amountChangeExceedsThreshold",
] as const;

/**
 * G-24 residual closure (RFC-0022), hubspot-deal-update slice:
 * independently verifies the hubspot-deal-update policy's signals
 * against a real HubSpot deal fetch, immediately before
 * PolicyEngine.evaluate's result would otherwise be trusted verbatim.
 *
 * Reuses exactly the fetch HubSpotDealUpdateService already performs
 * -- executeHubSpotCapability against HUBSPOT_DEAL_FETCH_CAPABILITY,
 * buildHubSpotDealUpdateSignals to derive the canonical facts -- so
 * "verified" here means the same thing it already means there.
 *
 * Fails closed: a fetch error (network failure, malformed response,
 * deal not found) becomes a violation, not a pass-through -- a
 * request whose real state cannot be confirmed is refused, never
 * approved on faith in the caller's own claim.
 */
export class HubSpotSignalStateVerifier implements SignalStateVerifier {
  constructor(private readonly options: HubSpotSignalStateVerifierOptions) {
    if (
      (options.resolveSigner === undefined) ===
      (options.keys === undefined)
    ) {
      throw new Error(
        "HubSpotSignalStateVerifier needs exactly one of resolveSigner or keys.",
      );
    }
  }

  async findViolations(
    request: SignalStateVerificationRequest,
    signals: PolicySignals,
  ): Promise<readonly SignalStateViolation[]> {
    if (request.action !== HUBSPOT_DEAL_UPDATE_CAPABILITY) {
      return [];
    }

    const dealId = request.intentParameters?.dealId;

    if (typeof dealId !== "string" || dealId.length === 0) {
      return [
        {
          signalKey: "dealId",
          declaredValue: dealId,
          actualValue:
            "<missing: parameters.dealId is required to verify deal state>",
        },
      ];
    }

    let deal: HubSpotDeal;

    try {
      const signing =
        this.options.resolveSigner !== undefined
          ? { signer: await this.options.resolveSigner() }
          : {
              signerPrivateKey: await this.options.keys!.getPrivateKey(
                this.options.signerKeyId,
              ),
            };

      const fetchResult = await executeHubSpotCapability(
        {
          ...signing,
          gateway: this.options.gateway,
          signerKeyId: this.options.signerKeyId,
          policyName: this.options.policyName,
          policyVersion: this.options.policyVersion,
          ...(this.options.resolvePolicyContentHash !== undefined
            ? { policyContentHash: await this.options.resolvePolicyContentHash() }
            : {}),
          crypto: this.options.crypto,
          ...(this.options.authorizationTtlSeconds !== undefined
            ? { authorizationTtlSeconds: this.options.authorizationTtlSeconds }
            : {}),
        },
        {
          businessTransactionId: `${request.businessTransactionId}:state-verify`,
          action: HUBSPOT_DEAL_FETCH_CAPABILITY,
          target: `deals/${dealId}`,
          parameters: { dealId },
        },
      );

      deal = hubSpotConnectorResponseMetadata(fetchResult).deal as HubSpotDeal;
    } catch (error) {
      return [
        {
          signalKey: "hubspot:deal-fetch",
          declaredValue: "<declared signals, unverifiable>",
          actualValue: `<verification failed: ${error instanceof Error ? error.message : String(error)}>`,
        },
      ];
    }

    const proposedDealStage = signals.proposedDealStage;
    const proposedAmount = signals.proposedAmount;

    const verified = buildHubSpotDealUpdateSignals({
      currentDeal: deal,
      ...(typeof proposedDealStage === "string" ? { proposedDealStage } : {}),
      ...(typeof proposedAmount === "number" ? { proposedAmount } : {}),
      ...(this.options.amountChangeThreshold !== undefined
        ? { amountChangeThreshold: this.options.amountChangeThreshold }
        : {}),
      ...(this.options.stageOrder !== undefined
        ? { stageOrder: this.options.stageOrder }
        : {}),
    });

    const violations: SignalStateViolation[] = [];

    for (const key of HUBSPOT_VERIFIED_SIGNAL_KEYS) {
      const declaredValue = signals[key];
      const actualValue = verified[key];

      if (declaredValue !== actualValue) {
        violations.push({ signalKey: key, declaredValue, actualValue });
      }
    }

    //
    // Pre-authorization verification (TD-23 closure, Phase 3C).
    //
    // Skipped entirely when a violation already exists above (a
    // request already going to be rejected on independently-verified
    // grounds needs no approval verification, which would otherwise
    // needlessly burn a single-use Approval Artifact's nonce for a
    // request that will never execute), when approvalVerifier is not
    // configured (prior behavior, unchanged), or when the amount
    // change does not exceed the threshold at all -- in that case
    // preAuthorizedForAmountChange has no bearing on the policy's
    // outcome (see policies/hubspot-deal-update/1.0.0/policy.json),
    // so no real approval could ever have been required for it, and
    // none should be consumed. Also skipped when the policy declares
    // approvalSignals (hubspot-deal-update 1.1.0 and later): there
    // ApprovalSignalVerifier checks the one approval every update
    // needs, and checking the same artifact here too would spend its
    // single use nonce twice.
    //
    if (
      violations.length === 0 &&
      this.options.approvalVerifier !== undefined &&
      request.policy?.approvalSignals === undefined &&
      verified.amountChangeExceedsThreshold
    ) {
      const preAuthorizationViolation = await this.verifyPreAuthorization(
        signals,
        dealId,
        verified.amountDeltaAbs as number,
        request.stage !== "release",
      );

      if (preAuthorizationViolation !== undefined) {
        violations.push(preAuthorizationViolation);
      }
    }

    return violations;
  }

  /**
   * Verifies the caller-declared preAuthorizedForAmountChange claim
   * against a real, independently-issued Approval Artifact
   * (signals.approvalArtifact), rather than trusting it verbatim.
   *
   * requestedValue is the independently re-derived amountDeltaAbs (the
   * verified value, not the caller's own declared one), so a caller
   * cannot present a genuine approval for a smaller amount and reuse
   * it to authorize a larger one -- ApprovalVerifier's own
   * scopeSatisfied check rejects that mismatch. The scope must also
   * name "amountDeltaAbs", so an approval scoped to another fact is
   * refused even when its bound happens to compare true.
   *
   * consumeNonce is false when the Execution Gateway checks again at
   * release: the artifact was consumed for this transaction at
   * authorization, and consuming it a second time would refuse every
   * approved request.
   */
  private async verifyPreAuthorization(
    signals: PolicySignals,
    dealId: string,
    amountDeltaAbs: number,
    consumeNonce: boolean,
  ): Promise<SignalStateViolation | undefined> {
    const verifier = this.options.approvalVerifier;

    if (verifier === undefined) {
      return undefined;
    }

    const declaredValue = signals.preAuthorizedForAmountChange;
    const artifact = signals.approvalArtifact;

    const actualValue = isSignedApprovalShape(artifact)
      ? (
          await verifier.verify(artifact, {
            action: HUBSPOT_DEAL_UPDATE_CAPABILITY,
            resourceId: dealId,
            requestedValue: amountDeltaAbs,
            scopeField: "amountDeltaAbs",
            consumeNonce,
          })
        ).valid
      : false;

    if (declaredValue !== actualValue) {
      return {
        signalKey: "preAuthorizedForAmountChange",
        declaredValue,
        actualValue,
      };
    }

    return undefined;
  }
}
