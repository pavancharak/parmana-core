# Google AX refund: a payment source, an approval and revocation through the Parmana gate

Runnable scenario for the parmana-core side of an agent refund that runs inside
Google AX. An agent proposes a refund of a payment. The gate runs the live
`policies/payment-refund/1.0.0` policy: a payment source must confirm the payment is
refundable, the policy must approve, and a signed manager approval must cover the
payment and amount. The approval is checked again at release, just before the
connector would run.

## Run

From the repository root, after `npm ci` and `npm run build`:

```bash
npx tsx examples/integrations/google-ax-refund/run.ts
```

The script exits 0 when every step behaves as the policy and approval rules require.

## Scenarios

| Step                                                   | Expected                                                  |
| ------------------------------------------------------ | --------------------------------------------------------- |
| 1. Refund of 5000 on a refundable payment, no approval | Refused at authorize                                      |
| 2. Refund of 75000, signed approval, manager trusted   | Approved at authorize, and again at release               |
| 3a. Refund of 60000, signed approval, manager trusted  | Approved at authorize                                     |
| 3b. Same refund, manager revoked before release        | Refused at release, before the connector would run        |
| 4. Step 2's approval sent again                        | Refused, an approval is used once                         |
| 5. Approval up to 75000 used for 90000                 | Refused, the amount comes from the request                |
| 6. Fully refunded payment, with a valid approval       | Refused by the payment source, whatever the approval says |

## Files

- `refund-gate.ts`: the gate. It asks the payment source, applies the policy, then checks the
  approval at authorize, and again at release. The trust list is passed per stage, so a
  revocation between stages can be modelled.
- `run.ts`: the scenario script above. Its payment source is a stand-in, an in-process table.

## What this does not cover

- **The payment source.** The source here is a stand-in. In production it is the payment
  provider's signal service, registered with Parmana, answering signed queries over HTTPS.
- **Google AX.** The agent is a plain function here. No AX API is called, and the AX source
  was reviewed for its interfaces only.
- **The connector.** The connector side is tested in `parmana-connectors`. Nothing here runs a
  connector.
- **Evidence.** Nothing is verified with parmana-verifier.
- **Hermetic.** The manager key is generated in memory, and nonces are kept in memory.
  Production uses the operator's trust list and a persistent nonce store.
