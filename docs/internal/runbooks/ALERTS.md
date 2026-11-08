# Alerts for decisions and kill switch trips

Closes the alerting half of G-138 (issue #430). A deployer can receive an
alert for each decision and each kill switch trip without querying the
database.

## Enable

Alerts are off unless `ALERT_WEBHOOK_URL` is set.

| Variable               | Required  | Meaning                                                                                                             |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| `ALERT_WEBHOOK_URL`    | to enable | Receiver URL. Must be `https://`. `http://` is accepted only for `localhost`. A non-HTTPS remote URL stops startup. |
| `ALERT_WEBHOOK_SECRET` | no        | When set, each body is signed. The header `X-Parmana-Signature: sha256=<hex>` is an HMAC-SHA256 of the raw body.    |

## Events

Every body is JSON with `"schema": "parmana.alert.v1"` and one of:

- `decision.approved` and `decision.refused`: `businessTransactionId`,
  `decisionId`, `policyName`, `policyVersion`, `submittedBy`, `reason`,
  `occurredAt`.
- `killswitch.tripped`: `trippedBy`, `reason`, `switchVersion`, `occurredAt`.

Bodies never include Intent parameters, signals, or artifacts.

## Delivery

- Best effort. Alerts are sent after the decision and never delay it. A
  failed alert never fails a decision or a trip.
- Each alert gets up to three attempts with a 5 second timeout. Network
  errors, 5xx responses, and 429 are retried. Other 4xx responses are not.
- Failed alerts are not queued. If the receiver is down for longer than the
  retry window, use the signed records to recover the events (see
  `INCIDENT-EXPORT.md`).

## Verify the signature

Compute HMAC-SHA256 over the raw request body with `ALERT_WEBHOOK_SECRET`,
then compare it with the hex value after `sha256=` using a constant-time
comparison. Reject any body whose signature does not match.
