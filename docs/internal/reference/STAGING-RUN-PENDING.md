# Procedure: the staging run of the source path (PENDING)

> **Status: PENDING.** This run needs the staging environment, its settings, and an adapter to call. The fixture adapter can run now; the real adapter cannot run until it is built (see `REAL-ADAPTER-BUILD-PENDING.md`).
>
> **REFERENCE ONLY. NOT A REAL RECORD.** This is a procedure. Its results are recorded only when a run is observed, in `04-staging-test-report.md` and `07-source-acceptance-test-report.md`.

## 0. What must be true before you start

| Requirement                                                                            | Who supplies it   | Status                            |
| -------------------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| The staging deployment: where it runs, and who can change its settings                 | Owner or operator | PENDING                           |
| A database for staging, migrated (`docker/local/migrate.sh` or the staging equivalent) | Operator          | PENDING                           |
| The staging source adapter: the fixture for now, the real one later                    | Engineering       | Fixture DONE (#733); real PENDING |
| The source's public key, registered in staging with a test key (not a production key)  | Operator          | PENDING                           |
| The staging adapter token, in the staging secret store                                 | Operator          | PENDING                           |

Never use a production key or live invoices in this run.

## 1. Set the staging settings

Set these in the staging deployment's configuration. Store the token in the secret store, never in the repository or in chat.

| Setting                          | Value                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| `PARMANA_POLICY_V2_DECISIONS`    | `true`                                                       |
| `PARMANA_POLICY_V2_CAPABILITIES` | `erp:invoice-pay` for this run only; remove it after the run |
| `PARMANA_POLICY_V2_SOURCE_URL`   | the staging adapter's https URL                              |
| `PARMANA_POLICY_V2_SOURCE_TOKEN` | the staging adapter token                                    |
| Database URL                     | the staging database                                         |

A URL without a token stops the server at start-up. Restart the server after each change.

## 2. Register the source in staging

Use the register routes (see `POLICY-V2-ENABLEMENT.md`, section 4):

1. `POST /sources` with the name `accounts`, the public key of the staging key, its key id, and the claims `invoice.amount` (USD), `vendor.id`, `vendor.status`.
2. `POST /sources/accounts/approve`, by the second approver.
3. Check the source is trusted: its status must be `trusted` before any answer is used.

Record the key id in `08-source-key-management.md` (key log).

## 3. Test the adapter on its own

Before a decision, check the adapter answers and the answers verify:

1. `POST {PARMANA_POLICY_V2_SOURCE_URL}/answers` with a known invoice, and the token. Expect HTTP 200.
2. Check the answer verifies with the registered key (`verifySourceAnswer`).
3. Check each refusal: a wrong token (401), an unknown invoice (404), an incomplete query (400).

Record each result in `07-source-acceptance-test-report.md`.

## 4. Test a decision end to end in staging

1. Make a decision for `erp:invoice-pay` with a test invoice under the limit. The outcome must be `APPROVE` with `released: false`, and the evidence record must show the sourced amount and its check.
2. Make a decision for a test invoice over the limit. The outcome must be `REJECT`.
3. Stop the adapter. Make a decision. The refusal must be `SOURCE_UNAVAILABLE`, not an approval.
4. Start the adapter. Use an expired answer, if the adapter can produce one. The refusal must be `EXPIRED`.
5. Replay one recorded decision (`policy_v2_replay` or `policyV2Replay`). It must reproduce.

Each result is observed, then recorded in `04-staging-test-report.md`. Do not record a result you did not see.

## 5. Clean up

1. Remove `erp:invoice-pay` from `PARMANA_POLICY_V2_CAPABILITIES` unless the owner has approved enabling it in staging. Restart.
2. Revoke the test source key if the run is finished (`08`, Compromise).
3. Keep the evidence records. They are the record of the run.

## 6. Sign-off

| Name | Role                     | Date |
| ---- | ------------------------ | ---- |
|      | Operator (ran the steps) |      |
|      | Action owner             |      |

The staging run is complete only when section 4 is recorded with observed results, and the owner has signed the report.
