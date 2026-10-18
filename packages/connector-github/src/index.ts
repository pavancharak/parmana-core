/**
 * @parmana/connector-github
 *
 * GitHub pull request capability definitions, schemas, and JWT-signing
 * support for Parmana: pull request fetch and merge only (this
 * milestone's scope — see docs/CLAIMS.md). Passive by design — the
 * executable connector (GatewayGitHubAdapter) and the ephemeral
 * credential provider (GitHubAppCredentialProvider) are owned by
 * @parmana/execution-gateway (Phase 1C precedent — GatewayHubSpotAdapter),
 * since both make real network calls and "connector packages own no
 * production execution" applies to credential resolution as much as to
 * the executable adapter itself.
 */

export {
  GITHUB_PR_FETCH_CAPABILITY,
  GITHUB_PR_MERGE_CAPABILITY,
  type GitHubConnectorOptions,
} from "./GitHubCapabilities.js";

export { signGitHubAppJwt, type GitHubAppJwtOptions } from "./GitHubAppJwt.js";

export { GitHubMetadata } from "./GitHubMetadata.js";

export {
  MockGitHubServer,
  type MockGitHubServerOptions,
} from "./MockGitHubServer.js";

export {
  GITHUB_ALLOWED_MERGE_METHODS,
  GITHUB_TEST_MODE_PLACEHOLDER_TOKEN,
  isGitHubCredentialValue,
  redactGitHubToken,
  type GitHubAllowedMergeMethod,
  type GitHubCredentialValue,
  type GitHubPullRequestState,
} from "./GitHubTypes.js";
