/**
 * HubSpot domain types.
 *
 * Scoped narrowly to this milestone: Deal objects, and only the two
 * properties this milestone touches (dealstage, amount). Shapes follow
 * HubSpot's CRM Objects API v3 response envelope
 * (https://developers.hubspot.com/docs/api/crm/deals) for exactly the
 * fields this connector reads or writes. Anything HubSpot returns beyond
 * that (associations, other properties, history) is neither modeled nor
 * touched.
 */

import { createHash } from "node:crypto";

/**
 * Deal properties this milestone is allowed to read or write. HubSpot's
 * API returns every property value as a string regardless of the
 * property's underlying type (amount included) — this type reflects the
 * wire shape, not a parsed domain type.
 */
export interface HubSpotDealProperties {
  readonly dealstage?: string;
  readonly amount?: string;
  readonly pipeline?: string;
}

export interface HubSpotDeal {
  readonly id: string;
  readonly properties: HubSpotDealProperties;
}

/**
 * Deny-by-default: the only Deal properties this milestone's connector
 * will ever read from a request or write to HubSpot. Any other property
 * name present in a request's parameters is refused before any network
 * call — see HubSpotConnector.updateDeal.
 */
export const HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES = Object.freeze([
  "dealstage",
  "amount",
] as const);

export type HubSpotAllowedDealUpdateProperty =
  (typeof HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES)[number];

/**
 * The built-in test-mode placeholder credential (createHubSpotCredential
 * Provider.ts's fallback when no real test-mode credential is
 * configured). Exported here, shared by both that fallback and
 * HubSpotConnector's own fail-closed guard against sending it to a real
 * endpoint, so the two sides can never drift apart into comparing
 * different literals. Shaped like a real HubSpot Private App token
 * ("pat-<hub-region>-<uuid>") but with an all-zero UUID that HubSpot
 * will never issue, so it can never collide with a real token by
 * accident.
 *
 * This guard exists because the Razorpay connector's very first version
 * did not have one: its built-in test-mode placeholder key_id could be
 * sent straight to Razorpay's real production API, and only survived
 * because Razorpay happened to reject it. That was an accident of
 * Razorpay's behavior, not a guarantee this codebase controlled — see
 * docs/CLAIMS.md 3.4's "defense-in-depth fix" paragraph. HubSpotConnector
 * closes the same gap from its first version instead of after an
 * incident.
 */
export const HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN =
  "hubspot-test-mode-placeholder";

export interface HubSpotCredentialValue {
  readonly privateAppToken: string;
}

export function isHubSpotCredentialValue(
  value: unknown,
): value is HubSpotCredentialValue {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.privateAppToken === "string" &&
    candidate.privateAppToken.length > 0
  );
}

/**
 * One-way fingerprint of a HubSpot Private App token, safe to place in
 * receipts and caller-visible execution evidence: a truncated SHA-256
 * digest, never a literal substring of the token. For HubSpot the bearer
 * token *is* the entire credential, so a literal prefix (the prior
 * implementation) would leak genuine credential bytes; a fingerprint lets
 * an operator confirm "the same token was used across these executions"
 * without any credential byte ever reaching a caller-facing surface
 * (Phase 3D certification, Property A finding).
 */
export function redactHubSpotToken(token: string): string {
  return `fp_${createHash("sha256").update(token).digest("hex").slice(0, 12)}`;
}
