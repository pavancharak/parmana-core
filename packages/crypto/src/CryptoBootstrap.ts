import { loadConfig } from "@parmana/shared";
import type { SignatureAlgorithm } from "@parmana/shared";
import type { HybridCryptoProvider } from "./models/HybridCryptoProvider.js";
import type { CryptoProvider } from "./providers/CryptoProvider.js";

import { CryptoBuilder } from "./CryptoBuilder.js";

import { HashRegistry } from "./providers/HashRegistry.js";
import { SignatureRegistry } from "./providers/SignatureRegistry.js";

// Built-in Providers
import { SHA256HashProvider } from "./providers/hash/SHA256HashProvider.js";

import { Ed25519SignatureProvider } from "./providers/signature/Ed25519SignatureProvider.js";
import { Dilithium3SignatureProvider } from "./providers/signature/Dilithium3SignatureProvider.js";

/**
 * Crypto Bootstrap.
 *
 * Composition root for the Parmana crypto subsystem.
 */
export class CryptoBootstrap {
  private static provider: CryptoProvider | undefined;

  private static hybrid: HybridCryptoProvider | undefined;

  /**
   * Builds a CryptoProvider for a specific
   * signature algorithm.
   */
  private static buildProvider(
    signatureAlgorithm: SignatureAlgorithm,
  ): CryptoProvider {
    const config = loadConfig();

    const hashRegistry = new HashRegistry();

    const signatureRegistry = new SignatureRegistry();

    //
    // Register built-in hash providers.
    //
    hashRegistry.register(new SHA256HashProvider());

    //
    // Register built-in signature providers.
    //
    signatureRegistry.register(new Ed25519SignatureProvider());

    signatureRegistry.register(new Dilithium3SignatureProvider());

    return new CryptoBuilder()

      .withHash(hashRegistry.get(config.crypto.hashProvider))

      .withSignature(signatureRegistry.get(signatureAlgorithm))

      .build();
  }

  /**
   * Creates the configured CryptoProvider.
   */
  public static create(): CryptoProvider {
    if (this.provider) {
      return this.provider;
    }

    const config = loadConfig();

    this.provider = this.buildProvider(config.crypto.primarySignatureProvider);

    return this.provider;
  }

  /**
   * Creates both configured providers.
   *
   * Used for hybrid migration scenarios.
   */
  public static createHybrid(): HybridCryptoProvider {
    if (this.hybrid) {
      return this.hybrid;
    }

    const config = loadConfig();

    if (!config.crypto.secondarySignatureProvider) {
      throw new Error("Secondary signature provider is not configured.");
    }

    this.hybrid = {
      primary: this.buildProvider(config.crypto.primarySignatureProvider),

      secondary: this.buildProvider(config.crypto.secondarySignatureProvider),
    };

    return this.hybrid;
  }
}
