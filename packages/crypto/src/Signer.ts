import type { KeyObject } from "node:crypto";

import type { KeyMetadata } from "./KeyProvider.js";

/**
 * Signer.
 *
 * Sibling to KeyProvider, for backends that can produce a signature
 * without ever releasing private key material (AWS KMS, HSM, Vault
 * Transit) -- KeyProvider.getPrivateKey() returning a KeyObject is
 * structurally impossible to implement honestly against such a
 * backend, since the whole point of those backends is that the
 * private key never leaves them. ADR-0009
 * (docs/adr/ADR-0009-KMS-Secrets-And-Connector-Signature-Hardening.md)
 * is the design this interface exists for.
 *
 * Read operations (getPublicKey/getMetadata/hasKey/listKeys) are
 * unchanged from KeyProvider -- verification never needed private key
 * material, so nothing about the verify path changes when a Signer
 * backend is swapped in.
 */
export interface Signer {
  /**
   * Signs already-canonicalized bytes and returns the signature in
   * the same base64 string format every existing SignatureProvider
   * implementation already produces (see Ed25519SignatureProvider.sign)
   * -- callers that verify with SignatureVerifier/SignatureProvider.verify()
   * need no changes regardless of which Signer produced the signature.
   */
  sign(keyId: string, data: Uint8Array): Promise<string>;

  /**
   * Returns the public key. Identical contract to KeyProvider.getPublicKey.
   */
  getPublicKey(keyId: string): Promise<KeyObject>;

  /**
   * Returns metadata for the specified key. Identical contract to
   * KeyProvider.getMetadata.
   */
  getMetadata(keyId: string): Promise<KeyMetadata>;

  /**
   * Returns true if the key exists. Identical contract to
   * KeyProvider.hasKey.
   */
  hasKey(keyId: string): Promise<boolean>;

  /**
   * Lists every keyId this signer can currently produce a public key
   * for. Identical contract to KeyProvider.listKeys.
   */
  listKeys?(): Promise<string[]>;
}
