import { KeyProviders, loadConfig } from "@parmana/shared";

import type { KeyProvider } from "./KeyProvider.js";

import { FileKeyProvider } from "./providers/key/FileKeyProvider.js";

/**
 * Key Bootstrap.
 *
 * Composition root for key management.
 *
 * KEY_PROVIDER accepts "local", "aws-kms", "azure-key-vault",
 * "gcp-kms", and "hsm" (see packages/shared/src/config/KeyProviders.ts)
 * for forward-compatible configuration, but only FileKeyProvider
 * ("local") is actually implemented. Before this check existed, setting
 * KEY_PROVIDER=aws-kms (or any other non-local value) parsed and
 * validated cleanly, then silently constructed a FileKeyProvider anyway
 * — an operator who configured real KMS custody got private-key-on-disk
 * instead, with no error. Failing loudly here, at startup, turns that
 * silent misconfiguration into an immediate, actionable error instead
 * of a false sense of custody. Remove this check only once a real
 * provider class exists for the value being unblocked.
 */
export class KeyBootstrap {
  private static provider: KeyProvider;

  static create(): KeyProvider {
    if (!this.provider) {
      const configuredProvider = loadConfig().keys.provider;

      if (configuredProvider !== KeyProviders.LOCAL) {
        throw new Error(
          `KEY_PROVIDER=${configuredProvider} is not implemented. Only "${KeyProviders.LOCAL}" ` +
            "(FileKeyProvider, keys read from PARMANA_KEY_DIR on local disk) has a real " +
            "implementation today. Refusing to start with a configured key custody model " +
            "(aws-kms, azure-key-vault, gcp-kms, hsm) that would silently fall back to " +
            "file-based keys instead of the KMS/HSM custody the configuration requested.",
        );
      }

      this.provider = new FileKeyProvider();
    }

    return this.provider;
  }
}
