# Example: an approved action is released, signed, and checked offline

This example shows what Parmana does with an action that needs approval. An agent asks for the action. Parmana refuses it until a person has approved it. Once approved, Parmana releases it to a registered endpoint, signs the release, and records the result. The record can then be checked offline, without contacting Parmana.

It runs against Parmana's production API. The endpoint it releases to acts on nothing. It returns a receipt.

## What it shows

| Request                                    | Expected result                                              |
| ------------------------------------------ | ------------------------------------------------------------ |
| 1. No approval                             | Refused, with the policy's reason                            |
| 2. The same request with a signed approval | Approved, released once, signed. The record verifies offline |
| 3. The same approval again                 | Refused. An approval is used once                            |

## Result on record

Checked on 1 October 2026, against the production API.

- Request 2 was approved in 23.9 seconds and released once. Its record verifies offline.
- The endpoint logged one `release_acted` line for the approved transaction.
- Request 3 was refused, because the approval had already been used.
- One earlier attempt completed on the server, but its agent stopped waiting at the SDK's default 30-second timeout. Its record also verifies offline. The example's send script now waits up to 120 seconds.

The full procedure and the raw output are in [`examples/live-checks/external-connector`](../live-checks/external-connector/README.md). This page does not repeat the commands.

## What it does not show

- **It does not show an effect on a business system.** The endpoint returns a receipt and changes nothing. What the endpoint answers is its own claim. The signed record proves what Parmana released and what the endpoint said. It does not prove what the endpoint's system did.
- **It does not show a payment connector.** The Razorpay refund path is not yet proven end to end. See the open items in the GTM repository.
- **The maker, checker, and approver keys were held by one person.** Credentials were distinct, but the check did not prove separate people. A check with separate people has not been run.
- **It is slow.** The approved request took about 24 to 32 seconds end to end. Plan for timeouts above 30 seconds.
- **The SDK helpers are not published yet.** `verifyParmanaRelease` and `verify_parmana_release` are in the repository. The endpoint uses them from there.
- **It is one check, on one date.** Re-run it before quoting it as current.

## Check the record yourself

1. Keep `live-check-record.json` from the run. It contains no secret.
2. Verify it with Parmana's public key, from `GET /keys/default`. The verifier does not need network access once you have the key.
3. Check that the record names the transaction, the capability, the policy version, the approver, and the endpoint as audience.

## How this is backed

- Claim 2.50 in [`docs/CLAIMS.md`](../../docs/CLAIMS.md) states the scope in full. This example must not claim more than that.
- Gap G-82 covers what the endpoint answers. G-84 covers the slow end-to-end time.
- Tutorial 123, [`examples/tutorials/123-external-connector`](../tutorials/123-external-connector), runs on every preflight. It covers register, release, a retry, a release for another endpoint, and a revoke.
