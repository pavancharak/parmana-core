import { loadConfig } from "@parmana/shared";

import { writeKeyMaterialJson } from "./assertSigningKeyMaterialConfigured.js";
import { SecretsProviderBootstrap } from "./secrets/SecretsProviderBootstrap.js";
import type { SecretsProvider } from "./secrets/SecretsProvider.js";

/**
 * Loads signing key material from a Secrets Manager secret at startup, so the
 * private keys never sit in an environment variable.
 *
 * PARMANA_KEY_MATERIAL_SECRET holds a reference (a secret name or ARN), not a
 * key. The secret's value has the same JSON shape as PARMANA_KEY_MATERIAL_JSON.
 * The server authenticates to Secrets Manager with its platform identity (on
 * Vercel, the OIDC role via AWS_ROLE_ARN), so no long-lived credential is needed
 * in the environment.
 *
 * Must run before assertSigningKeyMaterialConfigured(), which checks the key
 * files this writes. When PARMANA_KEY_MATERIAL_SECRET is unset, does nothing.
 *
 * `provider` is injectable for tests; production passes nothing.
 */
export async function loadKeyMaterialFromSecretsManager(
  keyDirectory: string,
  provider?: SecretsProvider,
): Promise<void> {
  const reference = process.env.PARMANA_KEY_MATERIAL_SECRET;
  if (reference === undefined || reference.trim() === "") return;

  const secrets = loadConfig().secrets.provider;
  if (provider === undefined && secrets !== "aws-secrets-manager") {
    throw new Error(
      "PARMANA_KEY_MATERIAL_SECRET is set, but PARMANA_SECRETS_PROVIDER is not " +
        "aws-secrets-manager. Set it, so the reference is fetched from Secrets Manager " +
        "and not treated as the key material itself.",
    );
  }

  const source = provider ?? (await SecretsProviderBootstrap.create());
  const value = await source.getSecret(reference.trim());

  writeKeyMaterialJson(
    value,
    keyDirectory,
    "the PARMANA_KEY_MATERIAL_SECRET secret",
  );
}
