/**
 * Fail-closed startup precondition for the Paytm connector's
 * configuration, run once, up front, before the port is ever bound
 * (see server.ts) — mirrors assertStorageConfigured.ts /
 * assertSigningKeyMaterialConfigured.ts's own "validate eagerly, not
 * lazily on first request" shape.
 *
 * The Paytm connector is optional in any given deployment (see
 * createConnectorRegistry.ts / createPaytmCredentialProvider.ts: no
 * configuration at all simply means the connector is not registered,
 * exactly like HubSpot/GitHub). What is NOT acceptable is *partial*
 * configuration — PAYTM_CONNECTOR_URL set without
 * PAYTM_CONNECTOR_SHARED_SECRET, or vice versa — which would either
 * silently register a connector with no way to authenticate itself to
 * the remote Paytm connector service, or leave a configured secret
 * pointing at nothing. Both are refused here, hard, at startup, rather
 * than surfacing later as a connector that "registered" but can never
 * actually execute a refund.
 */
export function assertPaytmConnectorConfigured(): void {
  if (process.env.NODE_ENV === "test") return;

  const url = process.env.PAYTM_CONNECTOR_URL;
  const secret = process.env.PAYTM_CONNECTOR_SHARED_SECRET;

  const urlSet = url !== undefined && url.trim() !== "";
  const secretSet = secret !== undefined && secret.trim() !== "";

  // Neither set: the Paytm connector is simply not configured for this
  // deployment. createConnectorRegistry.ts will not register it —
  // exactly the same fail-closed-absence shape every other optional
  // connector already uses.
  if (!urlSet && !secretSet) return;

  if (urlSet !== secretSet) {
    throw new Error(
      "Partial Paytm connector configuration detected: PAYTM_CONNECTOR_URL and " +
        "PAYTM_CONNECTOR_SHARED_SECRET must both be set, or both left unset. Currently " +
        `${urlSet ? "PAYTM_CONNECTOR_URL is set" : "PAYTM_CONNECTOR_URL is NOT set"} and ` +
        `${secretSet ? "PAYTM_CONNECTOR_SHARED_SECRET is set" : "PAYTM_CONNECTOR_SHARED_SECRET is NOT set"}. ` +
        "Refusing to start rather than silently register an unauthenticated or unreachable Paytm connector.",
    );
  }

  // Both set from here on.
  if (!(url as string).startsWith("https://")) {
    throw new Error(
      `PAYTM_CONNECTOR_URL must use HTTPS in production; received "${url}". Refusing to start with a ` +
        "plaintext connection configured to the trusted Paytm connector service.",
    );
  }

  const timeoutRaw = process.env.PAYTM_CONNECTOR_TIMEOUT_MS;
  if (timeoutRaw !== undefined && timeoutRaw.trim() !== "") {
    const timeoutMs = Number(timeoutRaw);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(
        `PAYTM_CONNECTOR_TIMEOUT_MS must be a positive number of milliseconds; received "${timeoutRaw}".`,
      );
    }
  }
}
