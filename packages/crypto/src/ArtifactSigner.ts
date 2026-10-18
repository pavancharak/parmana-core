import { type KeyObject } from "node:crypto";

import { CanonicalSerializer } from "./CanonicalSerializer.js";

import type { CryptoProvider } from "./providers/CryptoProvider.js";
import type { Signer } from "./Signer.js";

/**
 * Artifact Signer.
 */
export class ArtifactSigner {
  constructor(
    private readonly crypto: CryptoProvider,
    private readonly serializer = new CanonicalSerializer(),
  ) {}

  async sign(artifact: unknown, privateKey: KeyObject): Promise<string> {
    const bytes = this.serializer.serialize(artifact);

    const signature = await this.crypto.signature.sign(bytes, privateKey);

    return signature;
  }

  /**
   * Signs via a Signer (ADR-0009) instead of a raw private KeyObject
   * -- the path that works against a sign-without-release backend
   * (AWS KMS, HSM) as well as LocalFileSigner. Produces the exact same
   * base64 signature format as sign() above; callers verify identically
   * regardless of which method produced the signature.
   */
  async signWithSigner(
    artifact: unknown,
    keyId: string,
    signer: Signer,
  ): Promise<string> {
    const bytes = this.serializer.serialize(artifact);

    return signer.sign(keyId, bytes);
  }
}
