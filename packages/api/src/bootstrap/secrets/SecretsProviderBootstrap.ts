import { SecretsProviders, loadConfig } from "@parmana/shared";

import type { SecretsProvider } from "./SecretsProvider.js";
import { EnvSecretsProvider } from "./EnvSecretsProvider.js";
import { AwsSecretsManagerProvider } from "./AwsSecretsManagerProvider.js";

/**
 * Secrets Provider Bootstrap (ADR-0009).
 *
 * Composition root for SecretsProvider, selected by
 * PARMANA_SECRETS_PROVIDER.
 *
 * Deliberately NOT memoized: @parmana/crypto's SignerBootstrap
 * originally cached its result in a static field and that caused a
 * real CI failure (packages/api/tests/unit/supabase-caller-audit-sink.test.ts) --
 * a test that changed PARMANA_KEY_DIR between cases got a
 * permanently-poisoned signer still pointing at an already-deleted
 * temp directory from whichever test ran first. AwsSecretsManagerProvider
 * has the same shape of risk (it captures AWS_REGION/AWS_ROLE_ARN at
 * construction time), so this bootstrap is fixed proactively rather
 * than waiting for its own test to hit the identical bug. Constructing
 * either provider fresh per call is cheap -- no network call happens
 * until an actual getSecret() request, and AwsSecretsManagerProvider's
 * own per-secret value cache (1h TTL) is a separate, deliberate
 * feature unaffected by this.
 */
export class SecretsProviderBootstrap {
  static async create(): Promise<SecretsProvider> {
    const configuredProvider = loadConfig().secrets.provider;

    if (configuredProvider === SecretsProviders.ENV) {
      return new EnvSecretsProvider();
    }

    if (configuredProvider === SecretsProviders.AWS_SECRETS_MANAGER) {
      return AwsSecretsManagerProvider.create();
    }

    throw new Error(
      `PARMANA_SECRETS_PROVIDER=${configuredProvider} is not implemented.`,
    );
  }
}
