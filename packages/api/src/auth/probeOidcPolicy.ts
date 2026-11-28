import type { GitHubOidcPolicy } from "./GitHubOidcAuthenticator.js";

/**
 * The pinned policy for the kill-switch probe's OIDC identity. Values come from
 * docs/internal/designs/PROBE-OIDC-AUTH.md section 4.2.
 *
 * The numeric repository id is not known to this code. The owner must supply it
 * from the repository, so there is no default.
 */
export function probeOidcPolicy(repositoryId: string): GitHubOidcPolicy {
  return {
    issuer: "https://token.actions.githubusercontent.com",
    jwksUrl: "https://token.actions.githubusercontent.com/.well-known/jwks",
    audience: "https://parmana-api-real.vercel.app",
    repositoryId,
    ref: "refs/heads/main",
    jobWorkflowRef:
      "pavancharak/parmana-core/.github/workflows/kill-switch-probe.yml@refs/heads/main",
    allowedEventNames: ["schedule", "workflow_dispatch"],
    callerId: "github-actions:kill-switch-probe",
    capability: "kill-switch:probe",
    maxLifetimeSeconds: 600,
    clockSkewSeconds: 60,
    jwksRefreshIntervalSeconds: 60,
  };
}
