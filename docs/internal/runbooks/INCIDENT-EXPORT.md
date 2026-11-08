# Incident export of Execution Trust Records

Closes the export half of G-139 (issue #431): a bounded export of signed
records for a time window, and the steps to verify it offline.

## When to use it

An AI-related security incident has to be reported within a deadline (six
hours under the draft CERT-In guidelines). Use this export to pull every
record created in the affected window, then verify the records without
calling Parmana.

## 1. Export the window

Call `GET /trust-records` with `since` and `until` (ISO 8601). Both bounds
are inclusive and filter on the transaction's `createdAt`.

```bash
curl -sS -H "Authorization: Bearer $PARMANA_API_KEY" \
  "$PARMANA_ENDPOINT/trust-records?since=2026-11-08T06:00:00Z&until=2026-11-08T12:00:00Z" \
  -o incident-window.json
```

The export is complete or refused. It is never a partial page:

- `200` with a JSON array: every record in the window that this caller may
  see. A caller only sees its own records (scoped by `submittedBy`).
- `422`: the window matches more transactions than one export scans
  (50 pages of 100 transactions). Split the window in half and export each
  part. Do not merge partial results without checking the counts.
- `400`: `since` or `until` is not a valid ISO 8601 timestamp.

Dated exports do not use `page` or `pageSize`. Those apply only to the
undated, paginated listing.

## 2. Verify offline

Each record carries its own signature. Follow
`docs/site/guides/verify-independently.mdx` for the verification steps. Run
them on a machine with no network access and with the public key that
issued the records, not a key fetched from the same server being
investigated.

For each record in `incident-window.json`, confirm:

1. The signature verifies against the published public key.
2. The `transaction.createdAt` is inside the window you requested.
3. The record count matches the count your monitoring saw for the window.

## 3. Timed drill

Run this drill at least once per quarter to measure how long the export and
verification take against the six-hour deadline. Record the result in the
gap log entry for G-139.

1. Choose a one-hour window from the last week.
2. Start a timer. Export the window, then verify it offline.
3. Stop the timer and record the elapsed time, the record count, and any
   `422` or `400` responses.
