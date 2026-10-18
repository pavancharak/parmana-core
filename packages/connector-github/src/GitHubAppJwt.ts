import { createSign, type KeyObject } from "node:crypto";

/**
 * Minimal RS256 JWT construction for GitHub App authentication
 * (https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app).
 *
 * Deliberately no JWT library dependency — this is three fields, one
 * signature, and two base64url encodes. Matches this codebase's existing
 * preference for native node:crypto over pulling in a dependency for a
 * security-sensitive primitive (see Dilithium3SignatureProvider,
 * Ed25519SignatureProvider).
 */

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

export interface GitHubAppJwtOptions {
  readonly appId: string;
  readonly privateKey: string | KeyObject;
  /** Injectable for deterministic tests. Defaults to the real clock. */
  readonly now?: () => Date;
}

/**
 * Signs a GitHub App JWT. `iat` is backdated by 60 seconds (GitHub's own
 * documented recommendation) to tolerate clock drift between this process
 * and GitHub's servers; `exp` is capped at the maximum GitHub accepts
 * (10 minutes). This JWT authenticates as the App itself — it is never
 * sent to GitHub's REST API directly, only exchanged, once, for a
 * short-lived installation access token (see GitHubAppCredentialProvider).
 */
export function signGitHubAppJwt(options: GitHubAppJwtOptions): string {
  const now = options.now?.() ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSeconds - 60,
    exp: nowSeconds + 600,
    iss: options.appId,
  };

  const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(options.privateKey);

  return `${signingInput}.${base64url(signature)}`;
}
