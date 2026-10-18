import { HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN } from "@parmana/connector-hubspot";
import {
  StaticCredentialProvider,
  brandCredentialHandle,
  type CredentialHandle,
  type CredentialProvider,
} from "@parmana/connector-sdk";

import { SecretsProviderBootstrap } from "./secrets/SecretsProviderBootstrap.js";

const HUBSPOT_CONNECTOR_ID = "hubspot";

/**
 * Resolves HubSpot's credential: a single Private App token, unlike
 * Razorpay's key_id/key_secret pair — EnvironmentCredentialProvider's
 * existing one-environment-variable-per-connector mapping actually fits
 * this shape ({ token }), but a small dedicated provider is used anyway
 * so the resolved value's field name (privateAppToken) matches
 * HubSpotConnector's own HubSpotCredentialValue shape exactly, and so
 * error messages can name HUBSPOT_PRIVATE_APP_TOKEN specifically.
 *
 * HUBSPOT_PRIVATE_APP_TOKEN's presence is still what decides whether
 * this connector is registered at all (unchanged, synchronous). Its
 * *value* is resolved through SecretsProvider (ADR-0009) only inside
 * resolve(): in the default "env" mode that's an identity pass-through
 * (the value already is the token, same as before this existed); in
 * "aws-secrets-manager" mode, the env var instead holds the Secrets
 * Manager secret name/ARN to fetch the real token from. Never logged,
 * never embedded in a thrown error (only the variable name
 * HUBSPOT_PRIVATE_APP_TOKEN ever appears in messages).
 */
class HubSpotEnvironmentCredentialProvider implements CredentialProvider {
  readonly providerId = "environment";

  async resolve(connectorId: string): Promise<CredentialHandle> {
    if (connectorId !== HUBSPOT_CONNECTOR_ID) {
      throw new Error(
        `HubSpotEnvironmentCredentialProvider cannot resolve credentials for connector "${connectorId}".`,
      );
    }

    const reference = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

    if (reference === undefined) {
      throw new Error(
        `Environment variable HUBSPOT_PRIVATE_APP_TOKEN for connector "${HUBSPOT_CONNECTOR_ID}" is not set.`,
      );
    }

    const secrets = await SecretsProviderBootstrap.create();
    const privateAppToken = await secrets.getSecret(reference);

    return brandCredentialHandle({
      providerId: this.providerId,
      credentialId: "HUBSPOT_PRIVATE_APP_TOKEN",
      value: Object.freeze({ privateAppToken }),
    });
  }
}

/**
 * Creates the HubSpot credential provider, or undefined when the
 * hubspot capability should not be registered at all.
 *
 * Test (NODE_ENV=test): a static privateAppToken, overridable via
 * TEST_HUBSPOT_PRIVATE_APP_TOKEN — read directly, with no intermediate
 * bridge variable. This is a deliberate lesson learned from the Razorpay
 * connector's own history (docs/CLAIMS.md 3.4): its NODE_ENV=test branch
 * originally read a word-order-swapped bridge variable
 * (TEST_RAZORPAY_KEY_ID/SECRET instead of the documented
 * RAZORPAY_TEST_KEY_ID/SECRET), which depended entirely on call sites
 * remembering to copy one into the other and was fixed only after the
 * fact. HubSpotCredentialProvider reads TEST_HUBSPOT_PRIVATE_APP_TOKEN —
 * the exact name documented in .env.example — from its very first
 * version, with no bridge to get wrong.
 *
 * Production: HUBSPOT_PRIVATE_APP_TOKEN. If unset, this returns
 * undefined rather than a partially-configured provider or a fallback to
 * mock credentials. createConnectorRegistry.ts does not register the
 * HubSpot connector at all in that case, so hubspot:deal-fetch /
 * hubspot:deal-update simply have no connector to resolve to
 * (ConnectorSdkRegistry.resolveCapability's existing "No connector
 * registered for capability" fail-closed error) — rather than a startup
 * crash that would also take down every other, unrelated capability this
 * process serves.
 */
export function createHubSpotCredentialProvider():
  CredentialProvider | undefined {
  if (process.env.NODE_ENV === "test") {
    return new StaticCredentialProvider({
      [HUBSPOT_CONNECTOR_ID]: {
        privateAppToken:
          process.env.TEST_HUBSPOT_PRIVATE_APP_TOKEN ??
          HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
      },
    });
  }

  if (process.env.HUBSPOT_PRIVATE_APP_TOKEN === undefined) {
    return undefined;
  }

  return new HubSpotEnvironmentCredentialProvider();
}
