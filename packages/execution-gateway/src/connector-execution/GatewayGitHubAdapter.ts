import type {
  Connector,
  ConnectorCapabilities,
  ConnectorExecutionContext,
  ConnectorRequest,
  ConnectorResponse,
} from "@parmana/connector-sdk";

import {
  GITHUB_PR_FETCH_CAPABILITY,
  GITHUB_PR_MERGE_CAPABILITY,
  type GitHubConnectorOptions,
} from "@parmana/connector-github";
import {
  GITHUB_ALLOWED_MERGE_METHODS,
  GITHUB_TEST_MODE_PLACEHOLDER_TOKEN,
  isGitHubCredentialValue,
  redactGitHubToken,
  type GitHubAllowedMergeMethod,
  type GitHubPullRequestState,
} from "@parmana/connector-github";

const DEFAULT_BASE_URL = "https://api.github.com";

/**
 * GitHub connector: pull request fetch (read, used to learn mergeable /
 * head-sha state for policy evaluation) and pull request merge (the
 * guarded execution). Structurally parallel to GatewayHubSpotAdapter —
 * same deny-by-default discipline, same fail-closed-on-non-2xx
 * discipline, same placeholder-credential guard — deliberately, so the
 * pattern is obvious in review rather than reinvented per connector.
 * Gateway-owned (Phase 1C precedent): capability identifiers and
 * option/parameter DTOs live in @parmana/connector-github (imported back
 * here), only the executable class lives in execution-gateway.
 *
 * `target` is "<owner>/<repo>#<pull_number>" (e.g. "acme/widgets#42").
 */
export class GatewayGitHubAdapter implements Connector {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;
  private readonly baseUrl: string;

  constructor(private readonly options: GitHubConnectorOptions) {
    this.connectorId = options.connectorId;
    this.capabilities = options.capabilities;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    Object.freeze(this);
  }

  async execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse> {
    if (!this.capabilities.includes(request.capability)) {
      throw new Error(
        `GitHubConnector "${this.connectorId}" does not declare capability "${request.capability}".`,
      );
    }

    if (!isGitHubCredentialValue(context.credential.value)) {
      throw new Error(
        `GitHubConnector "${this.connectorId}" received a credential that is not a resolved ` +
          "GitHub App installation token.",
      );
    }
    const { installationToken } = context.credential.value;

    // Same guard as GatewayHubSpotAdapter's placeholder-credential check,
    // present from this connector's first version rather than retrofitted
    // after an incident (docs/CLAIMS.md 3.10's own precedent).
    if (
      this.baseUrl === DEFAULT_BASE_URL &&
      installationToken === GITHUB_TEST_MODE_PLACEHOLDER_TOKEN
    ) {
      throw new Error(
        `GitHubConnector "${this.connectorId}" refuses to send the built-in test-mode placeholder ` +
          `credential to GitHub's real API (${DEFAULT_BASE_URL}). This placeholder is only safe against ` +
          "a mock server reached via an explicit baseUrl override.",
      );
    }

    const authorizationHeader = `Bearer ${installationToken}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs);

    try {
      switch (request.capability) {
        case GITHUB_PR_FETCH_CAPABILITY:
          return await this.fetchPullRequest(
            request,
            authorizationHeader,
            controller.signal,
            installationToken,
          );
        case GITHUB_PR_MERGE_CAPABILITY:
          return await this.mergePullRequest(
            request,
            authorizationHeader,
            controller.signal,
            installationToken,
          );
        default:
          throw new Error(
            `GitHubConnector "${this.connectorId}" has no handler for capability "${request.capability}".`,
          );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `GitHubConnector "${this.connectorId}" request to capability "${request.capability}" ` +
            `timed out after ${context.timeoutMs}ms.`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchPullRequest(
    request: ConnectorRequest,
    authorizationHeader: string,
    signal: AbortSignal,
    token: string,
  ): Promise<ConnectorResponse> {
    const { owner, repo, pullNumber } = parseTarget(request.target);

    const body = (await this.githubGet(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`,
      authorizationHeader,
      signal,
    )) as {
      number: number;
      mergeable: boolean | null;
      merged_at: string | null;
      head: { sha: string };
      base: { ref: string };
    };

    const pullRequest: GitHubPullRequestState = {
      number: body.number,
      mergeable: body.mergeable,
      mergedAt: body.merged_at,
      headSha: body.head.sha,
      baseRef: body.base.ref,
    };

    return {
      success: true,
      metadata: { pullRequest, tokenRedacted: redactGitHubToken(token) },
    };
  }

  /**
   * Deny-by-default execution: mergeMethod must be one of
   * GITHUB_ALLOWED_MERGE_METHODS, refused before any network call
   * otherwise. `expectedHeadSha`, when supplied, is forwarded as GitHub's
   * own `sha` merge parameter -- GitHub itself refuses the merge (422) if
   * the PR's actual head has moved since policy evaluated it, closing the
   * same class of stale-decision gap SignalIntentBinder closes for
   * amount/target fields elsewhere in this codebase.
   */
  private async mergePullRequest(
    request: ConnectorRequest,
    authorizationHeader: string,
    signal: AbortSignal,
    token: string,
  ): Promise<ConnectorResponse> {
    const { owner, repo, pullNumber } = parseTarget(request.target);
    const tokenRedacted = redactGitHubToken(token);

    const mergeMethod = requireString(
      request.parameters.mergeMethod,
      "parameters.mergeMethod",
    );
    if (
      !(GITHUB_ALLOWED_MERGE_METHODS as readonly string[]).includes(mergeMethod)
    ) {
      throw new Error(
        `GitHubConnector "${this.connectorId}" refuses to merge with unsupported merge method ` +
          `"${mergeMethod}". Only ${GITHUB_ALLOWED_MERGE_METHODS.join(", ")} are permitted.`,
      );
    }

    const requestBody: Record<string, unknown> = {
      merge_method: mergeMethod as GitHubAllowedMergeMethod,
    };
    if (request.parameters.expectedHeadSha !== undefined) {
      requestBody.sha = requireString(
        request.parameters.expectedHeadSha,
        "parameters.expectedHeadSha",
      );
    }

    const response = await fetch(
      `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}/merge`,
      {
        method: "PUT",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: authorizationHeader,
          Accept: "application/vnd.github+json",
          "User-Agent": "parmana-connector-github",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const merged = await this.parseOrFailClosed(response);

    return { success: true, metadata: { merged, tokenRedacted } };
  }

  private async githubGet(
    path: string,
    authorizationHeader: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      signal,
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/vnd.github+json",
        "User-Agent": "parmana-connector-github",
      },
    });
    return this.parseOrFailClosed(response);
  }

  private async parseOrFailClosed(response: Response): Promise<unknown> {
    if (!response.ok) {
      throw new Error(
        `GitHubConnector "${this.connectorId}" request failed with HTTP ${response.status}.`,
      );
    }
    const text = await response.text();

    try {
      return JSON.parse(text) as unknown;
    } catch {
      // A 2xx body that is not JSON is not evidence of the action. Recording
      // it as success would sign an outcome nothing confirmed.
      throw new Error(
        `${this.connectorId} returned a 2xx response that is not JSON; the outcome is not confirmed.`,
      );
    }
  }
}

function parseTarget(target: string): {
  owner: string;
  repo: string;
  pullNumber: string;
} {
  //
  // Owner and repository are restricted to the characters GitHub allows
  // (an owner: letters, digits and hyphens; a repository: also "." and
  // "_", but never "." or ".." alone). Both are interpolated into the
  // request path, so "/", "..", "?" or "%" in either would let a target
  // that reads as one repository address a different API path.
  //
  const match =
    /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})#(\d{1,10})$/.exec(target);
  if (!match || match[2] === "." || match[2] === "..") {
    throw new Error(
      `GitHubConnector received an invalid target "${target}". Expected "<owner>/<repo>#<pull_number>".`,
    );
  }
  return { owner: match[1]!, repo: match[2]!, pullNumber: match[3]! };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `GitHubConnector request is missing required field "${field}".`,
    );
  }
  return value;
}
