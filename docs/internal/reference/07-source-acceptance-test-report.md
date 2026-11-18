# Acceptance test report: the `accounts` source

> **REFERENCE ONLY. NOT A REAL RECORD.** This document is a reference. It is not a decision, an approval, a register entry, or a test result. Values marked ASSUMED are working assumptions, and nothing here enables a capability. Do not cite this document as evidence of any decision or approval.

**Status:** template. Fill in during the build and test steps in `ERP-INVOICE-PAY-SOURCE-BUILD.md` (section 8). Record only what was observed.

## Source details

- **Source name:** `accounts` (PROPOSED name)
- **Claims:** `invoice.amount`, `vendor.id`, `vendor.status` (ASSUMED)
- **Key id used by the adapter:**
- **Environment:** fixture adapter / staging / production

## Unit tests

| Test                                               | Result | Notes |
| -------------------------------------------------- | ------ | ----- |
| Source client returns a valid response unchanged   |        |       |
| Source client throws on timeout                    |        |       |
| Source client throws on HTTP 500                   |        |       |
| Source client throws on a network error            |        |       |
| Source client throws on a body that is not JSON    |        |       |
| Adapter answer verifies against the registered key |        |       |
| Wrong key gives `BAD_SIGNATURE` or `UNKNOWN_KEY`   |        |       |
| Query mismatch gives `QUERY_MISMATCH`              |        |       |
| Reused nonce gives `REPLAYED`                      |        |       |
| Expired answer gives `EXPIRED`                     |        |       |
| Answer not yet valid gives `NOT_YET_VALID`         |        |       |
| Revoked key gives `KEY_REVOKED`                    |        |       |

## End-to-end tests

| Test                                                   | Result | Evidence reference |
| ------------------------------------------------------ | ------ | ------------------ |
| Decision reaches the adapter and uses a verified value |        |                    |
| The evidence log records each answer and its check     |        |                    |
| Source unreachable gives `SOURCE_UNAVAILABLE`          |        |                    |

## Open items

- None recorded until the tests are run.
