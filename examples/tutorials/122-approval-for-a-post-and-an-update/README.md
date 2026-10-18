# Tutorial 122: an approval for a Slack post and a HubSpot update

## Objective

Show a person's signed approval on two more real actions, a Slack post and a HubSpot deal update,
and that each approval covers one action on one resource.

## What the policies say

| Action                | Policy                      | Signal               | The approval covers |
| --------------------- | --------------------------- | -------------------- | ------------------- |
| `slack:post-message`  | `slack-post-message` 1.1.0  | `postApproved`       | the channel         |
| `hubspot:deal-update` | `hubspot-deal-update` 1.1.0 | `dealUpdateApproved` | the deal            |
| `hubspot:deal-fetch`  | `hubspot-deal-read` 1.0.0   | `readApproved`       | the deal            |

`contentApproved` and `channelAuthorized` can still refuse a post, and a stage move that is not
forward is refused even with an approval. Neither can authorize anything on its own.

## The steps

Slack:

1. A post with every caller fact true and no approval: refused.
2. A person approves posting to `C_OPS`; the agent posts there: approved.
3. An approval for `C_OPS` used to post to `C_EXFIL`: refused.
4. An approval for `C_OPS`, but the content review failed: refused.

HubSpot:

5. A forward stage move on deal 9001 with no approval: refused.
6. A person approves updating deal 9001: approved.
7. An approval for deal 9001 used on deal 9002: refused.
8. An approval for deal 9001, but the stage move is not forward: refused.
9. An approval to update deal 9001 used to read it: refused, a read needs its own.
10. A person approves reading deal 9001: approved.

## Run

```bash
npx tsx examples/tutorials/122-approval-for-a-post-and-an-update/run.ts
```

It is also part of `npm run examples`. It runs the real `RuntimeEngine` with the policy files and
the real approval check, with a demo approver. On the server, `SlackChannelSignalVerifier` also
checks the channel against `SLACK_ALLOWED_CHANNEL_IDS`, and `HubSpotSignalStateVerifier` checks
the declared deal facts against the real deal; this tutorial shows only the approval.

## Limits

An approval names the action and the resource, not every parameter. A Slack approval does not
fix the message text, and a HubSpot approval does not fix the new stage or amount.

## Code

- `policies/slack-post-message/1.1.0`, `policies/hubspot-deal-update/1.1.0`,
  `policies/hubspot-deal-read/1.0.0`
- `packages/approval/src/ApprovalSignalVerifier.ts`
- Tests: `packages/api/tests/integration/slack-post-message.integration.test.ts`,
  `packages/api/tests/integration/hubspot-deal-update.integration.test.ts`
