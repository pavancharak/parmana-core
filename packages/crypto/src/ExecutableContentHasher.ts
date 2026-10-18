import { TrustRecordHasher } from "./TrustRecordHasher.js";

import type { CryptoProvider } from "./providers/CryptoProvider.js";

import type { ExecutableContent } from "@parmana/shared";

/**
 * Executable Content Hasher.
 *
 * Produces the canonical content hash bound into an
 * ExecutionAuthorizationPayload's businessTransactionHash field.
 *
 * Delegates to TrustRecordHasher so the signing side (this class)
 * and the verifying side (the execution gateway) run the identical
 * canonical serialization and hash algorithm — never two parallel
 * implementations of the same computation.
 */
export class ExecutableContentHasher {
  private readonly hasher: TrustRecordHasher;

  constructor(crypto: CryptoProvider) {
    this.hasher = new TrustRecordHasher(crypto);
  }

  /**
   * Hashes Executable Content.
   */
  hash(content: ExecutableContent): Promise<string> {
    return this.hasher.hash(content);
  }
}
