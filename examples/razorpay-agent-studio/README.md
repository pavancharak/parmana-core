# Razorpay Agent Studio refund agent, through Parmana (test mode)

An agent built in Razorpay Agent Studio proposes a refund of a Razorpay payment to Parmana's real API. Parmana decides.
When it releases, the endpoint in `examples/razorpay-refund` refunds the payment in Razorpay, in test mode.

```
Agent Studio agent --MCP (bearer token)--> this server --API (agent key)--> Parmana
                                                                              |
Razorpay refund (test mode) <--- endpoint (test keys) <--- signed release ----+
```

**Test mode only.** The endpoint refuses `rzp_live_` keys. Agent Studio's own test toggle should be on as well.

## What is here

- `mcp.ts`: the MCP server. One tool, `propose_refund(paymentId, amountPaise, purpose?, approval?)`. It checks the
  input, then calls `requestRefund` in `examples/razorpay-refund-agent`. It returns `APPROVED` with Razorpay's answer,
  or `REFUSED` with the rule that refused it. It needs a bearer token; without one it calls nothing.
- `build-mcp.ts`: bundles the server into a folder Vercel can deploy. No secret is written into the build.
- `tests/mcp.test.ts`: authentication, the protocol, and the tool, against a fake Parmana (`npx vitest run examples/razorpay-agent-studio`).

## What you must do

Steps 1 and 2 are in `examples/razorpay-refund/README.md` (the policy and the capability, released to the endpoint).
Parmana's side is unchanged, so the endpoint's Razorpay keys and the agent's grant are the same as in that demo.

**1. Deploy the MCP server.**

```bash
npm run build
npx tsx examples/razorpay-agent-studio/build-mcp.ts --out ../parmana-agent-studio-mcp
cd ../parmana-agent-studio-mcp
npx vercel link --yes --project parmana-agent-studio-mcp
# add each as a sensitive production variable, entering the value at the prompt, never in chat:
#   AGENT_STUDIO_TOKEN   a random string of 32+ characters (generate it locally; keep a copy in the password manager)
#   PARMANA_URL          https://parmana-api-real.vercel.app
#   PARMANA_API_KEY      the agent's key (razorpay-refund-agent), issued as in examples/razorpay-refund step 4
npx vercel deploy --prod --yes
```

Check: `POST https://<your-deployment>/api/mcp` without a token answers `401`.

**2. Register it with Agent Studio.** Agent Studio's build screen (the one with "Build Agents", Test Mode on) offers
pre-built connectors. I found no public documentation for adding your own endpoint as a tool. Third-party Agent Studio
connectors are MCP servers, so this one is built as MCP. Ask Razorpay to register the server as a custom connector,
giving them its URL, `https://<your-deployment>/api/mcp`, and the bearer token. Razorpay's own search results describe
a new connector as taking about a week; enterprise customers can get private connectors. Until that exists, the agent
cannot call Parmana from Agent Studio.

**3. Give the agent its instructions.** Paste this into the Agent Studio agent:

> You propose refunds of Razorpay payments with the `propose_refund` tool only. Pass the payment id (`pay_...`) and the
> amount in paise (100 is ₹1). Never invent an approval or a payment id. If the answer is REFUSED, report the rule and
> reason to the user and do nothing else. Do not retry a refused request without a new approval.

**4. Approvals.** Parmana refuses any refund without a manager's signed approval for that payment and amount. The agent
cannot sign one, and nothing here holds a manager's key. A person makes the approval, with the approver key, as
`examples/razorpay-refund/send.ts` does (`--save-approval`). Pass that JSON as `approval` to the tool.

## Check it

With a captured Razorpay test payment and no approval, the agent should get `REFUSED` with
`reject-manager-approval-required`, and Razorpay should see no refund. With an approval for the same payment and amount
(within the agent's grant), the answer is `APPROVED`, and the Razorpay dashboard (Test Mode, Refunds) shows one refund
whose receipt is the `businessTransactionId` in the answer.

**If a call times out**, do not resend it. The refund may already have run. Read the record first with
`GET /trust-records/<businessTransactionId>` using the agent's key. A resend returns the existing refund rather than
refunding twice, but it needs a new approval.

## Limits

- Agent Studio's custom-connector path is not confirmed by Razorpay documentation; step 2 is a request to Razorpay.
- Only the endpoint's answer is what Razorpay said. Razorpay's dashboard is the record of the refund.
- Limits are per refund; the grant caps each amount.
