# Tutorial 121: an approval for a read

## Objective

Show that a read needs a signed human approval too. An agent reading a pull request is still an
agent acting, and what it reads can be what it acts on next.

## What the policy says

`policies/github-pr-read/1.1.0/policy.json`, bound to `github:pr-fetch`, approves only when
`readApproved` is true:

```json
"approvalSignals": {
  "readApproved": { "resourceId": "target" }
}
```

So `readApproved` counts as true only with a signed approval for that exact pull request
(`owner/repo#number`), for `github:pr-fetch`, from a trusted approver, not expired, used once.
`github-pr-read` 1.0.0 approved every read with no facts at all and now fails to load.

## The steps

1. A read of `acme/api#42` with no approval: refused.
2. `readApproved: true` with no approval: refused.
3. A reviewer signs for `acme/api#42` and the agent attaches it: approved.
4. The same approval sent again: refused, an approval is used once.
5. An approval for `acme/api#43` used to read `acme/api#42`: refused.
6. An approval to merge `acme/api#44` used to read it: refused, the approval names the action.

## Run

```bash
npx tsx examples/tutorials/121-approval-for-a-read/run.ts
```

It is also part of `npm run examples`. It runs the real `RuntimeEngine` with the policy file and
the real approval check; a demo approver (a key made in memory) plays the reviewer.

## In production

The reviewer's key is added through maker checker (`docs/site/guides/manage-approvers.mdx`). For
each read, the reviewer signs with
`scripts/sign-approval.ts --capability github:pr-fetch --resource-id "acme/api#42"`, or
`signApproval()` in the SDKs, and the agent sends it in `signals.approvalArtifact` with
`readApproved: true`.

## Code

- `policies/github-pr-read/1.1.0/policy.json`
- `packages/capability-registry/src/CapabilityPolicyBinding.ts`
- `packages/approval/src/ApprovalSignalVerifier.ts`
- Tests: `packages/policy/tests/unit/ApprovalBackedPolicies.test.ts`,
  `packages/api/tests/integration/github-caller-scoping.integration.test.ts`
