# Operations: the accounts source adapter

> **REFERENCE ONLY. NOT A REAL RECORD.** This document is a reference. It is not a decision, an approval, a register entry, or a test result. Values marked ASSUMED are working assumptions, and nothing here enables a capability. Do not cite this document as evidence of any decision or approval.

**Status:** reference draft. Commands and endpoints are **PROPOSED** until the adapter exists.

## What it does

The adapter runs beside the accounts system. When Parmana asks for a claim, it looks up the value, signs an answer and returns it. It does not decide anything.

## Normal operation

- Parmana calls the adapter for each sourced claim during a decision.
- A decision that cannot get an answer refuses with `SOURCE_UNAVAILABLE`. That is the intended behaviour.
- Answers expire 5 minutes after they are observed (PROPOSED).

## Checks each day (during the first month, then weekly)

1. The adapter is up and answering a test query from staging.
2. The number of `SOURCE_UNAVAILABLE` refusals in the evidence log is in line with the expected rate. Record the rate.
3. No answer was refused as `REPLAYED`, `KEY_REVOKED` or `BAD_SIGNATURE` without a known cause.
4. The adapter's logs show no unexpected errors.

## When the adapter is down

1. Decisions for `erp:invoice-pay` refuse with `SOURCE_UNAVAILABLE`. Nothing is approved by default.
2. Tell the action owner and the operators that payments are refused until the adapter is back.
3. Restart the adapter. Check its health from staging.
4. Record the outage, the start and end times, and the number of refused decisions.

## When answers are refused

| Refusal          | Likely cause                              | First action                                         |
| ---------------- | ----------------------------------------- | ---------------------------------------------------- |
| `UNKNOWN_KEY`    | Adapter uses a key id not registered      | Check the key id in the adapter's config             |
| `BAD_SIGNATURE`  | Wrong private key, or the payload changed | Check the key pair matches the registered public key |
| `QUERY_MISMATCH` | Adapter answered a different query        | Check the adapter echoes the query exactly           |
| `REPLAYED`       | A nonce was reused                        | Check the nonce is random and new for each answer    |
| `EXPIRED`        | Answer took too long to reach Parmana     | Check clocks and the adapter's latency               |
| `NOT_YET_VALID`  | Clocks differ by more than 60 seconds     | Sync the clocks                                      |
| `KEY_REVOKED`    | The key was revoked                       | Register and approve a new key (see `08`)            |

## Logs and access

- The adapter logs each query and each answer's outcome, without the private key.
- Access to the adapter's logs and secrets is limited to the adapter operators, named in `08`.
