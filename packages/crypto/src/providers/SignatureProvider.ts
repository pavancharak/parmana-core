import type { KeyObject } from "node:crypto";

import type { SignatureAlgorithm } from "@parmana/shared";

/**
 * Signature Provider.
 *
 * Performs cryptographic signature operations.
 *
 * Key management is intentionally external to the
 * provider and is handled by a KeyProvider.
 */
export interface SignatureProvider {
  /**
   * Canonical signature algorithm.
   */
  readonly algorithm: SignatureAlgorithm;

  /**
   * Creates a signature using the supplied private key.
   */
  sign(data: Uint8Array, privateKey: KeyObject): Promise<string>;

  /**
   * Verifies a signature using the supplied public key.
   */
  verify(
    data: Uint8Array,
    signature: string,
    publicKey: KeyObject,
  ): Promise<boolean>;
}
