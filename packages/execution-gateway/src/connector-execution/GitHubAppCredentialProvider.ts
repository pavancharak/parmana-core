import type { KeyObject } from "node:crypto";

import type {
  CredentialHandle,
  CredentialProvider,
} from "@parmana/connector-sdk";
import { brandCredentialHandle } from "@parmana/connector-sdk";
import { signGitHubAppJwt } from "@parmana/connector-github";

const DEFAULT_BASE_URL = "https://api.github.com";

export interface GitHubAppCredentialProviderOptions {
  readonly appId: string;
  readonly installationId: string;
  /** The App's private key. Never logged, never included in any thrown error. */
  readonly privateKey: string | KeyObject;
  /** Test seam only: points at a mock GitHub API instead of the real one. */
  readonly baseUrl?: string;
}

/**
 * Resolves a GitHub App installation access token — the ephemeral
 * credential model this connector exists to prove out (Claim 1 audit,
 * 2026-08-19), structurally different from HubSpot's static
 * caller-provided token. Gateway-owned for the same reason
 * GatewayGitHubAdapter is (this class makes a real network call, and
 * "connector packages own no production execution" — see
 * tests/architecture/execution-boundary.test.ts — applies to credential
 * resolution exactly as it does to the executable adapter itself; pure
 * JWT construction with no network call, GitHubAppJwt.ts, is the part
 * that stays in @parmana/connector-github).
 *
 * CredentialProvider.resolve() is called fresh by the Execution Gateway
 * immediately before each execution, never cached or reused by anything
 * upstream of this class — so implementing "mint a new short-lived token
 * per execution, never store it" required no new mechanism, only an
 * implementation of the same interface HubSpot's static-token model
 * already uses. That is itself evidence the credential-isolation pattern
 * generalizes across credential models, not just across connectors that
 * happen to share one model.
 *
 * The App's private key is held only by this class, in memory, exactly
 * as supplied at construction. It signs one JWT per resolve() call (see
 * @parmana/connector-github's GitHubAppJwt), exchanges that JWT for an
 * installation token via GitHub's REST API, and returns only the
 * resulting token — the private key itself is never included in the
 * returned CredentialHandle, never logged, and never appears in any
 * error message this class throws.
 */
export class GitHubAppCredentialProvider implements CredentialProvider {
  readonly providerId = "github-app";

  private readonly baseUrl: string;

  constructor(private readonly options: GitHubAppCredentialProviderOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async resolve(connectorId: string): Promise<CredentialHandle> {
    const jwt = signGitHubAppJwt({
      appId: this.options.appId,
      privateKey: this.options.privateKey,
    });

    const response = await fetch(
      `${this.baseUrl}/app/installations/${encodeURIComponent(this.options.installationId)}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "parmana-connector-github",
        },
      },
    );

    if (!response.ok) {
      // Deliberately does not include the JWT or any response body detail
      // that could carry credential-adjacent material -- only the
      // connector identity and HTTP status, mirroring
      // GatewayHubSpotAdapter's parseOrFailClosed.
      throw new Error(
        `GitHubAppCredentialProvider failed to mint an installation token for connector ` +
          `"${connectorId}": HTTP ${response.status}.`,
      );
    }

    const body = (await response.json()) as { token?: unknown };

    if (typeof body.token !== "string" || body.token.length === 0) {
      throw new Error(
        `GitHubAppCredentialProvider received a malformed access-token response for connector ` +
          `"${connectorId}": missing "token".`,
      );
    }

    return brandCredentialHandle({
      providerId: this.providerId,
      credentialId: `installation:${this.options.installationId}`,
      value: Object.freeze({ installationToken: body.token }),
    });
  }
}
