import { randomUUID } from "node:crypto";
import type { KeyObject } from "node:crypto";

import type {
  PolicyChangeStepUpAuthorization,
  PolicyChangeStepUpAuthorizationPayload,
} from "@parmana/shared";

import { ArtifactSigner } from "./ArtifactSigner.js";
import { SignatureVerifier } from "./SignatureVerifier.js";
import { SHA256HashProvider } from "./providers/hash/SHA256HashProvider.js";
import { Ed25519SignatureProvider } from "./providers/signature/Ed25519SignatureProvider.js";
import type { CryptoProvider } from "./providers/CryptoProvider.js";

/** Allowed clock drift when checking authorizedAt against now. */
const STEP_UP_CLOCK_SKEW_MS = 60_000;

const SUPPORTED_PAYLOAD_VERSION = 1;

/**
 * Step-up keys are always Ed25519, independent of whatever this
 * server's own SIGNATURE_PROVIDER is configured to (that setting
 * governs Parmana's own runtime signing key -- gateway attestation,
 * execution authorization -- never an operator-held key like this
 * one). Hardcoded here rather than threaded through CryptoBootstrap so
 * that PolicyChangeStepUpAuthorizationSigner, run by a checker on
 * their own machine via scripts/sign-policy-change-step-up.ts, never
 * depends on the server's environment/config at all.
 */
const ED25519_ONLY_CRYPTO_PROVIDER: CryptoProvider = {
  hash: new SHA256HashProvider(),
  signature: new Ed25519SignatureProvider(),
};

/**
 * Signs a PolicyChangeStepUpAuthorization. Used by
 * scripts/sign-policy-change-step-up.ts, run by a human checker on
 * their own machine against their own private key -- never runs
 * server-side. Mirrors AuthorizationSigner's shape (caller supplies
 * identity/action fields, this method supplies nonce/timestamps, then
 * signs), scoped to the narrower step-up payload.
 */
export class PolicyChangeStepUpAuthorizationSigner {
  private readonly signer = new ArtifactSigner(ED25519_ONLY_CRYPTO_PROVIDER);

  async sign(
    input: {
      readonly pendingPolicyChangeId: string;
      readonly action: "approve" | "reject";
    },
    privateKey: KeyObject,
    keyId: string,
    ttlSeconds: number,
  ): Promise<PolicyChangeStepUpAuthorization> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error(`Invalid step-up authorization TTL: ${ttlSeconds}`);
    }

    const authorizedAt = new Date();
    const expiresAt = new Date(authorizedAt.getTime() + ttlSeconds * 1000);

    const payload: PolicyChangeStepUpAuthorizationPayload = {
      version: SUPPORTED_PAYLOAD_VERSION,
      nonce: randomUUID(),
      pendingPolicyChangeId: input.pendingPolicyChangeId,
      action: input.action,
      authorizedAt: authorizedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const signature = await this.signer.sign(payload, privateKey);

    return {
      payload,
      signature,
      keyId,
      algorithm: ED25519_ONLY_CRYPTO_PROVIDER.signature.algorithm,
    };
  }
}

/**
 * Result of verifying a PolicyChangeStepUpAuthorization's
 * side-effect-free properties: payload version, signature, expiry,
 * and binding to the specific (pendingPolicyChangeId, action) the
 * request is for. Never touches a nonce store -- see
 * packages/api/src/auth/PolicyChangeStepUpVerifier.ts for the
 * envelope-level wrapper that adds TTL policy and nonce consumption,
 * mirroring EnvelopeVerifier's own verifyChecks()/consumeNonce()/
 * verify() split for the same reason: nonce consumption is the only
 * side-effecting check, and must run last, only once every other
 * check has independently passed.
 */
export interface PolicyChangeStepUpPayloadVerificationResult {
  readonly valid: boolean;

  readonly checks: {
    readonly versionSupported: boolean;
    readonly signatureVerified: boolean;
    readonly notExpired: boolean;
    readonly pendingPolicyChangeIdMatches: boolean;
    readonly actionMatches: boolean;
  };
}

/**
 * Verifies a PolicyChangeStepUpAuthorization's signature, expiry, and
 * binding to the specific action it is being presented for. Runs
 * server-side, in pending-policy-changes.ts's approve/reject handlers
 * via PolicyChangeStepUpVerifier. Mirrors AuthorizationVerifier's own
 * no-early-return-between-independent-checks discipline (no timing
 * oracle on any one field).
 */
export class PolicyChangeStepUpAuthorizationVerifier {
  private readonly verifier = new SignatureVerifier(
    ED25519_ONLY_CRYPTO_PROVIDER,
  );

  async verify(
    authorization: PolicyChangeStepUpAuthorization,
    publicKey: KeyObject,
    expected: {
      readonly pendingPolicyChangeId: string;
      readonly action: "approve" | "reject";
    },
    now: Date = new Date(),
  ): Promise<PolicyChangeStepUpPayloadVerificationResult> {
    const versionSupported =
      authorization.payload.version === SUPPORTED_PAYLOAD_VERSION;

    if (!versionSupported) {
      return {
        valid: false,
        checks: {
          versionSupported: false,
          signatureVerified: false,
          notExpired: false,
          pendingPolicyChangeIdMatches: false,
          actionMatches: false,
        },
      };
    }

    const signatureVerified = await this.verifier.verify(
      authorization.payload,
      authorization.signature,
      publicKey,
    );

    const expiry = Date.parse(authorization.payload.expiresAt);
    const notExpired = Number.isFinite(expiry) && now.getTime() < expiry;

    // An envelope signed for a future window must not be usable now. The
    // skew allowance covers clock drift between the issuer and this check.
    const issued = Date.parse(authorization.payload.authorizedAt);
    const notFromTheFuture =
      Number.isFinite(issued) &&
      issued <= now.getTime() + STEP_UP_CLOCK_SKEW_MS;

    const pendingPolicyChangeIdMatches =
      authorization.payload.pendingPolicyChangeId ===
      expected.pendingPolicyChangeId;

    const actionMatches = authorization.payload.action === expected.action;

    return {
      valid:
        signatureVerified &&
        notExpired &&
        notFromTheFuture &&
        pendingPolicyChangeIdMatches &&
        actionMatches,

      checks: {
        versionSupported,
        signatureVerified,
        notExpired,
        pendingPolicyChangeIdMatches,
        actionMatches,
      },
    };
  }
}
