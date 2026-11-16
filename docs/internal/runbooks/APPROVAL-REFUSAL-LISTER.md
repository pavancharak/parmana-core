# Approval refusal lister

`scripts/list-approval-refusals.mjs` looks up the Refusal Records for a list of transactions and sorts each one into a category. It helps an operator find the transactions that were refused because a person's signed approval was missing, and separate them from final refusals.

It is read-only. It sends only `GET /refusal/{businessTransactionId}` requests. It never sends a POST, never resubmits a transaction, and never records an approval.

## When to use it

Use it after a batch of transactions was refused and you want to know which ones could be retried once a person has approved them. Do not use it to decide whether a refusal was correct. It sorts by the rule and signals in the record. It does not re-run the policy.

## Running it

```bash
PARMANA_BASE_URL=https://<your-api-host> \
PARMANA_API_KEY=<operator key> \
node scripts/list-approval-refusals.mjs ids.txt --out report.json
```

- `ids.txt` holds one `businessTransactionId` per line, or a JSON array of strings.
- `PARMANA_API_KEY` is required. The script exits with code `2` if it is missing. The key is sent only as the `Authorization: Bearer` header and is never printed or written to the report.
- `PARMANA_BASE_URL` defaults to `http://localhost:3000`.
- `--out <file>` writes the full report as JSON. Without it, the script prints the counts and the IDs to retry.
- `--rule <ruleId>` names an approval rule. It can be given more than once. The default is `reject-manager-approval-required`, which is the 1.2.0 refund policy's approval rule.
- `--approval-signal <name>` names the signal that carries the human approval. The default is `managerApproved`.

## Categories

Each record is checked in this order:

| Category | Meaning | What to do |
|---|---|---|
| `retry_after_approval` | The refusal came from an approval rule, the approval signal is not true, and every other boolean signal is true. This matches the start-here guide's case for "a person's signed approval is needed". | Candidate for retry, once the steps below are complete. |
| `manual_review` | The refusal came from an approval rule, but the signals do not match that pattern. For example, the approval signal is true, or another boolean signal is false. | Read the record and decide. Do not retry automatically. |
| `final_refusal` | The refusal came from any other rule. | Do not retry. Report the refusal. |
| `not_found` | The server has no refusal record for the ID (HTTP `404`). | Check the ID. |
| `lookup_failed` | Any other HTTP status, a network failure or a bad response. The report includes the status or error. | Check the key, the URL and the server, then run again for these IDs. |

A `retry_after_approval` result is a candidate, not a guarantee. A retry still needs:

1. A new `businessTransactionId`. Resubmitting the same ID returns `409`.
2. A valid, unused approval from a registered approver, for the exact order and amount.
3. The same action, target and parameters as the approved request.
4. For refunds, a sourced amount, once the amount gap is closed. Until then, an approval for a wrong amount still passes.

Keep the original refusal. It is evidence of what was refused and why.

## Output

Without `--out`, the script prints the counts by category and one line per `retry_after_approval` ID.

With `--out`, the report has:

- `generatedAt`, `approvalRules` and `counts`
- `rows`, one per ID, with `businessTransactionId`, `category`, and for records that were found: `policy`, `matchedRuleId`, `reason`, `refusalRecordId` and `createdAt`. A `lookup_failed` row has `httpStatus` or `error`.

The report does not contain the API key or the signals. Check the source record before acting on a row.

## What it does not check

- It does not verify the signature on a Refusal Record. To check one, use `POST /refusal/verify` with the record.
- It does not re-run the policy or confirm the amount is correct.
- It does not check whether an approval exists for the transaction.
- It does not list refusals in bulk. You must supply the IDs.

## Status

- The script and its tests are in the repository (`scripts/list-approval-refusals.mjs`, `tests/scripts/list-approval-refusals.test.ts`).
- The tests run the script against an in-process server. They check the sorting, that only `GET` is used, the missing-key exit, the wrong-key `lookup_failed` case, and the signal-based classification.
- It has not been run against a live Parmana instance, so its behaviour against production records is unverified.
