import type { KeyPair } from "./KeyPair.js";

/**
 * Abstract key storage interface.
 *
 * KeyStore is responsible for persisting and retrieving cryptographic
 * key pairs. Implementations may be in-memory, file-based, or external
 * secure vaults (HSM, KMS, etc.).
 */
export interface KeyStore {
  /**
   * Stores a key pair under a given identifier.
   *
   * @param id Unique key identifier.
   * @param keyPair Cryptographic key pair.
   */
  set(id: string, keyPair: KeyPair): Promise<void>;

  /**
   * Retrieves a key pair by identifier.
   *
   * @param id Key identifier.
   * @returns Key pair or null if not found.
   */
  get(id: string): Promise<KeyPair | null>;

  /**
   * Deletes a key pair by identifier.
   *
   * @param id Key identifier.
   */
  delete(id: string): Promise<void>;

  /**
   * Lists all stored key identifiers.
   */
  list(): Promise<string[]>;
}
