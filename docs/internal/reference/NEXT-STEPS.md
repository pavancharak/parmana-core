# Next steps: policy version 2 (`crm:read` and `erp:invoice-pay`)

> **REFERENCE ONLY. NOT A REAL RECORD.** This is a checklist to follow later. It is not a decision, an approval, a register entry or a test result. Nothing here enables a capability.

Work through the steps in order. Do not start a step until the one before it is done. Each step names the document to use and who must act.

## Status when this was written

- Reference documents, runbooks and the design are on `main`.
- Parmana 4.1.1 is published on npm and PyPI.
- Nothing is enabled on any deployment.

## Phase A: owner answers (blocks everything else)

| #   | Step                                                                              | Who      | Document                                                                   |
| --- | --------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| A1  | Confirm or replace the `crm:read` rules                                           | Mohinder | `01-crm-read-policy.md`, `02-decision-record-crm-read-rules.md`            |
| A2  | Set the `erp:invoice-pay` review and second-approval thresholds, and the currency | Mohinder | `05-erp-invoice-pay-business-rules.md`, `06-decision-record-thresholds.md` |
| A3  | Name the accounts system that holds the invoices                                  | Mohinder | `ERP-INVOICE-PAY-SOURCE-BUILD.md`, section 5                               |
| A4  | Choose the alert channel: email, SES bounce reports, or console only              | Owner    | `10-alerts-setup.md`                                                       |
| A5  | Confirm the people and the review frequency                                       | Owner    | `03-role-assignments.md`, `11-evidence-review-procedure.md`                |

## Phase B: `crm:read` (needs no source)

| #   | Step                                                                | Who                        | Document                                |
| --- | ------------------------------------------------------------------- | -------------------------- | --------------------------------------- |
| B1  | Grant the register roles to the named people                        | Parmana owner              | `03-role-assignments.md`                |
| B2  | Set the staging settings and the bootstrap owner (first start only) | Operator                   | `CRM-READ-ENABLEMENT.md`, step 1        |
| B3  | Register the action, its reviewers and its contacts                 | Action owner               | `CRM-READ-ENABLEMENT.md`, steps 3 to 5  |
| B4  | Propose the policy from A1, and check the validator accepts it      | Action owner               | `CRM-READ-ENABLEMENT.md`, step 6        |
| B5  | Approve the policy version, by someone other than the proposer      | Second approver            | `CRM-READ-ENABLEMENT.md`, step 7        |
| B6  | Run the tests, check the go-live list, then run the go-live gate    | Gate owner (Asha or Mamta) | `CRM-READ-ENABLEMENT.md`, steps 8 to 10 |
| B7  | Test decisions in staging, and record the results                   | Tester                     | `04-staging-test-report.md`             |
| B8  | Repeat in production with the same policy version                   | Operator                   | `12-change-record-template.md`          |
| B9  | Give the integrators the guide                                      | Owner                      | `13-integrator-guide.md`                |

## Phase C: source integration for `erp:invoice-pay` (needs A3)

| #   | Step                                                                         | Who                  | Document                                            |
| --- | ---------------------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| C1  | Confirm the design assumptions in section 2, with the accounts system's name | Owner                | `POLICY-V2-SOURCE-INTEGRATION.md`                   |
| C2  | Build the source client in Parmana, with its tests (**built, PR #733**)      | Engineer             | `ERP-INVOICE-PAY-SOURCE-BUILD.md`, sections 3 and 6 |
| C3  | Build the fixture adapter and its tests (**built, PR #733**)                 | Engineer             | `ERP-INVOICE-PAY-SOURCE-BUILD.md`, sections 5 and 6 |
| C4  | Review and merge the code                                                    | Owner and reviewers  | Pull request                                        |
| C5  | Register the fixture source in staging, and run the end-to-end test          | Operator             | `07-source-acceptance-test-report.md`               |
| C6  | Build the real adapter against the accounts system                           | Engineer             | `09-source-adapter-operations.md`                   |
| C7  | Set up the source key, and record it                                         | Owner and key holder | `08-source-key-management.md`                       |
| C8  | Register the real source in staging, and test again                          | Operator             | `07-source-acceptance-test-report.md`               |
| C9  | Approve the production source key, in writing                                | Owner                | `08-source-key-management.md`                       |
| C10 | Register the production source                                               | Operator             | `ERP-INVOICE-PAY-SOURCE-BUILD.md`, section 4        |

## Phase D: enable `erp:invoice-pay` (needs B9 and C10)

| #   | Step                                                  | Who          | Document                                                          |
| --- | ----------------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| D1  | Register the policy with the approved thresholds (A2) | Action owner | `POLICY-V2-ENABLEMENT.md`, section 4                              |
| D2  | Run the go-live gate                                  | Gate owner   | `POLICY-V2-ENABLEMENT.md`, section 4, step 13                     |
| D3  | Enable in staging, test, and record                   | Operator     | `POLICY-V2-ENABLEMENT.md`, section 6; `04-staging-test-report.md` |
| D4  | Enable in production, and record the change           | Operator     | `12-change-record-template.md`                                    |
| D5  | Set up the evidence review                            | Reviewers    | `11-evidence-review-procedure.md`                                 |

## Phase E: operations (ongoing)

- Daily or weekly adapter checks, and outages: `09-source-adapter-operations.md`.
- Evidence review: `11-evidence-review-procedure.md`.
- Key rotation, every 12 months, or after a compromise: `08-source-key-management.md`.
- Any production change: `12-change-record-template.md`.

## Things that must not happen

- Enabling a capability before its policy has passed the go-live gate.
- A person who owns or succeeds an action running its go-live gate.
- Using a fixture key in production.
- Treating a `SOURCE_UNAVAILABLE` refusal as a rejection.
- Recording a test result that was not observed.

## Where to find everything

- `docs/internal/reference/README.md`: the index of the reference documents.
- `docs/internal/runbooks/POLICY-V2-ENABLEMENT.md`: how a capability is enabled.
- `docs/internal/runbooks/CRM-READ-ENABLEMENT.md`: enabling `crm:read`.
- `docs/internal/designs/POLICY-V2-SOURCE-INTEGRATION.md`: the source design.
- `docs/internal/designs/ERP-INVOICE-PAY-SOURCE-BUILD.md`: the source build guide.
