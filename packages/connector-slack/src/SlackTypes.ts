/**
 * Slack domain types.
 *
 * Scoped narrowly to one action: posting a message via
 * `chat.postMessage` (https://api.slack.com/methods/chat.postMessage).
 * Anything Slack's API returns beyond the fields this connector reads
 * (ok, ts, channel, error) is neither modeled nor touched.
 */

import { createHash } from "node:crypto";

/**
 * Deny-by-default: the only parameters this connector will ever place
 * in a chat.postMessage request body. Any other key present in a
 * request's parameters is refused before any network call -- see
 * GatewaySlackAdapter.postMessage.
 */
export const SLACK_ALLOWED_POST_MESSAGE_PARAMETERS = Object.freeze([
  "channel",
  "text",
] as const);

export type SlackAllowedPostMessageParameter =
  (typeof SLACK_ALLOWED_POST_MESSAGE_PARAMETERS)[number];

/**
 * The built-in test-mode placeholder credential (createSlackCredential
 * Provider.ts's fallback when no real test-mode credential is
 * configured). Exported here, shared by both that fallback and
 * GatewaySlackAdapter's own fail-closed guard against sending it to a
 * real endpoint, so the two sides can never drift apart into comparing
 * different literals.
 *
 * Deliberately NOT shaped like a real Slack bot token (no "xoxb-"
 * prefix) -- an earlier version of this constant used that prefix with
 * an all-zero suffix, which is exactly the pattern GitHub's secret
 * scanner flags as a possible real credential on push, even though it
 * can never be one. A plain, obviously-fake string (mirrors HubSpot's
 * own HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN, "hubspot-test-mode-placeholder"
 * -- also not shaped like a real token) avoids that false positive
 * entirely while still serving the same purpose: never rely on Slack
 * happening to reject a bad credential; that is an accident of its
 * behavior, not a guarantee this codebase controls.
 */
export const SLACK_TEST_MODE_PLACEHOLDER_TOKEN = "slack-test-mode-placeholder";

export interface SlackCredentialValue {
  readonly botToken: string;
}

export function isSlackCredentialValue(
  value: unknown,
): value is SlackCredentialValue {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.botToken === "string" && candidate.botToken.length > 0
  );
}

/**
 * Slack's real chat.postMessage response envelope: unlike HubSpot/Paytm,
 * Slack always answers with HTTP 200 -- errors are signaled only by
 * `ok: false` plus a machine-readable `error` string in the JSON body,
 * never by the HTTP status code. A connector that only checked
 * `response.ok` (the HTTP-level flag) would treat every Slack-side
 * failure -- an invalid channel, a revoked token, a rate limit -- as a
 * silent success. See GatewaySlackAdapter.postMessage for where this is
 * actually checked.
 */
export interface SlackPostMessageResponse {
  readonly ok: boolean;
  readonly channel?: string;
  readonly ts?: string;
  readonly error?: string;
}

export function isSlackPostMessageResponse(
  value: unknown,
): value is SlackPostMessageResponse {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Record<string, unknown>).ok === "boolean";
}

/**
 * One-way fingerprint of a Slack bot token, safe to place in receipts
 * and caller-visible execution evidence: a truncated SHA-256 digest,
 * never a literal substring of the token. For Slack the bearer token
 * *is* the entire credential, so a literal prefix would leak genuine
 * credential bytes; a fingerprint lets an operator confirm "the same
 * token was used across these executions" without any credential byte
 * ever reaching a caller-facing surface.
 */
export function redactSlackToken(token: string): string {
  return `fp_${createHash("sha256").update(token).digest("hex").slice(0, 12)}`;
}
