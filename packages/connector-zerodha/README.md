# @parmana/connector-zerodha

Zerodha Kite Connect connector for Parmana. Live trading is built but switched off, and it cannot be enabled without recorded approvals.

## Status

| Part                                      | Status                                        | Where                                                                         |
| ----------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| Capability `zerodha:place-order`          | Built, merged                                 | `src/ZerodhaCapabilities.ts`                                                  |
| Login URL, checksum, auth header          | Built, merged                                 | `src/KiteSession.ts`                                                          |
| Paper-mode order client                   | Built, merged                                 | `src/PaperKiteClient.ts`                                                      |
| Live Kite order client                    | Built, not enabled                            | `src/KiteLiveClient.ts`                                                       |
| Gateway adapter with paper and live modes | Built, not registered                         | `packages/execution-gateway/src/connector-execution/GatewayZerodhaAdapter.ts` |
| Live approval record                      | Required for live mode, not supplied anywhere | `ZerodhaLiveApproval` in the gateway adapter                                  |
| Connector registration with the gateway   | Not done                                      | Intentionally absent                                                          |

No code path in this repository can place a real order. The live client runs only inside the adapter's live mode, and the adapter refuses to construct in live mode without an approval record. Nothing in the repository supplies one.

## How an order flows

1. The gateway verifies the signed authorization (see `packages/execution-gateway`).
2. The adapter checks the capability is `zerodha:place-order`.
3. The adapter maps the request parameters to a Kite order and checks their types.
4. The order validator checks the values: exchange, transaction type, quantity, order type, product, and the price and trigger price each order type requires.
5. Paper mode records the order with a simulated id (`PAPER-000001`) and makes no network call.
6. Live mode sends a form-encoded `POST /orders/regular` to Kite over HTTPS, with the `X-Kite-Version: 3` header and `Authorization: token api_key:access_token`.

## Failure handling

- **No retries.** An order request is not idempotent. A retry after a timeout could place the order twice.
- **Unknown outcome.** Any failure after the request was sent is a plain error whose message says the outcome is unknown. The gateway turns a plain error after release into `EXECUTION_OUTCOME_UNKNOWN`, which is logged at critical severity.
- **No secrets in errors.** Error messages never include the api key or access token. A test checks this.

## Approval gate

Live mode needs a `ZerodhaLiveApproval` with three non-empty fields:

- `sebiCircularReviewRef`: where the compliance review of the SEBI retail algo circular is recorded.
- `kiteApiApprovalRef`: where Zerodha's written API approval for this app is recorded.
- `approvedBy`: who signed off.

The adapter checks all three in its constructor. A missing or blank field refuses construction, before any order can be sent.

Paper mode is refused when `NODE_ENV` is `production`.

## Before live mode can be enabled

These are the conditions to meet before anyone adds a registration or passes an approval record:

1. The SEBI retail algo circular (`SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/0000013`) is read from the official text, and its date is confirmed. Compliance signs off on whether the setup qualifies.
2. A Kite Connect app is registered, and Zerodha's current API terms are read. Written approval for this use is obtained.
3. The `api_key` and `api_secret` are stored in a secrets manager or environment variables, never in the repository or in chat.
4. The Kite facts used in `src/KiteLiveClient.ts` are checked against the current Kite Connect documentation: the endpoint, the header names, the form field names, and the response shape.
5. A reviewer signs off the registration change in a separate pull request.

## Tests

```bash
npm run build -w @parmana/connector-zerodha
npx vitest run packages/connector-zerodha packages/execution-gateway
```

The live client tests use a fake fetch. No test contacts Kite.
