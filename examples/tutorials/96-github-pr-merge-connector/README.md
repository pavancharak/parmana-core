# Tutorial 96: GitHub PR Merge Connector

## Objective

Execute a real GitHub pull request merge through the same production composition (`createExecutionSystem` and `createApplication`) that `server.ts` itself calls, pointed at a hermetic `MockGitHubServer` instead of GitHub's live API, and show that a merge needs a signed approval from a person.

## What You'll Learn

- `github-pr-approval` 1.1.0 (G-73) authorizes a merge only with a signed approval for that exact pull request (`mergeApproved`, declared in the policy's `approvalSignals`). The review, status check, branch protection and risk signals come from the caller, so they can refuse a merge but never authorize one.
- Step 1: an agent declares every one of those facts true, and `mergeApproved: true`, with no approval. The request is refused and GitHub is never called.
- Step 2: a reviewer signs an approval for `acme/widgets#42` and the agent sends a new request with it in `signals.approvalArtifact`. The merge runs once, and the pull request's `mergedAt` changes on the mock server.
- GitHub's credential is ephemeral: a JWT signed exchange for a short lived installation token on every `resolve()` call. Under `NODE_ENV=test` with no `TEST_GITHUB_*` values set, `createGitHubCredentialProvider.ts` generates a fresh, never real RSA key pair.

The reviewer key is made in memory and passed to `createApplication` through its optional `approvalVerifier` argument. In production the reviewer runs `scripts/generate-approver-key.ts` on their own machine, the operator lists the public key in `TRUSTED_APPROVAL_ISSUERS` (`packages/api/src/bootstrap/createApprovalIssuerRegistry.ts`), and the reviewer signs with `scripts/sign-approval.ts`.

## Running the Tutorial

```bash
npx tsx examples/tutorials/96-github-pr-merge-connector/run.ts
```

## Why This Matters

This mirrors `packages/api/tests/integration/github-pr-merge.integration.test.ts`. An AI coding agent that has been manipulated (for example by instructions hidden in an issue or a pull request) can say anything about a pull request's reviews and checks. Before 1.1.0 those statements alone were enough for Parmana to authorize a merge. Now a person's signature on that pull request is required, and it can be used once.

Reading a pull request (`github:pr-fetch`) is governed by its own policy, `github-pr-read` 1.0.0, so reads do not need an approval.

## Next Tutorial

Continue with **Tutorial 97: Execution Chain Integrity**.
