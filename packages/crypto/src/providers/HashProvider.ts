import type { HashAlgorithm } from "@parmana/shared";

/**
 * Hash Provider.
 *
 * Abstraction for cryptographic hashing.
 */
export interface HashProvider {
  /**
   * Canonical algorithm identifier.
   */
  readonly algorithm: HashAlgorithm;

  /**
   * Computes a cryptographic hash.
   */
  hash(data: Uint8Array): Promise<string>;
}
