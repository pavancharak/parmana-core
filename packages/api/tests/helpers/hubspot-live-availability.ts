/**
 * Whether a real HubSpot test-mode Private App token is configured in
 * the environment.
 *
 * The live-gated HubSpot suite needs a real HubSpot developer/test
 * account to talk to and cannot run hermetically from a bare clone (see
 * packages/api/README.md for the env vars that enable it).
 */
export function hasHubSpotLiveConfig(): boolean {
  return Boolean(process.env.TEST_HUBSPOT_PRIVATE_APP_TOKEN);
}

/**
 * Resolves whether the live-gated HubSpot suite should run: a real
 * TEST_HUBSPOT_PRIVATE_APP_TOKEN being configured is not by itself
 * enough to run against HubSpot's real API. ALLOW_LIVE_HUBSPOT=1 must
 * also be set explicitly, or the suite skips cleanly rather than
 * silently making a real network call — a default `npm test` on a
 * machine with a test token configured stays green and side-effect-free.
 * Explicitly requesting a live run with ALLOW_LIVE_HUBSPOT=1 but no
 * visible token is a hard failure, not a skip: explicit intent must
 * never quietly degrade to a silent skip.
 *
 * Additionally fail-closed on doubt, specific to this connector: this
 * suite mutates a real HubSpot object (a deal's dealstage/amount), so
 * once a live run is confirmed, TEST_HUBSPOT_PRIVATE_APP_TOKEN must
 * start with "pat-" or the whole suite aborts hard, before any network
 * call is made — a malformed token must never quietly proceed.
 */
export function resolveHubSpotLiveGate(suiteLabel: string): boolean {
  const configured = hasHubSpotLiveConfig();
  const optedIn = process.env.ALLOW_LIVE_HUBSPOT === "1";

  if (configured && !optedIn) {
    console.log(
      `${suiteLabel}: HubSpot test-mode token configured but ALLOW_LIVE_HUBSPOT=1 not set — ` +
        "skipping live suite. Set ALLOW_LIVE_HUBSPOT=1 to run it.",
    );
    return false;
  }

  if (optedIn && !configured) {
    throw new Error(
      `${suiteLabel}: ALLOW_LIVE_HUBSPOT=1 is set — a live run was explicitly requested — but ` +
        "TEST_HUBSPOT_PRIVATE_APP_TOKEN is not visible to this worker. Refusing to silently skip " +
        "a suite that was explicitly asked to run live.",
    );
  }

  if (!configured) {
    console.log(
      `[SKIP] ${suiteLabel}: TEST_HUBSPOT_PRIVATE_APP_TOKEN not set. See packages/api/README.md to ` +
        "enable this suite.",
    );
    return false;
  }

  const token = process.env.TEST_HUBSPOT_PRIVATE_APP_TOKEN as string;

  if (!token.startsWith("pat-")) {
    throw new Error(
      `${suiteLabel}: TEST_HUBSPOT_PRIVATE_APP_TOKEN does not start with "pat-" — refusing to run ` +
        "this suite against what may be a malformed or non-HubSpot credential. Aborting before any " +
        "network call is made.",
    );
  }

  return true;
}

/**
 * Second gating tier, nested inside resolveHubSpotLiveGate's: even once a
 * live run is confirmed (ALLOW_LIVE_HUBSPOT=1 plus a pat--shaped token),
 * the mutating deal-update case additionally requires a real test deal
 * id to update (see packages/api/README.md — a free HubSpot
 * developer/test account's own UI is used to create one; there is no
 * generic "create a throwaway deal" API call this suite drives
 * headlessly without first deciding a pipeline/stage for it). Only call
 * this once the caller has already confirmed the base live gate is
 * active; it does not re-check ALLOW_LIVE_HUBSPOT or the token itself.
 *
 * Absence is a clean skip and never a failure: explicit intent must
 * never quietly degrade, but absence is not intent.
 */
export function resolveHubSpotTestDealGate(
  suiteLabel: string,
): string | undefined {
  const dealId = process.env.TEST_HUBSPOT_DEAL_ID;

  if (dealId === undefined) {
    console.log(
      `[SKIP] ${suiteLabel}: TEST_HUBSPOT_DEAL_ID not set — skipping the live deal-update case only; ` +
        "the other live HubSpot cases in this file still run. See packages/api/README.md to enable " +
        "this case.",
    );
    return undefined;
  }

  return dealId;
}
