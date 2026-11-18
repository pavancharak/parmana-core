# Policy version 2 reference documents

> **REFERENCE ONLY. NOT A REAL RECORD.** This document is a reference. It is not a decision, an approval, a register entry, or a test result. Values marked ASSUMED are working assumptions, and nothing here enables a capability. Do not cite this document as evidence of any decision or approval.

**Status:** reference drafts. Anything marked ASSUMED, PROPOSED or NOT DECIDED is not a decision yet. Each document says who must confirm it.

| #   | Document                               | Used for                               | Blocked by             |
| --- | -------------------------------------- | -------------------------------------- | ---------------------- |
| 01  | `01-crm-read-policy.md`                | The `crm:read` rules                   | Owner confirmation     |
| 02  | `02-decision-record-crm-read-rules.md` | The decision on the `crm:read` rules   | Owner decision         |
| 03  | `03-role-assignments.md`               | Who holds which register role          | Parmana owner grants   |
| 04  | `04-staging-test-report.md`            | The staging test record                | A staging run          |
| 05  | `05-erp-invoice-pay-business-rules.md` | The `erp:invoice-pay` rules and values | Owner decisions        |
| 06  | `06-decision-record-thresholds.md`     | The `erp:invoice-pay` thresholds       | Owner decision         |
| 07  | `07-source-acceptance-test-report.md`  | The accounts source's test record      | Source build and tests |
| 08  | `08-source-key-management.md`          | Keys for the accounts source           | Accounts system named  |
| 09  | `09-source-adapter-operations.md`      | Running the adapter                    | Adapter built          |
| 10  | `10-alerts-setup.md`                   | Alert channels and contacts            | Owner's channel choice |
| 11  | `11-evidence-review-procedure.md`      | Reviewing the evidence log             | Owner confirmation     |
| 12  | `12-change-record-template.md`         | Recording each production change       | None                   |
| 13  | `13-integrator-guide.md`               | Callers of the API                     | Capabilities enabled   |

Related runbooks and designs are in `docs/internal/runbooks/` and `docs/internal/designs/`.
