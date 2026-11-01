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
- Other providers in issue #217, checked against the official pages on 2026-11-01:
  - **HubSpot** (create object reference): no idempotency or deduplication key. The only identifiers are response and error fields (`objectWriteTraceId`, `correlationId`).
  - **GitHub** (REST best practices): no key that prevents duplicate writes on POST. The page covers retries and rate limits only.
  - **Slack** (`chat.postMessage`): `client_msg_id` appears only in two error descriptions. The page does not document it as a request parameter, so this is unverified.
  - These pages are not proof of absence across each whole API. Confirm again before any change that depends on it.

## Sources

- Adapter: `packages/execution-gateway/src/connector-execution/GatewayPaytmAdapter.ts`
- Derivation: `packages/connector-paytm/src/PaytmTypes.ts` (`deriveDeterministicPaytmRefId`)
- Test: `packages/execution-gateway/tests/unit/paytm-connector.test.ts`
