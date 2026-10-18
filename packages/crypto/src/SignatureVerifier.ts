import { type KeyObject } from "node:crypto";

import { CanonicalSerializer } from "./CanonicalSerializer.js";

import type { CryptoProvider } from "./providers/CryptoProvider.js";

/**
 * Signature Verifier.
 *
 * Verifies signatures for canonical Parmana
 * artifacts using the configured
 * SignatureProvider.
 */
export class SignatureVerifier {
  constructor(
    private readonly crypto: CryptoProvider,

    private readonly serializer = new CanonicalSerializer(),
  ) {}

  /**
   * Verifies a canonical artifact.
   */
  async verify(
    artifact: unknown,
    signature: string,
    publicKey: KeyObject,
  ): Promise<boolean> {
    const bytes = this.serializer.serialize(artifact);

    const verified = await this.crypto.signature.verify(
      bytes,
      signature,
      publicKey,
    );

    return verified;
  }
}
