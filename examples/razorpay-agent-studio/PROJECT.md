# Razorpay Agent Studio refund agent, through Parmana

This folder explains what we set out to build, why, how it is put together, what is done, and what is still open.
Setup steps live in `README.md`. This file is the overview.

## Why

Refunds move money. An AI agent that can issue refunds on its own is a risk: a wrong target, a wrong amount, or a
prompt-injected instruction could refund money nobody meant to refund. Parmana is the authorization layer in this
repository. It decides whether an agent may perform an action, requires a signed human approval where the policy says
so, and leaves a signed record of every decision that can be verified offline.

Razorpay Agent Studio is where a merchant can build an agent in plain language. We want that agent to be able to
propose refunds, but never to release one by itself. Parmana sits between the two.

## What we want to achieve

1. A Razorpay Agent Studio agent proposes a refund of a Razorpay payment.
2. The proposal goes to Parmana's real API, where Parmana decides.
3. Only when Parmana releases the refund, the refund happens in Razorpay.
4. Every decision, approved or refused, leaves a signed record.
5. Everything runs in **Razorpay test mode** first. No real money moves.

Success looks like: with no approval, the agent's request is refused and Razorpay sees nothing. With a manager's signed
approval for the same payment and amount, the request is approved and Razorpay shows one refund whose receipt is
Parmana's business transaction id.

## What we built

Everything is in this folder and in two siblings it depends on.

| Piece                       | Where                                                                               | What it does                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Refund agent                | `examples/razorpay-refund-agent/`                                                   | Checks the input (payment id, whole paise), asks Parmana to release one `razorpay:refund`, returns `APPROVED` or `REFUSED`. Has its own CLI and tests. |
| Razorpay endpoint           | `examples/razorpay-refund/` (existing)                                              | Verifies Parmana's signed release, then refunds in Razorpay test mode. It holds the Razorpay test keys; Parmana does not.                              |
| Policy and capability       | `examples/razorpay-refund/policy.json` (existing)                                   | Requires an authority grant and a signed manager approval for the payment and amount.                                                                  |
| **Agent Studio MCP server** | `examples/razorpay-agent-studio/mcp.ts`                                             | Exposes one tool, `propose_refund`, over MCP. Agent Studio calls it; it calls the refund agent.                                                        |
| Build script                | `examples/razorpay-agent-studio/build-mcp.ts`                                       | Bundles the server into a folder Vercel can deploy. No secret is written into the build.                                                               |
| Tests                       | `examples/razorpay-agent-studio/tests/` and `examples/razorpay-refund-agent/tests/` | Run against a fake Parmana. No network.                                                                                                                |

## How it fits together

```
Agent Studio agent
      |  MCP tool call, bearer token (AGENT_STUDIO_TOKEN)
      v
MCP server (mcp.ts, on Vercel)
      |  API call, agent key (PARMANA_API_KEY)
      v
Parmana API (parmana-api-real)  --- decides: policy, grant, approval ---
      |  signed release, if approved
      v
Razorpay endpoint (examples/razorpay-refund, on Vercel, test keys)
      |  POST /v1/payments/{id}/refund, receipt = businessTransactionId
      v
Razorpay (test mode)
```

Key design choices:

- **Parmana holds no Razorpay key. The endpoint does.** Parmana releases a signed statement; the endpoint acts only on
  what it verifies (signature, audience, expiry, capability).
- **The MCP server holds no Razorpay key either.** It holds two secrets: the bearer token that only Agent Studio
  presents, and Parmana's agent key.
- **The agent cannot approve its own refunds.** Parmana refuses any refund without a manager's signed approval for that
  payment and amount. The approval is made by a person, with an approver key the agent never sees.
- **Acting once.** Each refund carries Parmana's business transaction id as its Razorpay `receipt`. The endpoint checks
  for an existing refund with that receipt before refunding, so a resend does not refund twice.
- **Test mode only.** The endpoint refuses `rzp_live_` keys before making any call.
- **Input is checked before any call.** A bad payment id or amount is rejected without contacting Parmana.
- **Errors are reported, not hidden.** A Parmana refusal is returned as `REFUSED` with its rule. Any other failure is
  passed up as an error.

## Status

Done and tested in this repository:

- The refund agent, with 16 tests against a fake Parmana.
- The MCP server, with 6 tests covering authentication, the protocol and the tool.
- The build script; the built bundle contains no secret.
- All Razorpay examples pass together: 22 tests. Typecheck, eslint and prettier are clean.

Not done, and not testable from this environment:

- **No live call.** We have not deployed the MCP server or called Parmana's real API. We have no Razorpay test key and no
  Vercel access here.
- **Agent Studio registration.** We found no public Razorpay documentation for adding a custom API or MCP tool to Agent
  Studio. Third-party Agent Studio connectors are MCP servers, so this one is built as MCP, but Razorpay has to register
  it. Razorpay's own search results describe a new connector as taking about a week.
- **Approval flow.** A person must sign each approval with the approver key. There is no approval screen yet.
- **Status tool.** The MCP server exposes only `propose_refund`. There is no tool to check a refund afterwards.

## Open questions

- Does Razorpay's Agent Studio accept a custom MCP connector from a merchant, or only through its own request process?
- Who holds the manager's approver key, and how is an approval handed to the agent? (Today: pasted into the tool call.)
- Should the agent be allowed to propose refunds for any payment, or only for payments an order system confirms?
- When do we move from test mode to live? That needs a separate review; this folder does not do it.

## Next steps

1. Deploy the MCP server to Vercel with a token and Parmana's agent key, and check that an unauthenticated call gets 401.
2. Run one refused and one approved request against Parmana with a captured Razorpay test payment, and keep the records.
3. Ask Razorpay to register the MCP server as a custom connector for the Agent Studio agent.
4. Add a status tool, so the agent can confirm a refund without a dashboard visit.
