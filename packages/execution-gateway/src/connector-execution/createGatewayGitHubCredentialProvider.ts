import type { CredentialProvider } from "@parmana/connector-sdk";

import { GitHubAppCredentialProvider } from "./GitHubAppCredentialProvider.js";
import type { GitHubAppCredentialProviderOptions } from "./GitHubAppCredentialProvider.js";

/**
 * Creates the production GitHub App credential provider.
 *
 * Returns the stable CredentialProvider interface, not the concrete
 * GitHubAppCredentialProvider class — callers never construct or depend
 * on the implementation directly (same reasoning as
 * createGatewayGitHubConnector.ts, applied to credential resolution: this
 * class makes a real network call to mint each installation token, so
 * "connector packages own no production execution" applies to it exactly
 * as it does to the executable adapter).
 */
export function createGatewayGitHubCredentialProvider(
  options: GitHubAppCredentialProviderOptions,
): CredentialProvider {
  return new GitHubAppCredentialProvider(options);
}
