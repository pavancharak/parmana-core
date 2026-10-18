import { generateKeyPairSync } from "node:crypto";

import {
  brandCredentialHandle,
  type CredentialHandle,
  type CredentialProvider,
} from "@parmana/connector-sdk";
import { createGatewayGitHubCredentialProvider } from "@parmana/execution-gateway";
import { readConnectorBaseUrl } from "./readConnectorBaseUrl.js";

const GITHUB_CONNECTOR_ID = "github";

// Arbitrary, well-formed-looking placeholders -- never checked against
// GitHub's real API. Only ever used together with a freshly generated
// (and therefore never-real) private key, against a mock server that (like
// MockGitHubServer) does not verify the App JWT's signature.
const GITHUB_TEST_MODE_APP_ID = "1";
const GITHUB_TEST_MODE_INSTALLATION_ID = "1";

/**
 * Resolves GitHub's credential via Vercel Connect (ADR-0009) instead
 * of holding the GitHub App's private key at all: Vercel Connect owns
 * the App registration and mints installation access tokens on
 * demand, so GITHUB_APP_ID/GITHUB_INSTALLATION_ID/GITHUB_APP_PRIVATE_KEY
 * are never provisioned anywhere in this process's environment for a
 * deployment that uses this path -- eliminated, not merely relocated.
 *
 * `@vercel/connect` is an optional peer dependency, dynamically
 * imported so a deployment that doesn't set
 * PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID (and hasn't installed it)
 * is unaffected -- this class is only ever constructed when that env
 * var is present (see createGitHubCredentialProvider() below).
 */
class VercelConnectGitHubCredentialProvider implements CredentialProvider {
  readonly providerId = "vercel-connect";

  constructor(private readonly connectorId: string) {}

  async resolve(connectorId: string): Promise<CredentialHandle> {
    if (connectorId !== GITHUB_CONNECTOR_ID) {
      throw new Error(
        `VercelConnectGitHubCredentialProvider cannot resolve credentials for connector "${connectorId}".`,
      );
    }

    const { getToken } = await import("@vercel/connect");

    const installationToken = await getToken(this.connectorId, {
      subject: { type: "app" },
    });

    return brandCredentialHandle({
      providerId: this.providerId,
      credentialId: this.connectorId,
      value: Object.freeze({ installationToken }),
    });
  }
}

/**
 * Creates the GitHub App credential provider, or undefined when the
 * github capability should not be registered at all.
 *
 * GitHub's credential is ephemeral (docs/CLAIMS.md Claim 1): every
 * resolve() call performs a real JWT-signed network exchange for a
 * short-lived installation token, unlike HubSpot's single static token
 * (see createHubSpotCredentialProvider.ts). "Test mode" therefore cannot
 * be a fixed value the way HubSpot's is -- it still needs a working
 * (appId, installationId, privateKey) triple to sign a JWT and exchange
 * it, just never the real one, and never a real call to GitHub's actual
 * API.
 *
 * Test (NODE_ENV=test):
 *  - TEST_GITHUB_APP_ID / TEST_GITHUB_INSTALLATION_ID /
 *    TEST_GITHUB_APP_PRIVATE_KEY, when all three are set, are used
 *    as-is -- this is what the live-gated GitHub suite sets, mirroring
 *    TEST_HUBSPOT_PRIVATE_APP_TOKEN's role for HubSpot's live suite, so a
 *    real installation token can be minted against GitHub's real API.
 *  - Otherwise, a freshly generated RSA keypair paired with harmless
 *    placeholder ids, matched to GITHUB_BASE_URL (the hermetic test
 *    seam -- see createGitHubConnector.ts). This never depends on
 *    whatever GITHUB_APP_ID/GITHUB_INSTALLATION_ID/GITHUB_APP_PRIVATE_KEY
 *    happen to be set to in the ambient environment, the same isolation
 *    HubSpot's hermetic suite gets by overriding
 *    TEST_HUBSPOT_PRIVATE_APP_TOKEN rather than trusting whatever is
 *    ambiently present.
 *
 * Production, preferred (ADR-0009): PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID
 * set -- resolves via Vercel Connect (VercelConnectGitHubCredentialProvider
 * above), and GITHUB_APP_ID/GITHUB_INSTALLATION_ID/GITHUB_APP_PRIVATE_KEY
 * are never read at all.
 *
 * Production, fallback: GITHUB_APP_ID, GITHUB_INSTALLATION_ID,
 * GITHUB_APP_PRIVATE_KEY. If any is unset, this returns undefined rather
 * than a partially-configured provider -- createConnectorRegistry.ts does
 * not register the GitHub connector at all in that case. Mirrors
 * createHubSpotCredentialProvider.ts's test/production split exactly.
 * Kept, not removed, for a deployment that doesn't use Vercel Connect.
 */
export function createGitHubCredentialProvider():
  CredentialProvider | undefined {
  const baseUrl = readConnectorBaseUrl("GITHUB_BASE_URL");

  if (process.env.NODE_ENV === "test") {
    const testAppId = process.env.TEST_GITHUB_APP_ID;
    const testInstallationId = process.env.TEST_GITHUB_INSTALLATION_ID;
    const testPrivateKey = process.env.TEST_GITHUB_APP_PRIVATE_KEY;

    if (
      testAppId !== undefined &&
      testInstallationId !== undefined &&
      testPrivateKey !== undefined
    ) {
      return createGatewayGitHubCredentialProvider({
        appId: testAppId,
        installationId: testInstallationId,
        privateKey: testPrivateKey,
        ...(baseUrl !== undefined ? { baseUrl } : {}),
      });
    }

    const { privateKey: generatedKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    return createGatewayGitHubCredentialProvider({
      appId: GITHUB_TEST_MODE_APP_ID,
      installationId: GITHUB_TEST_MODE_INSTALLATION_ID,
      privateKey: generatedKey,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
    });
  }

  const vercelConnectConnectorId =
    process.env.PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID;

  if (vercelConnectConnectorId !== undefined) {
    return new VercelConnectGitHubCredentialProvider(vercelConnectConnectorId);
  }

  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (
    appId === undefined ||
    installationId === undefined ||
    privateKey === undefined
  ) {
    return undefined;
  }

  return createGatewayGitHubCredentialProvider({
    appId,
    installationId,
    privateKey,
  });
}
