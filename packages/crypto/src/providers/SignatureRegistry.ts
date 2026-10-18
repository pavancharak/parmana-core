import type { SignatureAlgorithm } from "@parmana/shared";

import type { SignatureProvider } from "./SignatureProvider.js";

/**
 * Registry of signature providers.
 */
export class SignatureRegistry {
  private readonly providers = new Map<SignatureAlgorithm, SignatureProvider>();

  register(provider: SignatureProvider): this {
    this.providers.set(provider.algorithm, provider);

    return this;
  }

  get(algorithm: SignatureAlgorithm): SignatureProvider {
    const provider = this.providers.get(algorithm);

    if (!provider) {
      throw new Error(`Unknown signature provider: ${algorithm}`);
    }

    return provider;
  }
}
