const DEFAULT_MAX_TOKEN_AGE_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * HubSpot's Private App token (HUBSPOT_PRIVATE_APP_TOKEN) is a
 * long-lived static credential with no built-in expiry, unlike the
 * GitHub connector's ephemeral per-execution installation token
 * (createGitHubCredentialProvider.ts). Nothing in this codebase enforces
 * or reminds an operator to rotate it -- this closes that operational
 * gap with a reminder, not enforcement (this process has no way to
 * revoke or replace a HubSpot-side token itself; only a human with
 * HubSpot admin access can rotate it).
 *
 * HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT (an ISO 8601 date, operator-set
 * whenever the token is actually rotated) is compared against "now" at
 * startup:
 *
 * - Unset entirely: warns once that no rotation date is on record, so
 *   staleness can't be tracked at all yet.
 * - Set, and older than maxAgeDays (default 90): warns with the
 *   token's age.
 * - Set and recent: silent.
 *
 * Called once at startup (createConnectorRegistry.ts), not per-request
 * -- rotation cadence is an operational concern checked at process
 * start, not a per-execution control.
 */
export function warnIfHubSpotTokenStale(
  now: Date = new Date(),
  maxAgeDays: number = DEFAULT_MAX_TOKEN_AGE_DAYS,
): void {
  if (process.env.HUBSPOT_PRIVATE_APP_TOKEN === undefined) {
    return;
  }

  const rotatedAt = process.env.HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT;

  if (rotatedAt === undefined) {
    console.warn({
      event: "hubspot_token_rotation_date_unknown",
      reason:
        "HUBSPOT_PRIVATE_APP_TOKEN is configured but HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT is " +
        "not set, so this token's age cannot be tracked. Set it to the date this token was " +
        "last rotated (ISO 8601, e.g. 2026-09-10) so staleness can be detected going forward.",
    });
    return;
  }

  const rotatedAtMs = Date.parse(rotatedAt);

  if (Number.isNaN(rotatedAtMs)) {
    console.warn({
      event: "hubspot_token_rotation_date_invalid",
      value: rotatedAt,
      reason:
        "HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT is not a parseable date (expected ISO 8601).",
    });
    return;
  }

  const ageDays = Math.floor((now.getTime() - rotatedAtMs) / MS_PER_DAY);

  if (ageDays > maxAgeDays) {
    console.warn({
      event: "hubspot_token_stale",
      ageDays,
      maxAgeDays,
      reason:
        `HUBSPOT_PRIVATE_APP_TOKEN was last rotated ${ageDays} days ago, past the ` +
        `${maxAgeDays}-day recommended cadence. Rotate it in HubSpot's app settings and update ` +
        "HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT.",
    });
  }
}
