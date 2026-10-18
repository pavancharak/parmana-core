import type { CryptoProvider } from "../providers/CryptoProvider.js";

/**
 * Two independent crypto providers used together.
 */
export interface HybridCryptoProvider {
  readonly primary: CryptoProvider;

  readonly secondary: CryptoProvider;
}
