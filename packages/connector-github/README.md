# @parmana/connector-github

GitHub connector: pull request fetch (read) and merge (guarded execution),
following `@parmana/connector-hubspot`'s own structural pattern deliberately —
same deny-by-default discipline, same fail-closed-on-non-2xx discipline, same
placeholder-credential guard — so the credential-isolation pattern is obvious
in review rather than reinvented per connector.

## Credential model

Structurally different from HubSpot's static caller-provided Private App
token: `GitHubAppCredentialProvider` mints a short-lived (~1 hour) GitHub App
installation access token fresh on every `CredentialProvider.resolve()` call,
by signing a JWT with the App's private key (`GitHubAppJwt.ts`, native
`node:crypto`, no JWT library dependency) and exchanging it once against
GitHub's `/app/installations/:id/access_tokens` endpoint. The App's private
key never leaves `GitHubAppCredentialProvider`; the connector itself only
ever sees the resulting installation token, exactly as `GatewayHubSpotAdapter`
only ever sees a resolved `privateAppToken` — the ephemeral-token flow
required no change to the `CredentialProvider`/`Connector` interfaces
themselves, which is itself evidence the credential-isolation pattern
generalizes across credential models, not only across connectors sharing one
model.

## Status

Scaffolded and hermetically tested (22 tests: JWT signature correctness,
credential-exchange HTTP flow against `MockGitHubServer`, redaction to a
one-way fingerprint, error-message isolation, response-metadata safety,
deny-by-default merge-method guard, fail-closed on non-2xx/timeout,
credential-lifecycle isolation across calls). **Not yet wired into the
Parmana API/policy layer** — no `policies/github-pr-merge/` policy file, no
`createGitHubConnector.ts`/`createGitHubCredentialProvider.ts` bootstrap
registration, no live suite against a real GitHub App. Those are the
remaining steps before the "policy denial → zero GitHub API calls" property
can be proven at the same full RuntimeEngine→API level
`hubspot-deal-update.integration.test.ts` proves it for HubSpot (today it's
only proven at this connector's own internal deny-by-default guard).
