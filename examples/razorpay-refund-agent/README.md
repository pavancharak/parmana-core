# Razorpay refund agent (test mode)

A fresh agent that asks Parmana to release one refund of a Razorpay payment. It is the agent side of the demo in
`examples/razorpay-refund`: it reuses that demo's `razorpay-refund` policy, its `razorpay:refund` capability and its
test-mode endpoint. What is new is the agent itself, with its own identity, its own input checks and its own runner.

**Test mode only.** The refund happens in Razorpay test mode, behind the endpoint in `examples/razorpay-refund`, which
refuses `rzp_live_` keys. The agent holds no Razorpay key and no approval key.

## Files

- `agent.ts`: `requestRefund(client, input)`. Checks the payment id (`pay_...`) and the amount (whole paise) before any
  call, submits the refund to Parmana, and returns `APPROVED` with the record or `REFUSED` with the refusal rule.
- `send.ts`: the command-line runner, one refund request per run.
- `tests/agent.test.ts`: the agent against a fake Parmana client (`npx vitest run examples/razorpay-refund-agent`).

## Run it

Set up Parmana's side first (policy, capability, grant, agent key) as in `examples/razorpay-refund/README.md`, steps 1 to 5. Then, after `npm run build`:

```bash
export PARMANA_URL=https://parmana-api-real.vercel.app
export PARMANA_API_KEY=...   # the agent's key, from the password manager, never in chat
npx tsx examples/razorpay-refund-agent/send.ts --payment pay_XXXXXXXX --amount 100 \
  --approval-file approval.json --out record.json
```

Omit `--approval-file` to send a request with no manager approval: Parmana refuses it and Razorpay is not called.

## Test money

You need a captured payment in Razorpay **Test Mode** (see `examples/razorpay-refund/README.md`, "Before you start").
A refund against it moves no real money.
