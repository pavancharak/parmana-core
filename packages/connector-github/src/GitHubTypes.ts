/**
 * GitHub domain types.
 *
 * Scoped narrowly, following @parmana/connector-hubspot's own precedent:
 * pull request fetch (read, used to learn CI/review status for policy
 * evaluation) and pull request merge (the guarded execution). Shapes
 * follow GitHub's REST API v3 pulls/checks resources
 * (https://docs.github.com/en/rest/pulls/pulls) for exactly the fields
 * this connector reads or writes. Anything else GitHub returns is
 * neither modeled nor touched.
 */

import { createHash } from "node:crypto";

export interface GitHubPullRequestState {
  readonly number: number;
  readonly mergeable: boolean | null;
  readonly mergedAt: string | null;
  readonly headSha: string;
  readonly baseRef: string;
}

/**
 * Merge methods GitHub's own merge endpoint accepts. Deny-by-default,
 * same discipline as HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES: a request
 * naming any value outside this set is refused before any network call.
 */
export const GITHUB_ALLOWED_MERGE_METHODS = Object.freeze([
  "merge",
  "squash",
  "rebase",
] as const);

export type GitHubAllowedMergeMethod =
  (typeof GITHUB_ALLOWED_MERGE_METHODS)[number];

/**
 * The credential value a GitHubAppCredentialProvider resolves: a
 * short-lived (~1 hour) GitHub App installation access token, minted
 * fresh per CredentialProvider.resolve() call — never the App's private
 * key itself, which never leaves GitHubAppCredentialProvider.
 */
export interface GitHubCredentialValue {
  readonly installationToken: string;
}

export function isGitHubCredentialValue(
  value: unknown,
): value is GitHubCredentialValue {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.installationToken === "string" &&
    candidate.installationToken.length > 0
  );
}

/**
 * Built-in test-mode placeholder credential, mirroring
 * HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN's own precedent and rationale
 * (docs/CLAIMS.md 3.4/3.10): shaped like a real GitHub App installation
 * token ("ghs_" prefix) but a value GitHub will never issue, so it can
 * never collide with a real token by accident, and exported here so both
 * a future createGitHubCredentialProvider.ts fallback and this
 * connector's own fail-closed guard against sending it to the real API
 * compare the same literal.
 */
export const GITHUB_TEST_MODE_PLACEHOLDER_TOKEN =
  "ghs_test_mode_placeholder_0000000000000000";

/**
 * One-way fingerprint of a GitHub installation token, safe to place in
 * receipts and caller-visible execution evidence — same rationale as
 * redactHubSpotToken (Phase 3D certification, Property A): a truncated
 * SHA-256 digest, never a literal substring of the token.
 */
export function redactGitHubToken(token: string): string {
  return `fp_${createHash("sha256").update(token).digest("hex").slice(0, 12)}`;
}
