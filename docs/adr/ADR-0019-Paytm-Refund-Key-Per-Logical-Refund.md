# ADR-0019: The Paytm refund key identifies the logical refund, not the authorization

Status: accepted, 2026-11-01. Issue #217.

## Context

Paytm's refund API uses a caller-supplied `refId` to recognise a repeated request. The Paytm connector service does not derive one itself. Parmana's Gateway adapter sends the `refId`, so the adapter decides whether two requests are the same refund.

Two designs were considered:

1. **Key on the logical refund:** `refId` is a hash of `(orderId, transactionId)`, plus a `refundReference` when the caller sends one (G-71). A retry after an unclear outcome sends the same `refId`.
2. **Key on the authorization:** `refId` is derived from the authorization's nonce or `businessTransactionId`. Each new authorization gets a new key.

## Decision

Option 1. The key identifies the refund, so a new authorization for the same refund sends the same `refId`, and Paytm treats it as one refund.

Option 2 would make a retry after an unclear outcome look like a second refund to Paytm, which could pay out twice.

## Consequences

- Two different refunds of one transaction are separated only by `refundReference`. A caller that sends no reference gets one refund per transaction key.
- The adapter test "#217: a new authorization for the same refund keeps its refId" pins this behaviour. Changing the key to use the authorization fails that test.
- Other providers in issue #217 (HubSpot, GitHub, Slack): the current API documentation found no idempotency key in the create-object, REST, or `chat.postMessage` references. This is not yet confirmed. Confirm each against its official reference before saying the provider takes no key.

## Sources

- Adapter: `packages/execution-gateway/src/connector-execution/GatewayPaytmAdapter.ts`
- Derivation: `packages/connector-paytm/src/PaytmTypes.ts` (`deriveDeterministicPaytmRefId`)
- Test: `packages/execution-gateway/tests/unit/paytm-connector.test.ts`
