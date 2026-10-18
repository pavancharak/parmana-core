import { connectorCapabilities, type Connector } from "@parmana/connector-sdk";
import { PAYTM_REFUND_CAPABILITY } from "@parmana/connector-paytm";
import { createGatewayPaytmConnector } from "@parmana/execution-gateway";

/**
 * Test-only fallback so createConnectorRegistry.ts can always register a
 * "paytm" connector under NODE_ENV=test (mirroring HubSpot/GitHub's
 * always-registered test behavior), even for the overwhelming majority
 * of tests that never touch paytm:refund and therefore never override
 * PAYTM_CONNECTOR_URL. Never dialed unless a test both sets
 * PAYTM_CONNECTOR_URL itself (pointing at a MockPaytmConnectorServer) or
 * actually exercises paytm:refund against this placeholder — in which
 * case the connection simply fails closed, exactly as a misconfigured
 * endpoint should.
 */
const TEST_MODE_DEFAULT_BASE_URL = "http://127.0.0.1:4399";

/**
 * Creates the Paytm connector.
 *
 * Unlike createHubSpotConnector.ts/createGitHubConnector.ts, baseUrl has
 * no real-vendor default to fall back to — this connector never calls
 * Paytm's own API, only the trusted, out-of-process Paytm connector
 * service named by PAYTM_CONNECTOR_URL. createConnectorRegistry.ts only
 * calls this function after createPaytmCredentialProvider() has already
 * resolved (non-undefined), which — outside NODE_ENV=test —
 * assertPaytmConnectorConfigured.ts already guarantees means
 * PAYTM_CONNECTOR_URL is set and uses HTTPS; the throw below is
 * therefore a defensive invariant check, not an expected production
 * path.
 */
export function createPaytmConnector(): Connector {
  const baseUrl =
    process.env.PAYTM_CONNECTOR_URL ??
    (process.env.NODE_ENV === "test" ? TEST_MODE_DEFAULT_BASE_URL : undefined);

  if (baseUrl === undefined) {
    throw new Error(
      "createPaytmConnector() was called with PAYTM_CONNECTOR_URL unset outside NODE_ENV=test. " +
        "This should be unreachable: createConnectorRegistry.ts only calls this after resolving a " +
        "Paytm credential provider, and assertPaytmConnectorConfigured.ts already refuses to start " +
        "the process with PAYTM_CONNECTOR_SHARED_SECRET set but PAYTM_CONNECTOR_URL unset.",
    );
  }

  return createGatewayPaytmConnector({
    connectorId: "paytm",
    capabilities: connectorCapabilities([PAYTM_REFUND_CAPABILITY]),
    baseUrl,
  });
}
