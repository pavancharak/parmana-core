import type { SignatureAlgorithm } from "../config/CryptoAlgorithms.js";

/**
 * Canonical cryptographic signature.
 *
 * Represents an immutable digital signature that can
 * be independently verified by any trusted verifier.
 */
export interface Signature {
  /**
   * Signature algorithm.
   */
  readonly algorithm: SignatureAlgorithm;

  /**
   * Identifier of the signing key.
   */
  readonly keyId: string;

  /**
   * Base64 encoded signature value.
   */
  readonly value: string;

  /**
   * UTC timestamp when the signature was created.
   */
  readonly signedAt: Date;
}
