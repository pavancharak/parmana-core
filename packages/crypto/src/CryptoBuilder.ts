import type { CryptoProvider } from "./providers/CryptoProvider.js";

import type { HashProvider } from "./providers/HashProvider.js";

import type { SignatureProvider } from "./providers/SignatureProvider.js";

import { CryptoError } from "./errors/CryptoError.js";

/**
 * Builder for constructing a CryptoProvider.
 *
 * The builder is algorithm-agnostic.
 * Provider selection is handled elsewhere
 * (ProviderFactory / Registry).
 */
export class CryptoBuilder {
  private hashProvider?: HashProvider;

  private signatureProvider?: SignatureProvider;

  /**
   * Sets the hash provider.
   */
  withHash(provider: HashProvider): this {
    this.hashProvider = provider;

    return this;
  }

  /**
   * Sets the signature provider.
   */
  withSignature(provider: SignatureProvider): this {
    this.signatureProvider = provider;

    return this;
  }

  /**
   * Builds the CryptoProvider.
   */
  build(): CryptoProvider {
    if (!this.hashProvider) {
      throw new CryptoError("HashProvider has not been configured.");
    }

    if (!this.signatureProvider) {
      throw new CryptoError("SignatureProvider has not been configured.");
    }

    return {
      hash: this.hashProvider,

      signature: this.signatureProvider,
    };
  }
}
