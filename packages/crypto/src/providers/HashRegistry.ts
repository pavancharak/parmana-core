import type { HashAlgorithm } from "@parmana/shared";

import type { HashProvider } from "./HashProvider.js";

/**
 * Registry of hash providers.
 */
export class HashRegistry {
  private readonly providers = new Map<HashAlgorithm, HashProvider>();

  register(provider: HashProvider): this {
    this.providers.set(provider.algorithm, provider);

    return this;
  }

  get(algorithm: HashAlgorithm): HashProvider {
    const provider = this.providers.get(algorithm);

    if (!provider) {
      throw new Error(`Unknown hash provider: ${algorithm}`);
    }

    return provider;
  }
}
