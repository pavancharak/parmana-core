import type { KeyObject } from "node:crypto";

import type { SignedExecutionAuthorization } from "@parmana/shared";

import { SignatureVerifier } from "./SignatureVerifier.js";

import type { CryptoProvider } from "./providers/CryptoProvider.js";

/**
 * Payload format version this verifier accepts.
 * Fail-closed: any other value (including a
 * missing field) is rejected before signature
 * verification is attempted.
 */
const SUPPORTED_PAYLOAD_VERSION = 1;

/**
 * Result of verifying a
 * SignedExecutionAuthorization.
 *
 * versionSupported is checked first; when it
 * fails, signatureVerified and notExpired are
 * reported false without being evaluated, since a
 * payload of an unrecognized version cannot be
 * safely interpreted at all.
 */
export interface AuthorizationVerificationResult {
  readonly valid: boolean;

  readonly checks: {
    readonly versionSupported: boolean;
    readonly signatureVerified: boolean;
    readonly notExpired: boolean;
  };
}

/**
 * Authorization Verifier.
 *
 * Verifies a SignedExecutionAuthorization.
 * Delegates signature verification to
 * SignatureVerifier over the
 * CanonicalSerializer.
 *
 * NOTE: nonce single-use enforcement is the
 * responsibility of the receiving system's
 * nonce store (Session 3). This class verifies
 * signature and expiry only.
 */
export class AuthorizationVerifier {
  private readonly verifier: SignatureVerifier;

  constructor(private readonly crypto: CryptoProvider) {
    this.verifier = new SignatureVerifier(crypto);
  }

  /**
   * Verifies payload version, signature, and
   * expiry.
   *
   * The version check runs first and fails closed:
   * an unrecognized version is not signature/secret
   * dependent, so short-circuiting on it does not
   * introduce a timing oracle. Once version is
   * confirmed, signature and expiry both always run
   * — no early return between them, to avoid a
   * timing oracle on the expiry field.
   */
  async verify(
    authorization: SignedExecutionAuthorization,
    publicKey: KeyObject,
    now: Date = new Date(),
  ): Promise<AuthorizationVerificationResult> {
    const versionSupported =
      authorization.payload.version === SUPPORTED_PAYLOAD_VERSION;

    if (!versionSupported) {
      return {
        valid: false,

        checks: {
          versionSupported: false,
          signatureVerified: false,
          notExpired: false,
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

    return {
      valid: signatureVerified && notExpired,

      checks: {
        versionSupported,
        signatureVerified,
        notExpired,
      },
    };
  }
}
