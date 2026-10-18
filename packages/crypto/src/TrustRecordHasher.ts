import { CanonicalSerializer } from "./CanonicalSerializer.js";

import type { CryptoProvider } from "./providers/CryptoProvider.js";

/**
 * Trust Record Hasher.
 *
 * Produces a deterministic cryptographic hash
 * for immutable trust artifacts.
 */
export class TrustRecordHasher {
  constructor(
    private readonly crypto: CryptoProvider,

    private readonly serializer = new CanonicalSerializer(),
  ) {}

  /**
   * Hashes an immutable object.
   */
  async hash(value: unknown): Promise<string> {
    const bytes = this.serializer.serialize(value);

    return this.crypto.hash.hash(bytes);
  }
}
