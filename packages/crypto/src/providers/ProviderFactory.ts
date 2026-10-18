import type { CryptoProvider } from "./CryptoProvider.js";

import { CryptoBootstrap } from "../CryptoBootstrap.js";

/**
 * Provider Factory.
 *
 * Compatibility wrapper around the
 * canonical CryptoBootstrap.
 */
export class ProviderFactory {
  static create(): CryptoProvider {
    return CryptoBootstrap.create();
  }
}
