# Provider event adapters

Status: the neutral endpoint is built. The Amazon SES adapter is built, and optional. Adapters for other providers are not built yet.

## Why adapters exist

Alerts are sent over SMTP, which any provider or relay accepts. When a message bounces or is complained about, each provider reports it in its own format. Only the adapter for that provider knows that format. An adapter translates the provider's report into one neutral form, and sends it to the endpoint. The alert logic, the suppression rules and the register never see a provider's format, so switching providers means writing or removing one adapter.

## The neutral form

The endpoint is `POST /v2/notifications/events`. The body is one JSON object:

```json
{
  "events": [
    {
      "eventId": "provider-report-42/owner@example.com",
      "type": "bounce",
      "bounceKind": "permanent",
      "messageId": "<abc123@mail.example.com>",
      "recipient": "owner@example.com"
    }
  ]
}
```

| Field        | Required     | Meaning                                                                                               |
| ------------ | ------------ | ----------------------------------------------------------------------------------------------------- |
| `eventId`    | yes          | Unique for each recipient of each report. A repeated report with the same id is counted once.         |
| `type`       | yes          | `bounce`, `complaint` or `delivery`. Only `bounce` and `complaint` are stored.                        |
| `bounceKind` | for a bounce | `permanent` or `transient`. A permanent bounce suppresses the address and raises an alert.            |
| `messageId`  | yes          | The message id the sender received when it sent the alert, so the event can be traced to the message. |
| `recipient`  | yes          | The email address. It must contain `@`.                                                               |

One report that names several recipients becomes one event per recipient, each with its own `eventId`.

## Signing

Each request carries the header `X-Parmana-Signature: sha256=<hex>`. The value is the HMAC-SHA256 of the raw request body, keyed with `PARMANA_POLICY_V2_EVENTS_SECRET`. The adapter must sign the exact bytes it sends. The body must be sent as `Content-Type: text/plain`. A JSON content type makes the server's JSON parser consume the body before the signature is checked, and the request will be refused.

The secret is at least 32 characters, held in the secrets store, and rotated like the other keys.

## Responses

| Status                       | Meaning                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| 200 with `{ "recorded": n }` | Accepted. `n` is the number of new events. A repeated event gives `n` of 0. |
| 400                          | The body is malformed. The message says which shape is wrong.               |
| 403                          | The signature is missing or does not match. Nothing is stored.              |

## Writing an adapter for a provider

1. **Find how the provider reports bounces.** Some send a webhook. Others forward the bounced message to an address you control. Note the exact format, and whether the report says permanent or transient.
2. **Receive the report.** If the provider calls a webhook, verify the provider's own signature first, as the SNS adapter does. If the report is forwarded, parse it only after you have checked where it came from.
3. **Map each recipient.** Produce one neutral event per recipient. Build the `eventId` from something the provider gives you that is unique per report and recipient, such as its report id plus the address. Never invent an id that changes on a retry.
4. **Map the bounce kind.** Only a permanent failure, such as an address that does not exist, is `permanent`. A full mailbox or a temporary refusal is `transient`. When in doubt, use `transient`: a wrong `permanent` suppresses a valid address.
5. **Sign and send.** Compute the HMAC over the exact body, and post it to the endpoint as `text/plain`.
6. **Do not drop failures silently.** If the endpoint returns anything other than 200, retry with backoff. A report that is never delivered leaves the address unsuppressed.

The Amazon SES adapter is `packages/api/src/policyV2/policyV2Sns.ts` and `policyV2Bounces.ts`. It verifies the SNS signature, checks that the certificate comes from an SNS host, and translates SES notifications into this form. It is enabled with `PARMANA_POLICY_V2_SNS_EVENTS=true`.

## Testing an adapter

- Take a real report from the provider, or its documented sample, and check that the events produced match the table above.
- Send the same report twice. The second send must record 0 events.
- Send a report with a wrong signature. It must be refused with 403.
- Send a permanent bounce for a test address. A delivery-failure alert must appear for Operations, and a later send to that address must be skipped.

## Not built

- Adapters for any provider other than Amazon SES.
- Forwarded-message parsing, which needs a mailbox that receives the forwards.
