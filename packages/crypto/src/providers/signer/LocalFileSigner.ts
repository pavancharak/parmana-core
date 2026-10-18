import type { KeyObject } from "node:crypto";

import type { KeyMetadata } from "../../KeyProvider.js";
import type { Signer } from "../../Signer.js";
import type { CryptoProvider } from "../CryptoProvider.js";
import { FileKeyProvider } from "../key/FileKeyProvider.js";

/**
 * Local File Signer.
 *
 * Signer backend over FileKeyProvider -- private key material lives
 * on local disk, exactly as every signing call site behaved before
 * ADR-0009. sign() reproduces today's "getPrivateKey() then
 * SignatureProvider.sign()" sequence byte-for-byte, so switching
 * KEY_PROVIDER away from "local" is the only thing that changes
 * behavior; this class exists so the 7+ call sites that used to do
 * that two-step themselves can instead depend on the Signer interface
 * uniformly, regardless of which concrete backend is configured.
 */
export class LocalFileSigner implements Signer {
  constructor(
    private readonly crypto: CryptoProvider,
    private readonly keys: FileKeyProvider = new FileKeyProvider(),
  ) {}

  async sign(keyId: string, data: Uint8Array): Promise<string> {
    const privateKey = await this.keys.getPrivateKey(keyId);

    return this.crypto.signature.sign(data, privateKey);
  }

  async getPublicKey(keyId: string): Promise<KeyObject> {
    return this.keys.getPublicKey(keyId);
  }

  async getMetadata(keyId: string): Promise<KeyMetadata> {
    return this.keys.getMetadata(keyId);
  }

  async hasKey(keyId: string): Promise<boolean> {
    return this.keys.hasKey(keyId);
  }

  async listKeys(): Promise<string[]> {
    return this.keys.listKeys();
  }
}
