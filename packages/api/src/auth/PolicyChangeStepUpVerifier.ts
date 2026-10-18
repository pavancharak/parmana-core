import type { KeyObject } from "node:crypto";

import { PolicyChangeStepUpAuthorizationVerifier } from "@parmana/crypto";
import type { PolicyChangeStepUpAuthorization } from "@parmana/shared";
import type { NonceStore } from "@parmana/envelope-verifier";

const DEFAULT_MAX_TTL_SECONDS = 120;

/**
 * Full verification result for a step-up envelope, including the
 * nonce check -- see verify() below.
 */
export interface PolicyChangeStepUpVerificationResult {
  readonly valid: boolean;

  readonly checks: {
    readonly versionSupported: boolean;
    readonly signatureVerified: boolean;
    readonly notExpired: boolean;
    readonly pendingPolicyChangeIdMatches: boolean;
    readonly actionMatches: boolean;
    readonly ttlWithinPolicy: boolean;
    readonly nonceUnseen: boolean;
  };
}

export interface PolicyChangeStepUpVerifierOptions {
  readonly nonceStore: NonceStore;

  /**
   * Reject envelopes whose (expiresAt - authorizedAt) exceeds this, so
   * a compromised or misconfigured signer cannot mint long-lived
   * envelopes. Defaults to 120 seconds -- tighter than
   * EnvelopeVerifier's own 300s default, since a step-up envelope is
   * signed interactively by a human at the moment of approval, not by
   * a long-running service that might reasonably need more headroom.
   */
  readonly maxTtlSeconds?: number;
}

/**
 * Verifies a PolicyChangeStepUpAuthorization end to end: signature,
 * expiry, binding to the specific (pendingPolicyChangeId, action) the
 * request is for, TTL policy, and single-use nonce consumption.
 *
 * Structurally mirrors EnvelopeVerifier
 * (@parmana/envelope-verifier) exactly -- same verifyChecks()/
 * consumeNonce()/verify() split, same "nonce is the only
 * side-effecting check, attempted last, only once every other check
 * has independently passed" discipline, same NonceStore interface (a
 * dedicated instance/table -- see
 * createPolicyChangeStepUpNonceStore.ts). It is a sibling class, not a
 * literal reuse of EnvelopeVerifier, for one necessary reason:
 * EnvelopeVerifier is constructed with ONE fixed publicKey, because it
 * verifies exactly one thing -- Parmana's own single runtime signing
 * key. A step-up envelope is signed by a DIFFERENT key per request
 * (whichever human checker is calling), so the public key and the
 * (pendingPolicyChangeId, action) binding must be verify()-time
 * parameters here, not constructor fields.
 */
export class PolicyChangeStepUpVerifier {
  private readonly authorizationVerifier =
    new PolicyChangeStepUpAuthorizationVerifier();

  private readonly nonceStore: NonceStore;
  private readonly maxTtlSeconds: number;

  constructor(options: PolicyChangeStepUpVerifierOptions) {
    this.nonceStore = options.nonceStore;
    this.maxTtlSeconds = options.maxTtlSeconds ?? DEFAULT_MAX_TTL_SECONDS;
  }

  /**
   * Runs every side-effect-free check. Never touches the nonce store.
   */
  async verifyChecks(
    authorization: PolicyChangeStepUpAuthorization,
    publicKey: KeyObject,
    expected: {
      readonly pendingPolicyChangeId: string;
      readonly action: "approve" | "reject";
    },
    now: Date = new Date(),
  ): Promise<{
    readonly passed: boolean;
    readonly checks: Omit<
      PolicyChangeStepUpVerificationResult["checks"],
      "nonceUnseen"
    >;
  }> {
    const { checks } = await this.authorizationVerifier.verify(
      authorization,
      publicKey,
      expected,
      now,
    );

    const {
      versionSupported,
      signatureVerified,
      notExpired,
      pendingPolicyChangeIdMatches,
      actionMatches,
    } = checks;

    const ttlSeconds =
      (Date.parse(authorization.payload.expiresAt) -
        Date.parse(authorization.payload.authorizedAt)) /
      1000;

    const ttlWithinPolicy =
      Number.isFinite(ttlSeconds) && ttlSeconds <= this.maxTtlSeconds;

    return {
      passed:
        versionSupported &&
        signatureVerified &&
        notExpired &&
        pendingPolicyChangeIdMatches &&
        actionMatches &&
        ttlWithinPolicy,

      checks: {
        versionSupported,
        signatureVerified,
        notExpired,
        pendingPolicyChangeIdMatches,
        actionMatches,
        ttlWithinPolicy,
      },
    };
  }

  /**
   * Consumes the envelope's nonce. MUST only be called after every
   * side-effect-free check has passed -- see verify() for the safe
   * composition.
   */
  async consumeNonce(
    authorization: PolicyChangeStepUpAuthorization,
  ): Promise<boolean> {
    return this.nonceStore.checkAndRecord(
      authorization.payload.nonce,
      authorization.payload.expiresAt,
    );
  }

  /**
   * Verifies signature, expiry, action/id binding, and TTL policy,
   * then -- only if all of those passed -- consumes the nonce. The
   * safe composition of verifyChecks() and consumeNonce(): an invalid
   * or expired envelope must not burn a nonce.
   */
  async verify(
    authorization: PolicyChangeStepUpAuthorization,
    publicKey: KeyObject,
    expected: {
      readonly pendingPolicyChangeId: string;
      readonly action: "approve" | "reject";
    },
    now: Date = new Date(),
  ): Promise<PolicyChangeStepUpVerificationResult> {
    const { passed, checks } = await this.verifyChecks(
      authorization,
      publicKey,
      expected,
      now,
    );

    const nonceUnseen = passed ? await this.consumeNonce(authorization) : false;

    return {
      valid: passed && nonceUnseen,
      checks: {
        ...checks,
        nonceUnseen,
      },
    };
  }
}
