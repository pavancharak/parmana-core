import type { SecretsProvider } from "./SecretsProvider.js";

/**
 * Default SecretsProvider: identity pass-through. In "env" mode
 * (PARMANA_SECRETS_PROVIDER unset or "env"), a connector's own env var
 * already holds the real secret value -- there is no separate
 * reference to resolve, so this simply returns whatever it was given.
 * Preserves every existing connector credential provider's behavior
 * unchanged.
 */
export class EnvSecretsProvider implements SecretsProvider {
  async getSecret(reference: string): Promise<string> {
    return reference;
  }
}
